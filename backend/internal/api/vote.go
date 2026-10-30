package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

type voteReq struct {
	AccountID string `json:"account_id"`
	TermID    string `json:"term_id"`
	Choice    string `json:"choice"`
	Overwrite bool   `json:"overwrite"` // must be true to replace a vote that was already recorded
	Shares    int    `json:"shares"`    // optional: vote with fewer shares than held; remainder counts as agree
	// Split divides the holder's shares between choices (custodians). It must add up to the full shares.
	Split *struct {
		Agree    int `json:"agree"`
		Disagree int `json:"disagree"`
		Abstain  int `json:"abstain"`
		Spoiled  int `json:"spoiled"`
	} `json:"split"`
}

// voteOnsite records a vote cast by staff on behalf of a registered holder.
// regissub keeps shares per bucket; "agree" is implicit (full - disagree - abstain - spoiled).
func (s *Server) voteOnsite(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	var r voteReq
	if err := c.Bind(&r); err != nil || r.AccountID == "" || r.TermID == "" || (!validChoice[r.Choice] && r.Split == nil) {
		return bad("account_id, term_id and a valid choice (or split) are required")
	}
	var termPK int
	var status, vtype string
	err = s.DB.QueryRowContext(ctx, `SELECT id,status,vote_type FROM termpartner WHERE meeting_year=? AND term_id=?`, m.Year, r.TermID).
		Scan(&termPK, &status, &vtype)
	if err == sql.ErrNoRows {
		return notFound("agenda not found")
	} else if err != nil {
		return err
	}
	// Advance-entry mode lets staff key votes for agendas that are still pending (preparation day).
	if status != "open" && !(m.AdvanceEntry && status == "pending") {
		return conflict("agenda is not open for voting")
	}
	if vtype == "info" {
		return conflict("this agenda is for acknowledgement only")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var full, pd, pn, pf int
	var wasVoted bool
	var prevBy sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT full_term,voted,disagree_term,noc_term,fail_term,voted_by FROM regissub WHERE meeting_year=? AND id_term=? AND id_acc=? FOR UPDATE`,
		m.Year, termPK, r.AccountID).Scan(&full, &wasVoted, &pd, &pn, &pf, &prevBy)
	if err == sql.ErrNoRows {
		return notFound("holder is not registered onsite")
	} else if err != nil {
		return err
	}
	if full == 0 {
		return conflict("holder has no voting right on this agenda")
	}
	if wasVoted && !r.Overwrite {
		return conflict("already_voted")
	}
	n := r.Shares
	if n <= 0 || n > full {
		n = full
	}
	dis, noc, fail := 0, 0, 0
	if sp := r.Split; sp != nil {
		if sp.Agree < 0 || sp.Disagree < 0 || sp.Abstain < 0 || sp.Spoiled < 0 {
			return bad("split amounts cannot be negative")
		}
		if sp.Agree+sp.Disagree+sp.Abstain+sp.Spoiled != full {
			return bad(fmt.Sprintf("split must add up to %d shares", full))
		}
		dis, noc, fail = sp.Disagree, sp.Abstain, sp.Spoiled
		n = full
		r.Choice = "split"
	}
	switch r.Choice {
	case "disagree":
		dis = n
	case "abstain":
		noc = n
	case "spoiled":
		fail = n
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE regissub SET disagree_term=?,noc_term=?,fail_term=?,voted=1,voted_at=NOW(),voted_by=? WHERE meeting_year=? AND id_term=? AND id_acc=?`,
		dis, noc, fail, actor(c), m.Year, termPK, r.AccountID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	d := echo.Map{"term": r.TermID, "choice": r.Choice, "shares": n, "by": actor(c)}
	if wasVoted {
		d["previous"] = echo.Map{"agree": full - pd - pn - pf, "disagree": pd, "abstain": pn, "spoiled": pf, "by": prevBy.String}
	}
	s.audit(c, r.AccountID, "vote_onsite", d)
	return c.NoContent(http.StatusNoContent)
}

// clearVote resets a recorded onsite vote back to "not voted" (staff correcting a mistake).
func (s *Server) clearVote(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	acc, term := c.Param("acc"), c.Param("term")
	var termPK int
	var status string
	if err := s.DB.QueryRowContext(ctx, `SELECT id,status FROM termpartner WHERE meeting_year=? AND term_id=?`, m.Year, term).Scan(&termPK, &status); err != nil {
		return notFound("agenda not found")
	}
	if status == "closed" {
		return conflict("agenda already closed")
	}
	var full, pd, pn, pf int
	var voted bool
	err = s.DB.QueryRowContext(ctx, `SELECT full_term,voted,disagree_term,noc_term,fail_term FROM regissub WHERE meeting_year=? AND id_term=? AND id_acc=?`,
		m.Year, termPK, acc).Scan(&full, &voted, &pd, &pn, &pf)
	if err == sql.ErrNoRows {
		return notFound("holder is not registered onsite")
	} else if err != nil {
		return err
	}
	if !voted {
		return c.NoContent(http.StatusNoContent)
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE regissub SET disagree_term=0,noc_term=0,fail_term=0,voted=0,voted_at=NULL,voted_by=NULL WHERE meeting_year=? AND id_term=? AND id_acc=?`,
		m.Year, termPK, acc); err != nil {
		return err
	}
	s.audit(c, acc, "vote_clear", echo.Map{"term": term, "previous": echo.Map{"agree": full - pd - pn - pf, "disagree": pd, "abstain": pn, "spoiled": pf}})
	return c.NoContent(http.StatusNoContent)
}

type VoteRow struct {
	TermID string `json:"term_id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Voted  bool   `json:"voted"`
	Choice string `json:"choice"` // agree | disagree | abstain | spoiled | split ("" if not voted)
	Shares int    `json:"shares"`
	// per-choice shares once voted
	Agree    int `json:"agree"`
	Disagree int `json:"disagree"`
	Abstain  int `json:"abstain"`
	Spoiled  int `json:"spoiled"`
}

// holderVotes lists a registered holder's vote per agenda (onsite).
func (s *Server) holderVotes(c echo.Context) error {
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT t.term_id, COALESCE(t.term_name,''), t.status, rs.voted, rs.full_term, rs.disagree_term, rs.noc_term, rs.fail_term
		FROM regissub rs JOIN termpartner t ON t.id=rs.id_term
		WHERE rs.meeting_year=? AND rs.id_acc=?`, m.Year, c.Param("acc"))
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []VoteRow{}
	for rows.Next() {
		var v VoteRow
		var dis, noc, fail int
		if err := rows.Scan(&v.TermID, &v.Name, &v.Status, &v.Voted, &v.Shares, &dis, &noc, &fail); err != nil {
			return err
		}
		if v.Voted {
			v.Agree, v.Disagree, v.Abstain, v.Spoiled = v.Shares-dis-noc-fail, dis, noc, fail
			kinds := 0
			for _, x := range []int{v.Agree, dis, noc, fail} {
				if x > 0 {
					kinds++
				}
			}
			switch {
			case kinds > 1:
				v.Choice = "split"
			case dis > 0:
				v.Choice = "disagree"
			case noc > 0:
				v.Choice = "abstain"
			case fail > 0:
				v.Choice = "spoiled"
			default:
				v.Choice = "agree"
			}
		}
		out = append(out, v)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && termLess(out[j].TermID, out[j-1].TermID); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return c.JSON(http.StatusOK, out)
}

// ---- late arrivals ----

type LateRow struct {
	AccountID string  `json:"account_id"`
	Name      string  `json:"name"`
	Shares    float64 `json:"shares"`
	ArrivedAt string  `json:"arrived_at"`
	TermID    string  `json:"term_id"`
}

func (s *Server) listLate(c echo.Context) error {
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT l.AccID, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(l.CoopQty,0),
		       DATE_FORMAT(l.LastDate,'%Y-%m-%d %H:%i:%s'), COALESCE(l.TermID,'')
		FROM holderlate l LEFT JOIN holder h ON h.Account_id=l.AccID
		WHERE l.meeting_year=? ORDER BY l.LastDate DESC`, m.Year)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []LateRow{}
	for rows.Next() {
		var l LateRow
		var name sql.NullString
		if err := rows.Scan(&l.AccountID, &name, &l.Shares, &l.ArrivedAt, &l.TermID); err != nil {
			return err
		}
		l.Name = name.String
		out = append(out, l)
	}
	return c.JSON(http.StatusOK, out)
}

// addLate stamps a registered holder's arrival time and the agenda that was open.
func (s *Server) addLate(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	var r struct {
		AccountID string `json:"account_id"`
	}
	if err := c.Bind(&r); err != nil || r.AccountID == "" {
		return bad("account_id required")
	}
	var shares int
	err = s.DB.QueryRowContext(ctx, `SELECT mq_share FROM regismaim WHERE meeting_year=? AND id_acc=?`, m.Year, r.AccountID).Scan(&shares)
	if err == sql.ErrNoRows {
		return conflict("register the holder first")
	} else if err != nil {
		return err
	}
	var term sql.NullString
	s.DB.QueryRowContext(ctx, `SELECT term_id FROM termpartner WHERE meeting_year=? AND status='open' ORDER BY id LIMIT 1`, m.Year).Scan(&term)
	if _, err := s.DB.ExecContext(ctx,
		`INSERT INTO holderlate(meeting_year,AccID,TermID,CoopQty,LastDate) VALUES(?,?,?,?,NOW())`,
		m.Year, r.AccountID, term.String, shares); err != nil {
		return conflict("late arrival already recorded")
	}
	s.audit(c, r.AccountID, "late_arrival", echo.Map{"term": term.String})
	return c.NoContent(http.StatusCreated)
}

// ---- novote (holders without voting right on an agenda) ----

type NovoteRow struct {
	ID        int    `json:"id"`
	TermID    string `json:"term_id"`
	AccountID string `json:"account_id"`
	Name      string `json:"name"`
	Shares    int    `json:"shares"`
}

func (s *Server) listNovote(c echo.Context) error {
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	q := `SELECT id_novote,COALESCE(id_term,''),acc_novote,COALESCE(name_novote,''),COALESCE(share_novote,0) FROM novote WHERE meeting_year=?`
	args := []any{m.Year}
	if t := c.QueryParam("term_id"); t != "" {
		q += ` AND id_term=?`
		args = append(args, t)
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), q+` ORDER BY id_novote`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []NovoteRow{}
	for rows.Next() {
		var n NovoteRow
		if err := rows.Scan(&n.ID, &n.TermID, &n.AccountID, &n.Name, &n.Shares); err != nil {
			return err
		}
		out = append(out, n)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) addNovote(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	var r struct {
		AccountID string `json:"account_id"`
		TermID    string `json:"term_id"`
		Force     bool   `json:"force"` // confirm discarding a vote that was already recorded
	}
	if err := c.Bind(&r); err != nil || r.AccountID == "" || r.TermID == "" {
		return bad("account_id and term_id required")
	}
	var termPK int
	var status string
	if err := s.DB.QueryRowContext(ctx, `SELECT id,status FROM termpartner WHERE meeting_year=? AND term_id=?`, m.Year, r.TermID).Scan(&termPK, &status); err != nil {
		return notFound("agenda not found")
	}
	if status == "closed" {
		return conflict("agenda already closed")
	}
	name, shares, err := holderInfo(ctx, s.DB, r.AccountID)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var dup int
	tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM novote WHERE meeting_year=? AND id_term=? AND acc_novote=?`, m.Year, r.TermID, r.AccountID).Scan(&dup)
	if dup > 0 {
		return conflict("already excluded from this agenda")
	}
	// a vote already recorded for this agenda is discarded - only with explicit confirmation
	var hadOnsite, hadOnline int
	tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM regissub WHERE meeting_year=? AND id_term=? AND id_acc=? AND voted=1`, m.Year, termPK, r.AccountID).Scan(&hadOnsite)
	tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM votes_online WHERE meeting_year=? AND term_id=? AND acc_id=?`, m.Year, r.TermID, r.AccountID).Scan(&hadOnline)
	if (hadOnsite > 0 || hadOnline > 0) && !r.Force {
		return conflict("has_votes")
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO novote(meeting_year,id_term,acc_novote,name_novote,share_novote) VALUES(?,?,?,?,?)`,
		m.Year, r.TermID, r.AccountID, name, shares); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE regissub SET full_term=0,disagree_term=0,noc_term=0,fail_term=0,voted=0 WHERE meeting_year=? AND id_term=? AND id_acc=?`,
		m.Year, termPK, r.AccountID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM votes_online WHERE meeting_year=? AND term_id=? AND acc_id=?`, m.Year, r.TermID, r.AccountID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, r.AccountID, "novote_add", echo.Map{"term": r.TermID, "discarded_onsite": hadOnsite > 0, "discarded_online": hadOnline > 0})
	return c.NoContent(http.StatusCreated)
}

func (s *Server) deleteNovote(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return bad("invalid id")
	}
	var term, acc string
	if err := s.DB.QueryRowContext(ctx, `SELECT id_term,acc_novote FROM novote WHERE id_novote=? AND meeting_year=?`, id, m.Year).Scan(&term, &acc); err != nil {
		return notFound("not found")
	}
	var tstatus string
	s.DB.QueryRowContext(ctx, `SELECT status FROM termpartner WHERE meeting_year=? AND term_id=?`, m.Year, term).Scan(&tstatus)
	if tstatus == "closed" {
		return conflict("agenda already closed")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM novote WHERE id_novote=?`, id); err != nil {
		return err
	}
	// restore voting right for onsite registrants
	if _, err := tx.ExecContext(ctx, `UPDATE regissub rs JOIN termpartner t ON t.id=rs.id_term AND t.term_id=?
		JOIN regismaim r ON r.meeting_year=rs.meeting_year AND r.id_acc=rs.id_acc
		SET rs.full_term=r.mq_share WHERE rs.meeting_year=? AND rs.id_acc=?`, term, m.Year, acc); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, acc, "novote_remove", echo.Map{"term": term})
	return c.NoContent(http.StatusNoContent)
}
