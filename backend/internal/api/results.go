package api

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

// HolderResultRow is one agenda's totals as shown to shareholders (no per-holder data, no verdict).
type HolderResultRow struct {
	TermID          string  `json:"term_id"`
	Name            string  `json:"name"`
	VoteType        string  `json:"vote_type"`
	Status          string  `json:"status"`
	EligibleHolders int     `json:"eligible_holders"`
	Eligible        int64   `json:"eligible"`
	NovoteHolders   int64   `json:"novote_holders"`
	NovoteShares    int64   `json:"novote_shares"`
	Total           Tally   `json:"total"`
	AgreePct        float64 `json:"agree_pct"`
	DisagreePct     float64 `json:"disagree_pct"`
	AbstainPct      float64 `json:"abstain_pct"`
	SpoiledPct      float64 `json:"spoiled_pct"`
}

// onlineResults returns the totals of open and closed agendas, only while an admin has published results.
func (s *Server) onlineResults(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	out := echo.Map{"published": m.ResultsPublished, "terms": []HolderResultRow{}}
	if !m.ResultsPublished {
		return c.JSON(http.StatusOK, out)
	}
	rs, err := s.computeResults(ctx, m.Year)
	if err != nil {
		return err
	}
	rows := []HolderResultRow{}
	for _, r := range rs {
		if r.Status == "pending" {
			continue
		}
		rows = append(rows, HolderResultRow{TermID: r.TermID, Name: r.Name, VoteType: r.VoteType, Status: r.Status,
			EligibleHolders: r.EligibleHolders, Eligible: r.Eligible, NovoteHolders: r.NovoteHolders, NovoteShares: r.NovoteShares,
			Total: r.Total, AgreePct: r.AgreePct, DisagreePct: r.DisPct, AbstainPct: r.AbstainPct, SpoiledPct: r.SpoiledPct})
	}
	out["terms"] = rows
	return c.JSON(http.StatusOK, out)
}

// RollRow is one registered holder with the vote held on one agenda (roll call, for checking against the ballots).
type RollRow struct {
	AccountID string `json:"account_id"`
	Name      string `json:"name"`
	Shares    int    `json:"shares"`
	Channel   string `json:"channel"` // onsite | online
	State     string `json:"state"`   // voted | not_voted (counts as agree) | no_right
	Agree     int    `json:"agree"`
	Disagree  int    `json:"disagree"`
	Abstain   int    `json:"abstain"`
	Spoiled   int    `json:"spoiled"`
	By        string `json:"by"` // who recorded it ("online" = the holder), empty if not voted
	At        string `json:"at"`
}

func (s *Server) voteRoll(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	term := strings.TrimSpace(c.QueryParam("term_id"))
	var pk int
	var status string
	var closevote sql.NullTime
	if err := s.DB.QueryRowContext(ctx, `SELECT id,status,closevote FROM termpartner WHERE meeting_year=? AND term_id=?`, m.Year, term).Scan(&pk, &status, &closevote); err != nil {
		return notFound("agenda not found")
	}
	out := []RollRow{}

	on, err := s.DB.QueryContext(ctx, `
		SELECT rs.id_acc, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), r.mq_share, rs.full_term, rs.voted,
		       rs.disagree_term, rs.noc_term, rs.fail_term, COALESCE(rs.voted_by,''), COALESCE(DATE_FORMAT(rs.voted_at,'%Y-%m-%dT%H:%i:%s'),'')
		FROM regissub rs JOIN regismaim r ON r.meeting_year=rs.meeting_year AND r.id_acc=rs.id_acc
		LEFT JOIN holder h ON h.Account_id=rs.id_acc
		WHERE rs.meeting_year=? AND rs.id_term=?`, m.Year, pk)
	if err != nil {
		return err
	}
	for on.Next() {
		x := RollRow{Channel: "onsite"}
		var name sql.NullString
		var full, d, n, f int
		var voted bool
		if err := on.Scan(&x.AccountID, &name, &x.Shares, &full, &voted, &d, &n, &f, &x.By, &x.At); err != nil {
			on.Close()
			return err
		}
		x.Name = name.String
		switch {
		case full == 0:
			x.State = "no_right"
		case voted:
			x.State, x.Agree, x.Disagree, x.Abstain, x.Spoiled = "voted", full-d-n-f, d, n, f
		default:
			x.State, x.Agree = "not_voted", full
			x.By, x.At = "", ""
		}
		out = append(out, x)
	}
	on.Close()

	ol, err := s.DB.QueryContext(ctx, `
		SELECT o.acc_id, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(h.Q_share,0), COALESCE(v.vote_choice,''),
		       COALESCE(DATE_FORMAT(v.voted_at,'%Y-%m-%dT%H:%i:%s'),''),
		       EXISTS(SELECT 1 FROM novote nv WHERE nv.meeting_year=o.meeting_year AND nv.id_term=? AND nv.acc_novote=o.acc_id),
		       o.registered_at
		FROM online_registration o JOIN holder h ON h.Account_id=o.acc_id
		LEFT JOIN votes_online v ON v.meeting_year=o.meeting_year AND v.acc_id=o.acc_id AND v.term_id=?
		WHERE o.meeting_year=? AND o.status IN ('verified','voted')`, term, term, m.Year)
	if err != nil {
		return err
	}
	for ol.Next() {
		x := RollRow{Channel: "online"}
		var name sql.NullString
		var choice string
		var noRight bool
		var registered sql.NullTime
		if err := ol.Scan(&x.AccountID, &name, &x.Shares, &choice, &x.At, &noRight, &registered); err != nil {
			ol.Close()
			return err
		}
		x.Name = name.String
		late := status == "closed" && closevote.Valid && registered.Valid && registered.Time.After(closevote.Time) && choice == ""
		switch {
		case noRight || late:
			x.State, x.At = "no_right", ""
		case choice == "":
			x.State, x.Agree, x.At = "not_voted", x.Shares, ""
		default:
			x.State, x.By = "voted", "online"
			switch choice {
			case "agree":
				x.Agree = x.Shares
			case "disagree":
				x.Disagree = x.Shares
			case "abstain":
				x.Abstain = x.Shares
			case "spoiled":
				x.Spoiled = x.Shares
			}
		}
		out = append(out, x)
	}
	ol.Close()
	return c.JSON(http.StatusOK, out)
}
