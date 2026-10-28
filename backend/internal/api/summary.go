package api

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
)

type Tally struct {
	Agree    int64 `json:"agree"`
	Disagree int64 `json:"disagree"`
	Abstain  int64 `json:"abstain"`
	Spoiled  int64 `json:"spoiled"`
}

func (t Tally) Sum() int64 { return t.Agree + t.Disagree + t.Abstain + t.Spoiled }

type TermResult struct {
	ID         int     `json:"id"`
	TermID     string  `json:"term_id"`
	Name       string  `json:"name"`
	Status     string  `json:"status"`
	VoteType   string  `json:"vote_type"`
	Onsite     Tally   `json:"onsite"`
	Online     Tally   `json:"online"`
	Total      Tally   `json:"total"`
	AgreePct   float64 `json:"agree_pct"`
	DisPct     float64 `json:"disagree_pct"`
	AbstainPct float64 `json:"abstain_pct"`
	SpoiledPct float64 `json:"spoiled_pct"`
	VotedCount int     `json:"voted_count"` // holders who actively cast a vote
	Eligible   int64   `json:"eligible"`    // shares entitled to vote on this agenda
	Result     string  `json:"result"`      // pending | in_progress | pass | fail | info
}

// decide applies the pass rule per agenda type.
//
//	ordinary:  agree > 50% of (agree + disagree)            (abstain / spoiled excluded)
//	special:   agree >= 75% of (agree + disagree + abstain)
//	unanimous: no disagree and no abstain
//
// NOTE: bases follow common Thai AGM practice; confirm against the company's articles.
func decide(t Tally, voteType string) string {
	switch voteType {
	case "info":
		return "info"
	case "special":
		base := t.Agree + t.Disagree + t.Abstain
		if base > 0 && t.Agree*4 >= base*3 {
			return "pass"
		}
	case "unanimous":
		if t.Agree > 0 && t.Disagree == 0 && t.Abstain == 0 {
			return "pass"
		}
	default:
		base := t.Agree + t.Disagree
		if base > 0 && t.Agree*2 > base {
			return "pass"
		}
	}
	return "fail"
}

func pct(n, d int64) float64 {
	if d == 0 {
		return 0
	}
	return float64(int(float64(n)/float64(d)*10000+0.5)) / 100
}

// computeResults aggregates onsite (regissub) and online (votes_online) votes per agenda.
// Registered holders who did not vote are counted as "agree" once the agenda is open/closed.
func (s *Server) computeResults(ctx context.Context, year string) ([]TermResult, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT id,term_id,COALESCE(term_name,''),status,vote_type FROM termpartner WHERE meeting_year=?`, year)
	if err != nil {
		return nil, err
	}
	byID := map[int]*TermResult{}
	order := []*TermResult{}
	for rows.Next() {
		var r TermResult
		if err := rows.Scan(&r.ID, &r.TermID, &r.Name, &r.Status, &r.VoteType); err != nil {
			rows.Close()
			return nil, err
		}
		byID[r.ID] = &r
		order = append(order, &r)
	}
	rows.Close()

	on, err := s.DB.QueryContext(ctx,
		`SELECT id_term, COALESCE(SUM(full_term-disagree_term-noc_term-fail_term),0), COALESCE(SUM(disagree_term),0),
		        COALESCE(SUM(noc_term),0), COALESCE(SUM(fail_term),0), COALESCE(SUM(voted),0), COALESCE(SUM(full_term),0)
		 FROM regissub WHERE meeting_year=? GROUP BY id_term`, year)
	if err != nil {
		return nil, err
	}
	for on.Next() {
		var id int
		var t Tally
		var voted, elig int64
		if err := on.Scan(&id, &t.Agree, &t.Disagree, &t.Abstain, &t.Spoiled, &voted, &elig); err != nil {
			on.Close()
			return nil, err
		}
		if r := byID[id]; r != nil {
			r.Onsite, r.VotedCount, r.Eligible = t, r.VotedCount+int(voted), r.Eligible+elig
		}
	}
	on.Close()

	ol, err := s.DB.QueryContext(ctx,
		`SELECT t.id,
		   COALESCE(SUM(CASE WHEN v.vote_choice IS NULL OR v.vote_choice='agree' THEN h.Q_share END),0),
		   COALESCE(SUM(CASE WHEN v.vote_choice='disagree' THEN h.Q_share END),0),
		   COALESCE(SUM(CASE WHEN v.vote_choice='abstain' THEN h.Q_share END),0),
		   COALESCE(SUM(CASE WHEN v.vote_choice='spoiled' THEN h.Q_share END),0),
		   COUNT(v.id), COALESCE(SUM(h.Q_share),0)
		 FROM online_registration o
		 JOIN holder h ON h.Account_id=o.acc_id
		 JOIN termpartner t ON t.meeting_year=o.meeting_year
		 LEFT JOIN votes_online v ON v.meeting_year=o.meeting_year AND v.acc_id=o.acc_id AND v.term_id=t.term_id
		 LEFT JOIN novote nv ON nv.meeting_year=o.meeting_year AND nv.acc_novote=o.acc_id AND nv.id_term=t.term_id
		 WHERE o.meeting_year=? AND o.status IN ('verified','voted') AND nv.id_novote IS NULL
		 GROUP BY t.id`, year)
	if err != nil {
		return nil, err
	}
	for ol.Next() {
		var id int
		var t Tally
		var voted, elig int64
		if err := ol.Scan(&id, &t.Agree, &t.Disagree, &t.Abstain, &t.Spoiled, &voted, &elig); err != nil {
			ol.Close()
			return nil, err
		}
		if r := byID[id]; r != nil {
			r.Online, r.VotedCount, r.Eligible = t, r.VotedCount+int(voted), r.Eligible+elig
		}
	}
	ol.Close()

	out := make([]TermResult, 0, len(order))
	for _, r := range order {
		if r.Status == "pending" {
			r.Onsite, r.Online, r.Eligible, r.VotedCount = Tally{}, Tally{}, 0, 0
		}
		r.Total = Tally{
			Agree: r.Onsite.Agree + r.Online.Agree, Disagree: r.Onsite.Disagree + r.Online.Disagree,
			Abstain: r.Onsite.Abstain + r.Online.Abstain, Spoiled: r.Onsite.Spoiled + r.Online.Spoiled,
		}
		sum := r.Total.Sum()
		r.AgreePct, r.DisPct = pct(r.Total.Agree, sum), pct(r.Total.Disagree, sum)
		r.AbstainPct, r.SpoiledPct = pct(r.Total.Abstain, sum), pct(r.Total.Spoiled, sum)
		switch r.Status {
		case "pending":
			r.Result = "pending"
		case "open":
			r.Result = "in_progress"
		default:
			r.Result = decide(r.Total, r.VoteType)
		}
		out = append(out, *r)
	}
	sortResults(out)
	return out, nil
}

func sortResults(rs []TermResult) {
	for i := 1; i < len(rs); i++ {
		for j := i; j > 0 && termLess(rs[j].TermID, rs[j-1].TermID); j-- {
			rs[j], rs[j-1] = rs[j-1], rs[j]
		}
	}
}

type Stats struct {
	Holders       int64   `json:"holders"`
	TotalShares   int64   `json:"total_shares"`
	OnsiteCount   int64   `json:"onsite_count"`
	OnsiteShares  int64   `json:"onsite_shares"`
	OnlineCount   int64   `json:"online_count"`
	OnlineShares  int64   `json:"online_shares"`
	LateCount     int64   `json:"late_count"`
	LateShares    int64   `json:"late_shares"`
	QuorumPct     float64 `json:"quorum_pct"`
	QuorumNeeded  float64 `json:"quorum_required_pct"`
	QuorumReached bool    `json:"quorum_reached"`
}

func (s *Server) statsOf(ctx context.Context, m *Meeting) (*Stats, error) {
	var st Stats
	q := func(dst any, query string, args ...any) error {
		return s.DB.QueryRowContext(ctx, query, args...).Scan(dst)
	}
	if err := q(&st.Holders, `SELECT COUNT(*) FROM holder`); err != nil {
		return nil, err
	}
	q(&st.TotalShares, `SELECT COALESCE(SUM(Q_share),0) FROM holder`)
	q(&st.OnsiteCount, `SELECT COUNT(*) FROM regismaim WHERE meeting_year=?`, m.Year)
	q(&st.OnsiteShares, `SELECT COALESCE(SUM(mq_share),0) FROM regismaim WHERE meeting_year=?`, m.Year)
	q(&st.OnlineCount, `SELECT COUNT(*) FROM online_registration WHERE meeting_year=? AND status IN ('verified','voted')`, m.Year)
	q(&st.OnlineShares, `SELECT COALESCE(SUM(h.Q_share),0) FROM online_registration o JOIN holder h ON h.Account_id=o.acc_id
		WHERE o.meeting_year=? AND o.status IN ('verified','voted')`, m.Year)
	q(&st.LateCount, `SELECT COUNT(*) FROM holderlate WHERE meeting_year=?`, m.Year)
	q(&st.LateShares, `SELECT COALESCE(SUM(CoopQty),0) FROM holderlate WHERE meeting_year=?`, m.Year)
	st.QuorumPct = pct(st.OnsiteShares+st.OnlineShares, st.TotalShares)
	st.QuorumNeeded = m.QuorumPct
	st.QuorumReached = st.QuorumPct >= m.QuorumPct
	return &st, nil
}

func (s *Server) stats(c echo.Context) error {
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	st, err := s.statsOf(c.Request().Context(), m)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, st)
}

// summary serves the current meeting, or :year when called from the history route.
func (s *Server) summary(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.meetingByYear(ctx, c.Param("year"))
	if err != nil {
		return err
	}
	st, err := s.statsOf(ctx, m)
	if err != nil {
		return err
	}
	rs, err := s.computeResults(ctx, m.Year)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"meeting": m, "stats": st, "terms": rs})
}

func (s *Server) exportSummary(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.meetingByYear(ctx, c.QueryParam("year"))
	if err != nil {
		return err
	}
	rs, err := s.computeResults(ctx, m.Year)
	if err != nil {
		return err
	}
	c.Response().Header().Set(echo.HeaderContentType, "text/csv; charset=utf-8")
	c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="summary_%s.csv"`, m.Year))
	c.Response().Write([]byte("\xEF\xBB\xBF")) // BOM so Excel reads Thai correctly
	w := csv.NewWriter(c.Response())
	w.Write([]string{"วาระ", "ชื่อวาระ", "เห็นด้วย", "ไม่เห็นด้วย", "งดออกเสียง", "บัตรเสีย", "ผล"})
	for _, r := range rs {
		w.Write([]string{r.TermID, csvSafe(r.Name),
			fmt.Sprint(r.Total.Agree), fmt.Sprint(r.Total.Disagree), fmt.Sprint(r.Total.Abstain), fmt.Sprint(r.Total.Spoiled), r.Result})
	}
	w.Flush()
	s.audit(c, "", "export_summary", echo.Map{"year": m.Year})
	return w.Error()
}

// csvSafe neutralises spreadsheet formula injection.
func csvSafe(v string) string {
	if v != "" && (v[0] == '=' || v[0] == '+' || v[0] == '-' || v[0] == '@') {
		return "'" + v
	}
	return v
}
