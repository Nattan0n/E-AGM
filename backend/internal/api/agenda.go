package api

import (
	"database/sql"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

type Agenda struct {
	ID       int    `json:"id"`
	TermID   string `json:"term_id"`
	Name     string `json:"name"`
	NameEN   string `json:"name_en"`
	Status   string `json:"status"` // pending | open | closed
	VoteType string `json:"vote_type"`
}

var validVoteType = map[string]bool{"ordinary": true, "special": true, "unanimous": true, "info": true}

func parentOf(termID string) string {
	if i := strings.IndexByte(termID, '.'); i >= 0 {
		return termID[:i]
	}
	return termID
}

// termLess orders "2" < "10" and "5" < "5.1" < "5.10" numerically.
func termLess(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) && i < len(pb); i++ {
		x, ex := strconv.Atoi(pa[i])
		y, ey := strconv.Atoi(pb[i])
		if ex != nil || ey != nil {
			if pa[i] != pb[i] {
				return pa[i] < pb[i]
			}
			continue
		}
		if x != y {
			return x < y
		}
	}
	return len(pa) < len(pb)
}

func (s *Server) agendasOf(c echo.Context, year string) ([]Agenda, error) {
	rows, err := s.DB.QueryContext(c.Request().Context(),
		`SELECT id,term_id,COALESCE(term_name,''),COALESCE(term_name_en,''),status,vote_type FROM termpartner WHERE meeting_year=?`, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Agenda{}
	for rows.Next() {
		var a Agenda
		if err := rows.Scan(&a.ID, &a.TermID, &a.Name, &a.NameEN, &a.Status, &a.VoteType); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return termLess(out[i].TermID, out[j].TermID) })
	return out, nil
}

func (s *Server) listAgendas(c echo.Context) error {
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	ags, err := s.agendasOf(c, m.Year)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, ags)
}

var termIDRe = regexp.MustCompile(`^\d{1,3}(\.\d{1,2})?$`)

func (s *Server) createAgenda(c echo.Context) error {
	m, err := s.writable(c.Request().Context())
	if err != nil {
		return err
	}
	var a Agenda
	if err := c.Bind(&a); err != nil || strings.TrimSpace(a.TermID) == "" || strings.TrimSpace(a.Name) == "" {
		return bad("term_id and name required")
	}
	a.TermID, a.Name = strings.TrimSpace(a.TermID), strings.TrimSpace(a.Name)
	if !termIDRe.MatchString(a.TermID) {
		return bad("term_id must be a number such as 3 or 5.1")
	}
	if len([]rune(a.Name)) > 500 {
		return bad("name is too long")
	}
	if a.VoteType == "" {
		a.VoteType = "ordinary"
	}
	if !validVoteType[a.VoteType] {
		return bad("invalid vote_type")
	}
	tx, err := s.DB.BeginTx(c.Request().Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO termpartner(meeting_year,term_id,term_name,term_name_en,vote_type) VALUES(?,?,?,?,?)`,
		m.Year, a.TermID, a.Name, a.NameEN, a.VoteType)
	if err != nil {
		return conflict("term_id already exists")
	}
	id, _ := res.LastInsertId()
	// Back-fill vote rows for shareholders already registered onsite.
	if _, err := tx.Exec(`INSERT INTO regissub(meeting_year,id_term,id_acc,full_term)
		SELECT r.meeting_year,?,r.id_acc,r.mq_share FROM regismaim r WHERE r.meeting_year=?`, id, m.Year); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	a.ID, a.Status = int(id), "pending"
	s.audit(c, "", "agenda_create", a)
	return c.JSON(http.StatusCreated, a)
}

func (s *Server) loadAgenda(c echo.Context, year string) (*Agenda, error) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return nil, bad("invalid id")
	}
	var a Agenda
	err = s.DB.QueryRowContext(c.Request().Context(),
		`SELECT id,term_id,COALESCE(term_name,''),COALESCE(term_name_en,''),status,vote_type FROM termpartner WHERE id=? AND meeting_year=?`,
		id, year).Scan(&a.ID, &a.TermID, &a.Name, &a.NameEN, &a.Status, &a.VoteType)
	if err == sql.ErrNoRows {
		return nil, notFound("agenda not found")
	}
	return &a, err
}

func (s *Server) updateAgenda(c echo.Context) error {
	m, err := s.writable(c.Request().Context())
	if err != nil {
		return err
	}
	cur, err := s.loadAgenda(c, m.Year)
	if err != nil {
		return err
	}
	if cur.Status != "pending" {
		return conflict("only pending agendas can be edited")
	}
	var a Agenda
	if err := c.Bind(&a); err != nil || strings.TrimSpace(a.Name) == "" {
		return bad("name required")
	}
	if a.VoteType == "" {
		a.VoteType = cur.VoteType
	}
	if !validVoteType[a.VoteType] {
		return bad("invalid vote_type")
	}
	if _, err := s.DB.ExecContext(c.Request().Context(),
		`UPDATE termpartner SET term_name=?,term_name_en=?,vote_type=? WHERE id=?`, a.Name, a.NameEN, a.VoteType, cur.ID); err != nil {
		return err
	}
	s.audit(c, "", "agenda_update", echo.Map{"id": cur.ID, "name": a.Name})
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) deleteAgenda(c echo.Context) error {
	m, err := s.writable(c.Request().Context())
	if err != nil {
		return err
	}
	cur, err := s.loadAgenda(c, m.Year)
	if err != nil {
		return err
	}
	if cur.Status != "pending" {
		return conflict("only pending agendas can be deleted")
	}
	tx, err := s.DB.BeginTx(c.Request().Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM regissub WHERE id_term=?`, cur.ID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM novote WHERE meeting_year=? AND id_term=?`, m.Year, cur.TermID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM termpartner WHERE id=?`, cur.ID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, "", "agenda_delete", cur)
	return c.NoContent(http.StatusNoContent)
}

// setAgendaStatus opens or closes voting on one agenda item.
// Only one agenda group (same parent number, e.g. 5, 5.1, 5.2) may be open at a time.
func (s *Server) setAgendaStatus(c echo.Context) error {
	m, err := s.writable(c.Request().Context())
	if err != nil {
		return err
	}
	cur, err := s.loadAgenda(c, m.Year)
	if err != nil {
		return err
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := c.Bind(&body); err != nil {
		return bad("invalid body")
	}
	ctx := c.Request().Context()
	switch {
	case body.Status == "open" && cur.Status == "pending":
		// serialise concurrent "open" requests: lock the meeting's agenda rows while checking and updating
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		rows, err := tx.QueryContext(ctx, `SELECT term_id FROM termpartner WHERE meeting_year=? AND status='open' FOR UPDATE`, m.Year)
		if err != nil {
			return err
		}
		for rows.Next() {
			var t string
			if err := rows.Scan(&t); err == nil && parentOf(t) != parentOf(cur.TermID) {
				rows.Close()
				return conflict("close agenda " + t + " first")
			}
		}
		rows.Close()
		if _, err := tx.ExecContext(ctx, `UPDATE termpartner SET status='open',open='1' WHERE id=?`, cur.ID); err != nil {
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	case body.Status == "closed" && cur.Status == "open":
		if _, err := s.DB.ExecContext(ctx,
			`UPDATE termpartner SET status='closed',open='0',closevote=NOW() WHERE id=? AND status='open'`, cur.ID); err != nil {
			return err
		}
		// Snapshot eligible shares / voter count (unvoted holders count as "agree" in the summary).
		rs, err := s.computeResults(ctx, m.Year)
		if err != nil {
			return err
		}
		for _, r := range rs {
			if r.ID == cur.ID {
				if _, err := s.DB.ExecContext(ctx, `UPDATE termpartner SET relateshare=?,countshare=? WHERE id=?`,
					r.Eligible, r.VotedCount, cur.ID); err != nil {
					return err
				}
			}
		}
	default:
		return conflict("invalid status transition " + cur.Status + " -> " + body.Status)
	}
	s.audit(c, "", "agenda_"+body.Status, echo.Map{"term_id": cur.TermID})
	return c.NoContent(http.StatusNoContent)
}
