package api

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

type Meeting struct {
	ID            int        `json:"id"`
	Year          string     `json:"year"`
	Detail        string     `json:"detail"`
	Date          string     `json:"date"`
	ClosedAt      *time.Time `json:"closed_at"`
	OnlineEnabled bool       `json:"online_enabled"`
	RoomOpen      bool       `json:"room_open"`     // online room opened by an admin: holders may see the agendas
	AdvanceEntry  bool       `json:"advance_entry"` // staff may key onsite votes before an agenda is opened
	QuorumPct     float64    `json:"quorum_pct"`
}

func (m *Meeting) Locked() bool { return m.ClosedAt != nil }

const meetingCols = `id,codemaster,COALESCE(detailmaster,''),COALESCE(datemaster,''),closed_at,online_enabled,advance_entry,room_open,quorum_pct`

type scanner interface{ Scan(...any) error }

func scanMeeting(r scanner) (*Meeting, error) {
	var m Meeting
	var closed sql.NullTime
	if err := r.Scan(&m.ID, &m.Year, &m.Detail, &m.Date, &closed, &m.OnlineEnabled, &m.AdvanceEntry, &m.RoomOpen, &m.QuorumPct); err != nil {
		return nil, err
	}
	if closed.Valid {
		m.ClosedAt = &closed.Time
	}
	return &m, nil
}

func (s *Server) meetingByYear(ctx context.Context, year string) (*Meeting, error) {
	var row *sql.Row
	if year == "" {
		row = s.DB.QueryRowContext(ctx, `SELECT `+meetingCols+` FROM master ORDER BY codemaster DESC LIMIT 1`)
	} else {
		row = s.DB.QueryRowContext(ctx, `SELECT `+meetingCols+` FROM master WHERE codemaster=?`, year)
	}
	m, err := scanMeeting(row)
	if err == sql.ErrNoRows {
		return nil, notFound("meeting not found")
	}
	return m, err
}

// meeting returns the current (latest-year) meeting.
func (s *Server) meeting(ctx context.Context) (*Meeting, error) { return s.meetingByYear(ctx, "") }

// writable returns the current meeting, or 403 if it is closed (read-only).
func (s *Server) writable(ctx context.Context) (*Meeting, error) {
	m, err := s.meeting(ctx)
	if err != nil {
		return nil, err
	}
	if m.Locked() {
		return nil, echo.NewHTTPError(http.StatusForbidden, "meeting is closed (read-only)")
	}
	return m, nil
}

func (s *Server) getMeeting(c echo.Context) error {
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, m)
}

func (s *Server) listMeetings(c echo.Context) error {
	rows, err := s.DB.QueryContext(c.Request().Context(), `SELECT `+meetingCols+` FROM master ORDER BY codemaster DESC`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []*Meeting{}
	for rows.Next() {
		m, err := scanMeeting(rows)
		if err != nil {
			return err
		}
		out = append(out, m)
	}
	return c.JSON(http.StatusOK, out)
}

type meetingReq struct {
	Year          string  `json:"year"`
	Detail        string  `json:"detail"`
	Date          string  `json:"date"`
	OnlineEnabled *bool   `json:"online_enabled"`
	AdvanceEntry  *bool   `json:"advance_entry"`
	QuorumPct     float64 `json:"quorum_pct"`
}

func (s *Server) updateMeeting(c echo.Context) error {
	m, err := s.writable(c.Request().Context())
	if err != nil {
		return err
	}
	var r meetingReq
	if err := c.Bind(&r); err != nil {
		return bad("invalid body")
	}
	if r.QuorumPct <= 0 || r.QuorumPct > 100 {
		r.QuorumPct = m.QuorumPct
	}
	online := m.OnlineEnabled
	if r.OnlineEnabled != nil {
		online = *r.OnlineEnabled
	}
	advance := m.AdvanceEntry
	if r.AdvanceEntry != nil {
		advance = *r.AdvanceEntry
	}
	if _, err := s.DB.ExecContext(c.Request().Context(),
		`UPDATE master SET detailmaster=?,datemaster=?,online_enabled=?,advance_entry=?,quorum_pct=? WHERE id=?`,
		r.Detail, r.Date, online, advance, r.QuorumPct, m.ID); err != nil {
		return err
	}
	s.audit(c, "", "meeting_update", r)
	return c.NoContent(http.StatusNoContent)
}

// setRoom opens or closes the online meeting room (the holders' lobby).
func (s *Server) setRoom(c echo.Context) error {
	m, err := s.writable(c.Request().Context())
	if err != nil {
		return err
	}
	var r struct {
		Open bool `json:"open"`
	}
	if err := c.Bind(&r); err != nil {
		return bad("invalid body")
	}
	if _, err := s.DB.ExecContext(c.Request().Context(), `UPDATE master SET room_open=? WHERE id=?`, r.Open, m.ID); err != nil {
		return err
	}
	s.audit(c, "", "room_"+map[bool]string{true: "open", false: "close"}[r.Open], nil)
	return c.JSON(http.StatusOK, echo.Map{"room_open": r.Open})
}

// createMeeting starts a new meeting year; previous years stay as read-only history.
func (s *Server) createMeeting(c echo.Context) error {
	var r meetingReq
	if err := c.Bind(&r); err != nil || len(r.Year) != 4 {
		return bad("year (4 digits) required")
	}
	if _, err := strconv.Atoi(r.Year); err != nil {
		return bad("year must be numeric")
	}
	if cur, err := s.meeting(c.Request().Context()); err == nil && !cur.Locked() {
		return conflict("close the current meeting before creating a new one")
	}
	if r.QuorumPct <= 0 {
		r.QuorumPct = 33.33
	}
	if _, err := s.DB.ExecContext(c.Request().Context(),
		`INSERT INTO master(codemaster,detailmaster,datemaster,quorum_pct) VALUES(?,?,?,?)`,
		r.Year, r.Detail, r.Date, r.QuorumPct); err != nil {
		return conflict("meeting year already exists")
	}
	s.audit(c, "", "meeting_create", r)
	return c.NoContent(http.StatusCreated)
}

func (s *Server) closeMeeting(c echo.Context) error {
	m, err := s.writable(c.Request().Context())
	if err != nil {
		return err
	}
	var open int
	s.DB.QueryRowContext(c.Request().Context(),
		`SELECT COUNT(*) FROM termpartner WHERE meeting_year=? AND status='open'`, m.Year).Scan(&open)
	if open > 0 {
		return conflict("close all open agendas first")
	}
	if _, err := s.DB.ExecContext(c.Request().Context(), `UPDATE master SET closed_at=NOW() WHERE id=?`, m.ID); err != nil {
		return err
	}
	s.audit(c, "", "meeting_close", echo.Map{"year": m.Year})
	return c.NoContent(http.StatusNoContent)
}
