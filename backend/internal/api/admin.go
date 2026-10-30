package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"github.com/thairung/e-agm/internal/auth"
)

type UserRow struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Fullname string `json:"fullname"`
	Dept     string `json:"dept"`
	Role     string `json:"role"`
	Active   bool   `json:"active"`
}

func (s *Server) listUsers(c echo.Context) error {
	rows, err := s.DB.QueryContext(c.Request().Context(),
		`SELECT ida,usr,COALESCE(Fullname,''),COALESCE(Part,''),role,active FROM useradmin ORDER BY ida`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.Username, &u.Fullname, &u.Dept, &u.Role, &u.Active); err != nil {
			return err
		}
		out = append(out, u)
	}
	return c.JSON(http.StatusOK, out)
}

var validRole = map[string]bool{"admin": true, "staff": true, "viewer": true}

type userReq struct {
	Username string `json:"username"`
	Fullname string `json:"fullname"`
	Dept     string `json:"dept"`
	Role     string `json:"role"`
	Password string `json:"password"`
	Active   *bool  `json:"active"`
}

func (s *Server) createUser(c echo.Context) error {
	var r userReq
	if err := c.Bind(&r); err != nil || strings.TrimSpace(r.Username) == "" || !validRole[r.Role] {
		return bad("username and valid role required")
	}
	r.Username = strings.TrimSpace(r.Username)
	if len([]rune(r.Username)) > 50 || len([]rune(r.Fullname)) > 200 || len([]rune(r.Dept)) > 100 {
		return bad("username, fullname or dept is too long")
	}
	if len(r.Password) < 8 {
		return bad("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(r.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if _, err := s.DB.ExecContext(c.Request().Context(),
		`INSERT INTO useradmin(usr,Fullname,Part,pws_hash,role) VALUES(?,?,?,?,?)`, r.Username, r.Fullname, r.Dept, string(hash), r.Role); err != nil {
		return conflict("username already exists")
	}
	s.audit(c, "", "user_create", echo.Map{"username": r.Username, "role": r.Role})
	return c.NoContent(http.StatusCreated)
}

func (s *Server) updateUser(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return bad("invalid id")
	}
	var r userReq
	if err := c.Bind(&r); err != nil || !validRole[r.Role] {
		return bad("valid role required")
	}
	active := true
	if r.Active != nil {
		active = *r.Active
	}
	ctx := c.Request().Context()
	if cl := auth.FromContext(c); cl != nil && cl.UserID == id && (r.Role != "admin" || !active) {
		return conflict("ไม่สามารถลดสิทธิ์หรือปิดใช้งานบัญชีของตัวเองได้")
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE useradmin SET Fullname=?,Part=?,role=?,active=? WHERE ida=?`, r.Fullname, r.Dept, r.Role, active, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var exists int
		s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM useradmin WHERE ida=?`, id).Scan(&exists)
		if exists == 0 {
			return notFound("user not found")
		}
	}
	if r.Password != "" {
		if len(r.Password) < 8 {
			return bad("password must be at least 8 characters")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(r.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if _, err := s.DB.ExecContext(ctx, `UPDATE useradmin SET pws_hash=? WHERE ida=?`, string(hash), id); err != nil {
			return err
		}
	}
	s.audit(c, "", "user_update", echo.Map{"id": id, "role": r.Role, "active": active})
	return c.NoContent(http.StatusNoContent)
}

type OnlineRegRow struct {
	ID           int    `json:"id"`
	AccountID    string `json:"account_id"`
	Name         string `json:"name"`
	Shares       int    `json:"shares"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
	Status       string `json:"status"`
	OTPVerified  bool   `json:"otp_verified"`
	IP           string `json:"ip"`
	VoteMode     string `json:"vote_mode"`
	RegisteredAt string `json:"registered_at"`
}

// listOnlineRegs never exposes OTP material - only status and contact data.
func (s *Server) listOnlineRegs(c echo.Context) error {
	m, err := s.meetingByYear(c.Request().Context(), c.QueryParam("year"))
	if err != nil {
		return err
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT o.id,o.acc_id,TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)),COALESCE(h.Q_share,0),
		       COALESCE(o.phone,''),COALESCE(o.email,''),o.status,o.otp_verified,COALESCE(o.ip_address,''), o.vote_mode,
		       DATE_FORMAT(o.registered_at,'%Y-%m-%d %H:%i:%s')
		FROM online_registration o LEFT JOIN holder h ON h.Account_id=o.acc_id
		WHERE o.meeting_year=? ORDER BY o.id DESC LIMIT 500`, m.Year)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []OnlineRegRow{}
	for rows.Next() {
		var o OnlineRegRow
		var name *string
		if err := rows.Scan(&o.ID, &o.AccountID, &name, &o.Shares, &o.Phone, &o.Email, &o.Status, &o.OTPVerified, &o.IP, &o.VoteMode, &o.RegisteredAt); err != nil {
			return err
		}
		if name != nil {
			o.Name = *name
		}
		out = append(out, o)
	}
	return c.JSON(http.StatusOK, out)
}

// AttendeeRow is one registration from either channel, so admins see everyone in one list.
type AttendeeRow struct {
	Key          string `json:"key"`
	Channel      string `json:"channel"` // onsite | online
	AccountID    string `json:"account_id"`
	Name         string `json:"name"`
	Shares       int    `json:"shares"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
	Status       string `json:"status"` // onsite: registered; online: pending|verified|voted|cancelled
	RegType      string `json:"reg_type"`
	OTPVerified  bool   `json:"otp_verified"`
	IP           string `json:"ip"`
	VoteMode     string `json:"vote_mode"`
	RegisteredAt string `json:"registered_at"`
}

// listAttendees merges onsite (regismaim) and online registrations; never exposes OTP material.
func (s *Server) listAttendees(c echo.Context) error {
	m, err := s.meetingByYear(c.Request().Context(), c.QueryParam("year"))
	if err != nil {
		return err
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT CONCAT('s',r.id), 'onsite', r.id_acc, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(r.mq_share,0),
		       COALESCE(h.M_phone,''), '', 'registered', IF(r.group_type='1','proxy',IF(r.group_type='0','person','group')),
		       1, '', 'self', DATE_FORMAT(r.upd_regis,'%Y-%m-%d %H:%i:%s'), r.upd_regis
		FROM regismaim r LEFT JOIN holder h ON h.Account_id=r.id_acc WHERE r.meeting_year=?
		UNION ALL
		SELECT CONCAT('o',o.id), 'online', o.acc_id, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(h.Q_share,0),
		       COALESCE(o.phone,''), COALESCE(o.email,''), o.status, 'person',
		       o.otp_verified, COALESCE(o.ip_address,''), o.vote_mode, DATE_FORMAT(o.registered_at,'%Y-%m-%d %H:%i:%s'), o.registered_at
		FROM online_registration o LEFT JOIN holder h ON h.Account_id=o.acc_id WHERE o.meeting_year=?
		ORDER BY 14 DESC LIMIT 1000`, m.Year, m.Year)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []AttendeeRow{}
	for rows.Next() {
		var a AttendeeRow
		var name *string
		var ts any
		if err := rows.Scan(&a.Key, &a.Channel, &a.AccountID, &name, &a.Shares, &a.Phone, &a.Email, &a.Status, &a.RegType, &a.OTPVerified, &a.IP, &a.VoteMode, &a.RegisteredAt, &ts); err != nil {
			return err
		}
		if name != nil {
			a.Name = *name
		}
		out = append(out, a)
	}
	return c.JSON(http.StatusOK, out)
}

type AuditRow struct {
	ID        int    `json:"id"`
	AccID     string `json:"acc_id"`
	Action    string `json:"action"`
	Detail    string `json:"detail"`
	IP        string `json:"ip"`
	CreatedAt string `json:"created_at"`
}

func (s *Server) listAudit(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	q := `SELECT id,COALESCE(acc_id,''),action,COALESCE(detail,''),COALESCE(ip_address,''),DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') FROM audit_log WHERE 1=1`
	args := []any{}
	if a := c.QueryParam("action"); a != "" {
		q += ` AND action=?`
		args = append(args, a)
	}
	if y := c.QueryParam("year"); y != "" {
		q += ` AND meeting_year=?`
		args = append(args, y)
	}
	if t := strings.TrimSpace(c.QueryParam("q")); t != "" {
		q += ` AND (acc_id LIKE ? OR detail LIKE ?)`
		args = append(args, "%"+escLike(t)+"%", "%"+escLike(t)+"%")
	}
	var total int
	s.DB.QueryRowContext(c.Request().Context(), strings.Replace(q, `SELECT id,COALESCE(acc_id,''),action,COALESCE(detail,''),COALESCE(ip_address,''),DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s')`, `SELECT COUNT(*)`, 1), args...).Scan(&total)
	rows, err := s.DB.QueryContext(c.Request().Context(), q+` ORDER BY id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []AuditRow{}
	for rows.Next() {
		var a AuditRow
		if err := rows.Scan(&a.ID, &a.AccID, &a.Action, &a.Detail, &a.IP, &a.CreatedAt); err != nil {
			return err
		}
		items = append(items, a)
	}
	return c.JSON(http.StatusOK, echo.Map{"total": total, "items": items})
}
