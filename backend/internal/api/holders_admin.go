package api

import (
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

// Holder master management (admin): list / create / edit / bulk import of the shareholder register.

var accRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,15}$`)
var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type HolderAdminRow struct {
	AccountID  string `json:"account_id"`
	Title      string `json:"title"`
	First      string `json:"first"`
	Last       string `json:"last"`
	Shares     int    `json:"shares"`
	MaskedID   string `json:"masked_id"`
	Phone      string `json:"phone"`
	Email      string `json:"email"`
	Security   string `json:"security"`
	Registered bool   `json:"registered"` // already registered (onsite or online) in the current meeting
}

type holderIn struct {
	AccountID string `json:"account_id"`
	Security  string `json:"security"`
	Title     string `json:"title"`
	First     string `json:"first"`
	Last      string `json:"last"`
	Shares    int    `json:"shares"`
	TaxID     string `json:"tax_id"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
}

func (h *holderIn) clean() {
	h.AccountID, h.Security = strings.TrimSpace(h.AccountID), strings.ToUpper(strings.TrimSpace(h.Security))
	h.Title, h.First, h.Last = strings.TrimSpace(h.Title), strings.TrimSpace(h.First), strings.TrimSpace(h.Last)
	h.TaxID, h.Phone, h.Email = strings.TrimSpace(h.TaxID), strings.TrimSpace(h.Phone), strings.TrimSpace(h.Email)
	if h.Security == "" {
		h.Security = "TRU"
	}
}

// validate returns a Thai message for the first problem, or "".
func (h *holderIn) validate(needTax bool) string {
	switch {
	case !accRe.MatchString(h.AccountID):
		return "เลขทะเบียนต้องเป็นตัวอักษร/ตัวเลข ไม่เกิน 15 ตัว"
	case len([]rune(h.Security)) > 5:
		return "รหัสหลักทรัพย์ยาวเกิน 5 ตัว"
	case h.First == "" && h.Last == "":
		return "ต้องมีชื่อหรือนามสกุล"
	case len([]rune(h.Title)) > 50 || len([]rune(h.First)) > 150 || len([]rune(h.Last)) > 255:
		return "ชื่อยาวเกินกำหนด"
	case h.Shares < 0 || h.Shares > 2000000000:
		return "จำนวนหุ้นไม่ถูกต้อง"
	case needTax && h.TaxID == "":
		return "ต้องมีเลขบัตรประชาชน/เลขประจำตัวผู้เสียภาษี"
	case len(h.TaxID) > 50 || len(h.Phone) > 50 || len(h.Email) > 100:
		return "เลขบัตร เบอร์โทร หรืออีเมลยาวเกินกำหนด"
	case h.Email != "" && !emailRe.MatchString(h.Email):
		return "รูปแบบอีเมลไม่ถูกต้อง"
	}
	return ""
}

func (s *Server) listHoldersAdmin(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	q := strings.TrimSpace(c.QueryParam("q"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.QueryParam("offset"))
	if offset < 0 {
		offset = 0
	}
	where, args := "1=1", []any{}
	if q != "" {
		like := "%" + escLike(q) + "%"
		where = `(h.Account_id LIKE ? OR h.N_first LIKE ? OR h.N_last LIKE ? OR h.I_tax=?)`
		args = append(args, like, like, like, q)
	}
	var total int
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM holder h WHERE `+where, args...).Scan(&total); err != nil {
		return err
	}
	rows, err := s.DB.QueryContext(ctx, `
		SELECT h.Account_id, COALESCE(h.N_title,''), COALESCE(h.N_first,''), COALESCE(h.N_last,''), COALESCE(h.Q_share,0),
		       COALESCE(h.I_tax,''), COALESCE(h.M_phone,''), COALESCE(h.I_Email,''), COALESCE(h.security,''),
		       EXISTS(SELECT 1 FROM regismaim r WHERE r.meeting_year=? AND r.id_acc=h.Account_id)
		       OR EXISTS(SELECT 1 FROM online_registration o WHERE o.meeting_year=? AND o.acc_id=h.Account_id AND o.status<>'cancelled')
		FROM holder h WHERE `+where+` ORDER BY h.Account_id LIMIT ? OFFSET ?`,
		append(append([]any{m.Year, m.Year}, args...), limit, offset)...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []HolderAdminRow{}
	for rows.Next() {
		var r HolderAdminRow
		var tax string
		if err := rows.Scan(&r.AccountID, &r.Title, &r.First, &r.Last, &r.Shares, &tax, &r.Phone, &r.Email, &r.Security, &r.Registered); err != nil {
			return err
		}
		r.MaskedID = maskID(tax)
		items = append(items, r)
	}
	return c.JSON(http.StatusOK, echo.Map{"total": total, "items": items})
}

func (s *Server) createHolder(c echo.Context) error {
	var h holderIn
	if err := c.Bind(&h); err != nil {
		return bad("invalid body")
	}
	h.clean()
	if msg := h.validate(true); msg != "" {
		return bad(msg)
	}
	if _, err := s.DB.ExecContext(c.Request().Context(),
		`INSERT INTO holder(security,Account_id,Holder_type,Q_share,N_title,N_first,N_last,I_tax,M_phone,I_Email) VALUES(?,?,'1',?,?,?,?,?,?,?)`,
		h.Security, h.AccountID, h.Shares, h.Title, h.First, h.Last, h.TaxID, h.Phone, h.Email); err != nil {
		return conflict("เลขทะเบียนนี้มีอยู่แล้ว")
	}
	s.audit(c, h.AccountID, "holder_create", echo.Map{"shares": h.Shares})
	return c.NoContent(http.StatusCreated)
}

func (s *Server) updateHolder(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	var h holderIn
	if err := c.Bind(&h); err != nil {
		return bad("invalid body")
	}
	h.AccountID = c.Param("acc")
	h.clean()
	if msg := h.validate(false); msg != "" {
		return bad(msg)
	}
	var cur int
	if err := s.DB.QueryRowContext(ctx, `SELECT COALESCE(Q_share,0) FROM holder WHERE Account_id=?`, h.AccountID).Scan(&cur); err != nil {
		return notFound("holder not found")
	}
	if h.Shares != cur {
		var reg int
		s.DB.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM regismaim WHERE meeting_year=? AND id_acc=?) +
			(SELECT COUNT(*) FROM online_registration WHERE meeting_year=? AND acc_id=? AND status<>'cancelled')`, m.Year, h.AccountID, m.Year, h.AccountID).Scan(&reg)
		if reg > 0 {
			return conflict("ผู้ถือหุ้นลงทะเบียนในการประชุมนี้แล้ว ไม่สามารถเปลี่ยนจำนวนหุ้นได้")
		}
	}
	q := `UPDATE holder SET N_title=?,N_first=?,N_last=?,Q_share=?,M_phone=?,I_Email=?`
	args := []any{h.Title, h.First, h.Last, h.Shares, h.Phone, h.Email}
	if h.TaxID != "" {
		q += `,I_tax=?`
		args = append(args, h.TaxID)
	}
	if _, err := s.DB.ExecContext(ctx, q+` WHERE Account_id=?`, append(args, h.AccountID)...); err != nil {
		return err
	}
	s.audit(c, h.AccountID, "holder_update", echo.Map{"shares_before": cur, "shares_after": h.Shares, "tax_changed": h.TaxID != ""})
	return c.NoContent(http.StatusNoContent)
}

type importErr struct {
	Row int    `json:"row"`
	Msg string `json:"msg"`
}

// importHolders upserts a batch of holders. All-or-nothing: any invalid row rejects the whole file.
func (s *Server) importHolders(c echo.Context) error {
	ctx := c.Request().Context()
	var body struct {
		Rows   []holderIn `json:"rows"`
		DryRun bool       `json:"dry_run"`
	}
	if err := c.Bind(&body); err != nil || len(body.Rows) == 0 {
		return bad("ไม่พบข้อมูลที่จะนำเข้า")
	}
	if len(body.Rows) > 5000 {
		return bad("นำเข้าได้ครั้งละไม่เกิน 5,000 แถว")
	}
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	var errs []importErr
	seen := map[string]int{}
	for i := range body.Rows {
		h := &body.Rows[i]
		h.clean()
		line := i + 1
		if msg := h.validate(true); msg != "" {
			errs = append(errs, importErr{line, msg})
		} else if first, dup := seen[h.AccountID]; dup {
			errs = append(errs, importErr{line, fmt.Sprintf("เลขทะเบียนซ้ำกับแถวที่ %d", first)})
		}
		seen[h.AccountID] = line
	}
	if len(errs) > 0 {
		if len(errs) > 50 {
			errs = errs[:50]
		}
		return c.JSON(http.StatusUnprocessableEntity, echo.Map{"message": "ไฟล์มีข้อมูลไม่ถูกต้อง", "errors": errs})
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	created, updated, blocked := 0, 0, []importErr{}
	for i, h := range body.Rows {
		var cur int
		var exists bool
		err := tx.QueryRowContext(ctx, `SELECT COALESCE(Q_share,0) FROM holder WHERE Account_id=? FOR UPDATE`, h.AccountID).Scan(&cur)
		exists = err == nil
		if exists && cur != h.Shares {
			var reg int
			tx.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM regismaim WHERE meeting_year=? AND id_acc=?) +
				(SELECT COUNT(*) FROM online_registration WHERE meeting_year=? AND acc_id=? AND status<>'cancelled')`, m.Year, h.AccountID, m.Year, h.AccountID).Scan(&reg)
			if reg > 0 {
				blocked = append(blocked, importErr{i + 1, "ลงทะเบียนในการประชุมนี้แล้ว เปลี่ยนจำนวนหุ้นไม่ได้"})
				continue
			}
		}
		if exists {
			if _, err := tx.ExecContext(ctx, `UPDATE holder SET security=?,N_title=?,N_first=?,N_last=?,Q_share=?,I_tax=?,M_phone=?,I_Email=? WHERE Account_id=?`,
				h.Security, h.Title, h.First, h.Last, h.Shares, h.TaxID, h.Phone, h.Email, h.AccountID); err != nil {
				return err
			}
			updated++
		} else {
			if _, err := tx.ExecContext(ctx, `INSERT INTO holder(security,Account_id,Holder_type,Q_share,N_title,N_first,N_last,I_tax,M_phone,I_Email) VALUES(?,?,'1',?,?,?,?,?,?,?)`,
				h.Security, h.AccountID, h.Shares, h.Title, h.First, h.Last, h.TaxID, h.Phone, h.Email); err != nil {
				return err
			}
			created++
		}
	}
	if len(blocked) > 0 {
		return c.JSON(http.StatusUnprocessableEntity, echo.Map{"message": "มีผู้ถือหุ้นที่แก้ไขไม่ได้", "errors": blocked})
	}
	if body.DryRun {
		return c.JSON(http.StatusOK, echo.Map{"created": created, "updated": updated, "dry_run": true})
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, "", "holder_import", echo.Map{"created": created, "updated": updated})
	return c.JSON(http.StatusOK, echo.Map{"created": created, "updated": updated})
}
