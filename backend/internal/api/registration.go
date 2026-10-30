package api

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

type execer interface {
	ExecContext(ctx context.Context, q string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, q string, args ...any) *sql.Row
}

// holderInfo loads a holder's display name and total shares.
func holderInfo(ctx context.Context, d execer, acc string) (name string, shares int, err error) {
	err = d.QueryRowContext(ctx,
		`SELECT TRIM(CONCAT_WS(' ',N_title,N_first,N_last)), COALESCE(Q_share,0) FROM holder WHERE Account_id=?`, acc).Scan(&name, &shares)
	if err == sql.ErrNoRows {
		return "", 0, notFound("holder not found: " + acc)
	}
	return
}

// onlineActive reports whether the holder already has a live online registration this year.
func onlineActive(ctx context.Context, d execer, year, acc string) bool {
	var n int
	d.QueryRowContext(ctx, `SELECT COUNT(*) FROM online_registration WHERE meeting_year=? AND acc_id=? AND status IN ('verified','voted')`,
		year, acc).Scan(&n)
	return n > 0
}

// prefillVotes creates one regissub row per agenda (full_term = shares, 0 where the holder is in novote or the
// agenda is already closed - a holder who registers late takes no part in an agenda whose result is final).
func prefillVotes(ctx context.Context, tx execer, year, acc string, shares int) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO regissub(meeting_year,id_term,id_acc,full_term)
		SELECT t.meeting_year, t.id, ?, IF(t.status='closed' OR EXISTS(SELECT 1 FROM novote n WHERE n.meeting_year=t.meeting_year
		       AND n.acc_novote=? AND n.id_term=t.term_id), 0, ?)
		FROM termpartner t WHERE t.meeting_year=?`, acc, acc, shares, year)
	return err
}

type regReq struct {
	AccountID string `json:"account_id"`
	Type      string `json:"type"` // person | proxy
	ProxyName string `json:"proxy_name"`
	Shares    int    `json:"shares"`
}

func (s *Server) registerIndividual(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	var r regReq
	if err := c.Bind(&r); err != nil || r.AccountID == "" {
		return bad("account_id required")
	}
	if r.Type != "person" && r.Type != "proxy" {
		return bad("type must be person or proxy")
	}
	if r.Type == "proxy" && strings.TrimSpace(r.ProxyName) == "" {
		return bad("proxy_name required for proxy")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	name, held, err := holderInfo(ctx, tx, r.AccountID)
	if err != nil {
		return err
	}
	if r.Shares == 0 {
		r.Shares = held
	}
	if r.Shares < 1 || r.Shares > held {
		return bad(fmt.Sprintf("shares must be between 1 and %d", held))
	}
	if onlineActive(ctx, tx, m.Year, r.AccountID) {
		return conflict("holder already registered online - use Convert to Onsite")
	}
	gt := "0"
	if r.Type == "proxy" {
		gt = "1"
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO regismaim(meeting_year,id_acc,name_regis,mq_share,group_type,admin_regist,proxy_name) VALUES(?,?,?,?,?,?,?)`,
		m.Year, r.AccountID, name, r.Shares, gt, actor(c), nullStr(r.ProxyName)); err != nil {
		return conflict("holder already registered")
	}
	if err := prefillVotes(ctx, tx, m.Year, r.AccountID, r.Shares); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, r.AccountID, "register_onsite", r)
	return c.JSON(http.StatusCreated, echo.Map{"account_id": r.AccountID, "name": name, "shares": r.Shares})
}

func (s *Server) cancelRegistration(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	acc := c.Param("acc")
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// lock the holder's vote rows so a vote cannot slip in between the check and the delete
	var voted int
	tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(voted),0) FROM (SELECT voted FROM regissub WHERE meeting_year=? AND id_acc=? FOR UPDATE) x`, m.Year, acc).Scan(&voted)
	if voted > 0 {
		return conflict("holder has already voted - cannot cancel registration")
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM regismaim WHERE meeting_year=? AND id_acc=?`, m.Year, acc)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return notFound("registration not found")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM regissub WHERE meeting_year=? AND id_acc=?`, m.Year, acc); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM holderlate WHERE meeting_year=? AND AccID=?`, m.Year, acc); err != nil {
		return err
	}
	// keep group totals in step when a group member is cancelled
	var gids []int
	if rows, err := tx.QueryContext(ctx, `SELECT gm.id_group FROM regisgroup_member gm JOIN regisgroup g ON g.id_group=gm.id_group
		WHERE g.meeting_year=? AND gm.id_acc=?`, m.Year, acc); err == nil {
		for rows.Next() {
			var g int
			if rows.Scan(&g) == nil {
				gids = append(gids, g)
			}
		}
		rows.Close()
	}
	if _, err := tx.ExecContext(ctx, `DELETE gm FROM regisgroup_member gm JOIN regisgroup g ON g.id_group=gm.id_group
		WHERE g.meeting_year=? AND gm.id_acc=?`, m.Year, acc); err != nil {
		return err
	}
	for _, g := range gids {
		if _, err := tx.ExecContext(ctx, `UPDATE regisgroup SET totle_regis=COALESCE((SELECT SUM(shares) FROM regisgroup_member WHERE id_group=?),0) WHERE id_group=?`, g, g); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, acc, "register_cancel", nil)
	return c.NoContent(http.StatusNoContent)
}

// convertToOnsite cancels a holder's online session and registers them onsite (staff then votes for them).
// Any votes already cast online are carried over so nothing is lost or double-counted.
func (s *Server) convertToOnsite(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	acc := c.Param("acc")
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	name, held, err := holderInfo(ctx, tx, acc)
	if err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx,
		`UPDATE online_registration SET status='cancelled', token=NULL WHERE meeting_year=? AND acc_id=? AND status IN ('verified','voted')`, m.Year, acc)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return notFound("no active online registration")
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO regismaim(meeting_year,id_acc,name_regis,mq_share,group_type,admin_regist,source) VALUES(?,?,?,?,'0',?,'converted')`,
		m.Year, acc, name, held, actor(c)); err != nil {
		return conflict("holder already registered onsite")
	}
	if err := prefillVotes(ctx, tx, m.Year, acc, held); err != nil {
		return err
	}
	// carry over online votes
	if _, err := tx.ExecContext(ctx, `
		UPDATE regissub rs
		JOIN termpartner t ON t.id=rs.id_term
		JOIN votes_online v ON v.meeting_year=t.meeting_year AND v.term_id=t.term_id AND v.acc_id=rs.id_acc
		SET rs.voted=1, rs.voted_at=v.voted_at, rs.voted_by='online',
		    rs.disagree_term=IF(v.vote_choice='disagree',rs.full_term,0),
		    rs.noc_term=IF(v.vote_choice='abstain',rs.full_term,0),
		    rs.fail_term=IF(v.vote_choice='spoiled',rs.full_term,0)
		WHERE rs.meeting_year=? AND rs.id_acc=?`, m.Year, acc); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, acc, "convert_to_onsite", echo.Map{"by": actor(c)})
	return c.JSON(http.StatusOK, echo.Map{"account_id": acc, "name": name, "shares": held})
}

// ---- groups ----

type GroupItem struct {
	ID      int    `json:"id"`
	Code    string `json:"code"`
	Name    string `json:"name"`
	Members int    `json:"members"`
	Shares  int    `json:"shares"`
}

type GroupMember struct {
	AccountID string `json:"account_id"`
	Name      string `json:"name"`
	Shares    int    `json:"shares"`
}

func (s *Server) listGroups(c echo.Context) error {
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT g.id_group, COALESCE(g.group_code,''), g.name_group, COUNT(gm.id_acc), COALESCE(SUM(gm.shares),0)
		FROM regisgroup g LEFT JOIN regisgroup_member gm ON gm.id_group=g.id_group
		WHERE g.meeting_year=? GROUP BY g.id_group ORDER BY g.id_group`, m.Year)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []GroupItem{}
	for rows.Next() {
		var g GroupItem
		if err := rows.Scan(&g.ID, &g.Code, &g.Name, &g.Members, &g.Shares); err != nil {
			return err
		}
		out = append(out, g)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) groupMembers(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return bad("invalid id")
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT gm.id_acc, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), gm.shares
		FROM regisgroup_member gm JOIN holder h ON h.Account_id=gm.id_acc WHERE gm.id_group=? ORDER BY h.N_first`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []GroupMember{}
	for rows.Next() {
		var g GroupMember
		if err := rows.Scan(&g.AccountID, &g.Name, &g.Shares); err != nil {
			return err
		}
		out = append(out, g)
	}
	return c.JSON(http.StatusOK, out)
}

type groupReq struct {
	Name    string `json:"name"`
	Members []struct {
		AccountID string `json:"account_id"`
		Shares    int    `json:"shares"`
	} `json:"members"`
}

// addMember registers one holder into an existing group inside tx.
func (s *Server) addMember(ctx context.Context, tx execer, m *Meeting, gid int, gname, acc string, shares int, by string) error {
	name, held, err := holderInfo(ctx, tx, acc)
	if err != nil {
		return err
	}
	if shares == 0 {
		shares = held
	}
	if shares < 1 || shares > held {
		return bad(fmt.Sprintf("%s: shares must be between 1 and %d", acc, held))
	}
	if onlineActive(ctx, tx, m.Year, acc) {
		return conflict(acc + " already registered online")
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO regismaim(meeting_year,id_acc,name_regis,mq_share,group_regis,group_type,admin_regist) VALUES(?,?,?,?,?,?,?)`,
		m.Year, acc, name, shares, gname, gname, by); err != nil {
		return conflict(acc + " already registered")
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO regisgroup_member(id_group,id_acc,shares) VALUES(?,?,?)`, gid, acc, shares); err != nil {
		return err
	}
	return prefillVotes(ctx, tx, m.Year, acc, shares)
}

func (s *Server) registerGroup(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	var r groupReq
	if err := c.Bind(&r); err != nil || strings.TrimSpace(r.Name) == "" || len(r.Members) == 0 {
		return bad("name and at least one member required")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `INSERT INTO regisgroup(meeting_year,id_acc,name_group,totle_regis) VALUES(?,?,?,0)`,
		m.Year, r.Members[0].AccountID, r.Name)
	if err != nil {
		return err
	}
	gid64, _ := res.LastInsertId()
	gid := int(gid64)
	total := 0
	for _, mem := range r.Members {
		if err := s.addMember(ctx, tx, m, gid, r.Name, mem.AccountID, mem.Shares, actor(c)); err != nil {
			return err
		}
	}
	tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(shares),0) FROM regisgroup_member WHERE id_group=?`, gid).Scan(&total)
	if _, err := tx.ExecContext(ctx, `UPDATE regisgroup SET totle_regis=?, group_code=? WHERE id_group=?`,
		total, fmt.Sprintf("G-%04d", gid), gid); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, "", "register_group", echo.Map{"group": r.Name, "members": len(r.Members), "shares": total})
	return c.JSON(http.StatusCreated, echo.Map{"id": gid, "code": fmt.Sprintf("G-%04d", gid), "shares": total})
}

func (s *Server) groupFor(c echo.Context, year string) (int, string, error) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return 0, "", bad("invalid id")
	}
	var name string
	err = s.DB.QueryRowContext(c.Request().Context(),
		`SELECT name_group FROM regisgroup WHERE id_group=? AND meeting_year=?`, id, year).Scan(&name)
	if err == sql.ErrNoRows {
		return 0, "", notFound("group not found")
	}
	return id, name, err
}

func (s *Server) addGroupMember(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	gid, gname, err := s.groupFor(c, m.Year)
	if err != nil {
		return err
	}
	var r struct {
		AccountID string `json:"account_id"`
		Shares    int    `json:"shares"`
	}
	if err := c.Bind(&r); err != nil || r.AccountID == "" {
		return bad("account_id required")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := s.addMember(ctx, tx, m, gid, gname, r.AccountID, r.Shares, actor(c)); err != nil {
		return err
	}
	tx.ExecContext(ctx, `UPDATE regisgroup SET totle_regis=(SELECT SUM(shares) FROM regisgroup_member WHERE id_group=?) WHERE id_group=?`, gid, gid)
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, r.AccountID, "group_member_add", echo.Map{"group": gname})
	return c.NoContent(http.StatusCreated)
}

func (s *Server) removeGroupMember(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	gid, gname, err := s.groupFor(c, m.Year)
	if err != nil {
		return err
	}
	acc := c.Param("acc")
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var voted int
	tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(voted),0) FROM (SELECT voted FROM regissub WHERE meeting_year=? AND id_acc=? FOR UPDATE) x`, m.Year, acc).Scan(&voted)
	if voted > 0 {
		return conflict("member has already voted")
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM regisgroup_member WHERE id_group=? AND id_acc=?`, gid, acc)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return notFound("member not found")
	}
	for _, q := range []string{
		`DELETE FROM regismaim WHERE meeting_year=? AND id_acc=?`,
		`DELETE FROM regissub WHERE meeting_year=? AND id_acc=?`,
		`DELETE FROM holderlate WHERE meeting_year=? AND AccID=?`,
	} {
		if _, err := tx.ExecContext(ctx, q, m.Year, acc); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE regisgroup SET totle_regis=COALESCE((SELECT SUM(shares) FROM regisgroup_member WHERE id_group=?),0) WHERE id_group=?`, gid, gid); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, acc, "group_member_remove", echo.Map{"group": gname})
	return c.NoContent(http.StatusNoContent)
}
