package api

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/thairung/e-agm/internal/auth"
)

// OMD Review (flow page 17): staff check the User requests that the system could not settle on its own, call the
// holder back, then approve (the confirmed contact is bound to the account(s) so the holder can log in with the ID
// card) or reject with a reason. Holders whose shares reach master.review_dual_shares need a second approver.
// Requests hold PDPA-sensitive data (ID card, documents): staff/admin only, every document view is audited.

type reviewRow struct {
	ID          int        `json:"id"`
	Reference   string     `json:"reference"`
	Kind        string     `json:"kind"`   // contact | not_found
	Status      string     `json:"status"` // pending | approved | rejected
	IDCard      string     `json:"id_card"`
	FullName    string     `json:"full_name"`
	Phone       string     `json:"phone"`
	Email       string     `json:"email"`
	Channel     string     `json:"otp_channel"` // the contact confirmed by OTP
	Note        string     `json:"note"`
	AccIDs      []string   `json:"acc_ids"`     // matched by the system (kind contact)
	ApproveAcc  []string   `json:"approve_acc"` // bound by OMD (approved, or chosen by the first approver)
	Files       int        `json:"files"`
	SubmittedAt *time.Time `json:"submitted_at"`
	Reason      string     `json:"reason"`
	ReviewedBy  string     `json:"reviewed_by"`
	ReviewedAt  *time.Time `json:"reviewed_at"`
	CallNote    string     `json:"call_note"`
	CalledBy    string     `json:"called_by"`
	CalledAt    *time.Time `json:"called_at"`
	FirstBy     string     `json:"first_by"` // first approver, waiting for a second one
	FirstAt     *time.Time `json:"first_at"`
	FirstByMe   bool       `json:"first_by_me"`
	Notified    bool       `json:"notified"`
}

const reviewCols = `r.id,r.kind,r.status,r.id_card,COALESCE(r.full_name,''),COALESCE(r.phone,''),COALESCE(r.email,''),COALESCE(r.otp_channel,''),
	COALESCE(r.note,''),COALESCE(r.acc_ids,''),COALESCE(r.approve_acc,''),(SELECT COUNT(*) FROM user_request_file f WHERE f.request_id=r.id),
	r.submitted_at,COALESCE(r.reason,''),COALESCE(r.reviewed_by,''),r.reviewed_at,COALESCE(r.call_note,''),COALESCE(r.called_by,''),r.called_at,
	COALESCE(r.first_by,''),r.first_at,COALESCE(r.first_by_id,0),r.notified_at IS NOT NULL`

func splitAcc(s string) []string {
	out := []string{}
	for _, a := range strings.Split(s, ",") {
		if a = strings.TrimSpace(a); a != "" {
			out = append(out, a)
		}
	}
	return out
}

func scanReview(sc scanner, uid int) (*reviewRow, error) {
	var r reviewRow
	var acc, appr string
	var sub, rev, called, first sql.NullTime
	var firstID int
	if err := sc.Scan(&r.ID, &r.Kind, &r.Status, &r.IDCard, &r.FullName, &r.Phone, &r.Email, &r.Channel, &r.Note, &acc, &appr, &r.Files,
		&sub, &r.Reason, &r.ReviewedBy, &rev, &r.CallNote, &r.CalledBy, &called, &r.FirstBy, &first, &firstID, &r.Notified); err != nil {
		return nil, err
	}
	r.Reference = fmt.Sprintf("REQ-%06d", r.ID)
	r.AccIDs, r.ApproveAcc = splitAcc(acc), splitAcc(appr)
	tp := func(t sql.NullTime) *time.Time {
		if t.Valid {
			return &t.Time
		}
		return nil
	}
	r.SubmittedAt, r.ReviewedAt, r.CalledAt, r.FirstAt = tp(sub), tp(rev), tp(called), tp(first)
	r.FirstByMe = firstID != 0 && firstID == uid
	return &r, nil
}

func staffUID(c echo.Context) (int, string) {
	if cl := auth.FromContext(c); cl != nil {
		n := cl.Name
		if n == "" {
			n = cl.Username
		}
		return cl.UserID, n
	}
	return 0, ""
}

// countUserRequests: GET /api/user-requests/count - requests waiting for OMD (the menu badge polls it).
func (s *Server) countUserRequests(c echo.Context) error {
	var n int
	if err := s.DB.QueryRowContext(c.Request().Context(), `SELECT COUNT(*) FROM user_request WHERE status='pending'`).Scan(&n); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"pending": n})
}

// listUserRequests: GET /api/user-requests?status=pending|approved|rejected|all&q=
func (s *Server) listUserRequests(c echo.Context) error {
	ctx := c.Request().Context()
	uid, _ := staffUID(c)
	st := c.QueryParam("status")
	q := strings.TrimSpace(c.QueryParam("q"))
	where, args := []string{"r.status<>'draft'"}, []any{}
	switch st {
	case "pending", "approved", "rejected":
		where, args = append(where, "r.status=?"), append(args, st)
	}
	if q != "" {
		like := "%" + q + "%"
		id := strings.TrimLeft(strings.TrimPrefix(strings.ToUpper(q), "REQ-"), "0")
		where = append(where, "(r.full_name LIKE ? OR r.id_card LIKE ? OR r.phone LIKE ? OR r.email LIKE ? OR r.acc_ids LIKE ? OR r.approve_acc LIKE ? OR r.id=?)")
		args = append(args, like, like, like, like, like, like, id)
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT `+reviewCols+` FROM user_request r WHERE `+strings.Join(where, " AND ")+`
		ORDER BY r.status='pending' DESC, r.submitted_at DESC LIMIT 300`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []*reviewRow{}
	for rows.Next() {
		r, err := scanReview(rows, uid)
		if err != nil {
			return err
		}
		items = append(items, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	counts := map[string]int{"pending": 0, "approved": 0, "rejected": 0}
	cr, err := s.DB.QueryContext(ctx, `SELECT status, COUNT(*) FROM user_request WHERE status<>'draft' GROUP BY status`)
	if err != nil {
		return err
	}
	defer cr.Close()
	for cr.Next() {
		var k string
		var n int
		if err := cr.Scan(&k, &n); err != nil {
			return err
		}
		counts[k] = n
	}
	m, _ := s.meeting(ctx)
	var dual int64
	if m != nil {
		dual = m.ReviewDualShares
	}
	return c.JSON(http.StatusOK, echo.Map{"items": items, "counts": counts, "dual_shares": dual})
}

type reviewHolder struct {
	AccountID string `json:"account_id"`
	Name      string `json:"name"`
	Shares    int64  `json:"shares"`
	MaskedID  string `json:"masked_id"`
	IDMatch   bool   `json:"id_match"` // register ID card (digits) = the one in the request
	Phone     string `json:"phone"`    // on file, masked
	Email     string `json:"email"`    // on file, masked
	BoundTo   string `json:"bound_to"` // already bound to another request (reference)
}

func (s *Server) reviewHolders(ctx context.Context, idc string, accs []string, reqID int) ([]reviewHolder, error) {
	out := []reviewHolder{}
	if len(accs) == 0 {
		return out, nil
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(accs)), ",")
	args := []any{}
	for _, a := range accs {
		args = append(args, a)
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT h.Account_id, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(h.Q_share,0),
			REGEXP_REPLACE(COALESCE(h.I_tax,''),'[^0-9]',''), COALESCE(h.M_phone,''), COALESCE(h.I_Email,''), COALESCE(hc.request_id,0)
		FROM holder h LEFT JOIN holder_contact hc ON hc.account_id=h.Account_id WHERE h.Account_id IN (`+ph+`) ORDER BY h.Account_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var h reviewHolder
		var tax, phone, email string
		var bound int
		if err := rows.Scan(&h.AccountID, &h.Name, &h.Shares, &tax, &phone, &email, &bound); err != nil {
			return nil, err
		}
		h.MaskedID, h.IDMatch = maskID(tax), tax != "" && tax == idc
		if p := nonDigit.ReplaceAllString(phone, ""); p != "" {
			h.Phone = maskTo("sms", p)
		}
		if e := strings.TrimSpace(email); e != "" {
			h.Email = maskTo("email", strings.ToLower(e))
		}
		if bound != 0 && bound != reqID {
			h.BoundTo = fmt.Sprintf("REQ-%06d", bound)
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

var namePrefix = regexp.MustCompile(`^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*`)

// getUserRequest: GET /api/user-requests/:id - the request with the accounts it concerns, documents and warnings.
func (s *Server) getUserRequest(c echo.Context) error {
	ctx := c.Request().Context()
	uid, _ := staffUID(c)
	id, _ := strconv.Atoi(c.Param("id"))
	r, err := scanReview(s.DB.QueryRowContext(ctx, `SELECT `+reviewCols+` FROM user_request r WHERE r.id=? AND r.status<>'draft'`, id), uid)
	if err == sql.ErrNoRows {
		return notFound("ไม่พบคำขอ")
	}
	if err != nil {
		return err
	}
	accs := append(append([]string{}, r.AccIDs...), r.ApproveAcc...)
	accs = uniq(accs)
	holders, err := s.reviewHolders(ctx, r.IDCard, accs, r.ID)
	if err != nil {
		return err
	}

	// name suggestions for a holder not found by ID card (OMD confirms with STC before binding)
	suggest := []reviewHolder{}
	if r.Kind == "not_found" && r.FullName != "" {
		parts := strings.Fields(namePrefix.ReplaceAllString(strings.ToLower(strings.TrimSpace(r.FullName)), ""))
		if len(parts) > 0 {
			lastPat := "%"
			if len(parts) > 1 {
				lastPat = parts[len(parts)-1] + "%"
			}
			rs, err := s.DB.QueryContext(ctx, `SELECT Account_id FROM holder WHERE LOWER(N_first) LIKE ? AND LOWER(COALESCE(N_last,'')) LIKE ? ORDER BY Q_share DESC LIMIT 10`,
				parts[0]+"%", lastPat)
			if err != nil {
				return err
			}
			var ids []string
			for rs.Next() {
				var a string
				if rs.Scan(&a) == nil {
					ids = append(ids, a)
				}
			}
			rs.Close()
			if suggest, err = s.reviewHolders(ctx, r.IDCard, ids, r.ID); err != nil {
				return err
			}
		}
	}

	files := []echo.Map{}
	fr, err := s.DB.QueryContext(ctx, `SELECT id,filename,content_type,size FROM user_request_file WHERE request_id=? ORDER BY id`, r.ID)
	if err != nil {
		return err
	}
	for fr.Next() {
		var fid, size int
		var name, ct string
		if err := fr.Scan(&fid, &name, &ct, &size); err != nil {
			fr.Close()
			return err
		}
		files = append(files, echo.Map{"id": fid, "filename": name, "content_type": ct, "size": size})
	}
	fr.Close()

	// warnings: the same ID card in other requests, the contact already used by other accounts
	warn := []string{}
	var others []string
	or, err := s.DB.QueryContext(ctx, `SELECT id,status FROM user_request WHERE id_card=? AND id<>? AND status<>'draft' ORDER BY id DESC LIMIT 5`, r.IDCard, r.ID)
	if err != nil {
		return err
	}
	for or.Next() {
		var oid int
		var ost string
		if or.Scan(&oid, &ost) == nil {
			others = append(others, fmt.Sprintf("REQ-%06d (%s)", oid, statusTH[ost]))
		}
	}
	or.Close()
	if len(others) > 0 {
		warn = append(warn, "เลขบัตรนี้มีคำขออื่นด้วย: "+strings.Join(others, ", "))
	}
	if r.Phone != "" || r.Email != "" {
		var used []string
		ur, err := s.DB.QueryContext(ctx, `SELECT h.Account_id FROM holder h LEFT JOIN holder_contact hc ON hc.account_id=h.Account_id
			WHERE ((?<>'' AND (REGEXP_REPLACE(COALESCE(h.M_phone,''),'[^0-9]','')=? OR hc.phone=?)) OR (?<>'' AND (LOWER(TRIM(h.I_Email))=? OR hc.email=?)))
			AND REGEXP_REPLACE(COALESCE(h.I_tax,''),'[^0-9]','')<>? LIMIT 6`,
			r.Phone, r.Phone, r.Phone, r.Email, r.Email, r.Email, r.IDCard)
		if err != nil {
			return err
		}
		for ur.Next() {
			var a string
			if ur.Scan(&a) == nil && !contains(accs, a) {
				used = append(used, a)
			}
		}
		ur.Close()
		if len(used) > 0 {
			warn = append(warn, "เบอร์/อีเมลนี้ใช้กับบัญชีของผู้ถือหุ้นรายอื่นอยู่แล้ว: "+strings.Join(used, ", "))
		}
	}
	for _, h := range holders {
		if h.BoundTo != "" {
			warn = append(warn, fmt.Sprintf("บัญชี %s ผูกช่องทางติดต่อจาก %s ไว้แล้ว — อนุมัติจะแทนที่ของเดิม", h.AccountID, h.BoundTo))
		}
	}
	s.audit(c, "", "user_request_view", echo.Map{"id": r.ID})
	return c.JSON(http.StatusOK, echo.Map{"request": r, "holders": holders, "suggest": suggest, "files": files, "warnings": warn})
}

var statusTH = map[string]string{"pending": "รอตรวจ", "approved": "อนุมัติแล้ว", "rejected": "ปฏิเสธ"}

func uniq(a []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, x := range a {
		if !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	return out
}

func contains(a []string, x string) bool {
	for _, y := range a {
		if y == x {
			return true
		}
	}
	return false
}

// userRequestFile: GET /api/user-requests/:id/files/:fid - one attached document (shown inline to OMD).
func (s *Server) userRequestFile(c echo.Context) error {
	id, _ := strconv.Atoi(c.Param("id"))
	fid, _ := strconv.Atoi(c.Param("fid"))
	var name, ct string
	var data []byte
	err := s.DB.QueryRowContext(c.Request().Context(), `SELECT filename,content_type,data FROM user_request_file WHERE id=? AND request_id=?`, fid, id).Scan(&name, &ct, &data)
	if err == sql.ErrNoRows {
		return notFound("ไม่พบไฟล์")
	}
	if err != nil {
		return err
	}
	if !allowedDocTypes[ct] { // only what the upload accepted
		ct = "application/octet-stream"
	}
	s.audit(c, "", "user_request_file_view", echo.Map{"id": id, "file": fid})
	h := c.Response().Header()
	h.Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r == '\\' || r > 126 {
			return '_'
		}
		return r
	}, name)))
	h.Set("Cache-Control", "no-store")
	h.Set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
	return c.Blob(http.StatusOK, ct, data)
}

// userRequestCall: POST /api/user-requests/:id/call {note} - OMD called the holder back.
func (s *Server) userRequestCall(c echo.Context) error {
	ctx := c.Request().Context()
	if _, err := s.writable(ctx); err != nil {
		return err
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var b struct {
		Note string `json:"note"`
	}
	if err := c.Bind(&b); err != nil {
		return bad("ข้อมูลไม่ถูกต้อง")
	}
	note := strings.TrimSpace(b.Note)
	if note == "" {
		return bad("กรุณาบันทึกผลการโทร")
	}
	if len([]rune(note)) > 500 {
		note = string([]rune(note)[:500])
	}
	_, by := staffUID(c)
	res, err := s.DB.ExecContext(ctx, `UPDATE user_request SET call_note=?,called_by=?,called_at=NOW() WHERE id=? AND status='pending'`, note, by, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return conflict("คำขอนี้ตรวจเสร็จแล้ว")
	}
	s.audit(c, "", "user_request_call", echo.Map{"id": id})
	return c.NoContent(http.StatusNoContent)
}

// approveUserRequest: POST /api/user-requests/:id/approve {account_ids} - binds the confirmed contact (and the ID card
// of the request) to the accounts. Over the share threshold the first approval only records the approver; a second,
// different staff member must approve the same accounts.
func (s *Server) approveUserRequest(c echo.Context) error {
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var b struct {
		AccountIDs []string `json:"account_ids"`
	}
	if err := c.Bind(&b); err != nil {
		return bad("ข้อมูลไม่ถูกต้อง")
	}
	accs := []string{}
	for _, a := range b.AccountIDs {
		if a = strings.ToUpper(strings.TrimSpace(a)); a != "" && !contains(accs, a) {
			accs = append(accs, a)
		}
	}
	if len(accs) == 0 {
		return bad("กรุณาเลือกบัญชีผู้ถือหุ้นที่จะผูกกับคำขอนี้")
	}
	if len(accs) > 20 {
		return bad("เลือกบัญชีได้ไม่เกิน 20 บัญชี")
	}
	sort.Strings(accs)
	uid, by := staffUID(c)

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status, idc, phone, email, channel, firstAcc, kind string
	var firstID int
	err = tx.QueryRowContext(ctx, `SELECT status,id_card,COALESCE(phone,''),COALESCE(email,''),COALESCE(otp_channel,''),COALESCE(approve_acc,''),COALESCE(first_by_id,0),kind
		FROM user_request WHERE id=? FOR UPDATE`, id).Scan(&status, &idc, &phone, &email, &channel, &firstAcc, &firstID, &kind)
	if err == sql.ErrNoRows || status == "draft" {
		return notFound("ไม่พบคำขอ")
	}
	if err != nil {
		return err
	}
	if status != "pending" {
		return conflict("คำขอนี้ตรวจเสร็จแล้ว")
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(accs)), ",")
	args := []any{}
	for _, a := range accs {
		args = append(args, a)
	}
	var found int
	var shares int64
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(Q_share),0) FROM holder WHERE Account_id IN (`+ph+`)`, args...).Scan(&found, &shares); err != nil {
		return err
	}
	if found != len(accs) {
		return bad("ไม่พบบัญชีผู้ถือหุ้นบางรายการในทะเบียน")
	}
	accList := strings.Join(accs, ",")

	if m.ReviewDualShares > 0 && shares >= m.ReviewDualShares {
		switch {
		case firstID == 0:
			if _, err := tx.ExecContext(ctx, `UPDATE user_request SET first_by_id=?,first_by=?,first_at=NOW(),approve_acc=? WHERE id=?`, uid, by, accList, id); err != nil {
				return err
			}
			if err := tx.Commit(); err != nil {
				return err
			}
			s.audit(c, accs[0], "user_request_approve_first", echo.Map{"id": id, "accounts": accList, "shares": shares})
			return c.JSON(http.StatusOK, echo.Map{"status": "pending", "awaiting_second": true})
		case firstID == uid:
			return conflict("ผู้ถือหุ้นรายใหญ่ต้องให้เจ้าหน้าที่อีกคนเป็นผู้อนุมัติคนที่ 2")
		case firstAcc != accList:
			return conflict("บัญชีที่เลือกไม่ตรงกับที่ผู้อนุมัติคนแรกเลือกไว้ (" + firstAcc + ")")
		}
	}

	approvers := by
	if firstID != 0 {
		var fb string
		tx.QueryRowContext(ctx, `SELECT COALESCE(first_by,'') FROM user_request WHERE id=?`, id).Scan(&fb)
		approvers = fb + ", " + by
	}
	for _, a := range accs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO holder_contact(account_id,id_card,phone,email,request_id,approved_by) VALUES(?,?,?,?,?,?)
			ON DUPLICATE KEY UPDATE id_card=VALUES(id_card),phone=VALUES(phone),email=VALUES(email),request_id=VALUES(request_id),approved_by=VALUES(approved_by),approved_at=NOW()`,
			a, idc, nullStr(phone), nullStr(email), id, approvers); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE user_request SET status='approved',approve_acc=?,reviewed_by=?,reviewed_at=NOW(),reason=NULL WHERE id=?`, accList, by, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, accs[0], "user_request_approve", echo.Map{"id": id, "accounts": accList, "shares": shares, "kind": kind, "approvers": approvers})
	ref := fmt.Sprintf("REQ-%06d", id)
	notified := s.notifyRequest(ctx, id, channel, phone, email,
		"E-AGM: คำขอ User "+ref+" ได้รับอนุมัติแล้ว ท่านเข้าประชุมออนไลน์ได้โดยใช้เลขบัตรประชาชน/Passport เป็น User รหัส OTP จะส่งมาที่ช่องทางนี้")
	return c.JSON(http.StatusOK, echo.Map{"status": "approved", "notified": notified})
}

// rejectUserRequest: POST /api/user-requests/:id/reject {reason}
func (s *Server) rejectUserRequest(c echo.Context) error {
	ctx := c.Request().Context()
	if _, err := s.writable(ctx); err != nil {
		return err
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var b struct {
		Reason string `json:"reason"`
	}
	if err := c.Bind(&b); err != nil {
		return bad("ข้อมูลไม่ถูกต้อง")
	}
	reason := strings.TrimSpace(b.Reason)
	if reason == "" {
		return bad("กรุณาระบุเหตุผลที่ปฏิเสธ")
	}
	if len([]rune(reason)) > 255 {
		reason = string([]rune(reason)[:255])
	}
	_, by := staffUID(c)
	res, err := s.DB.ExecContext(ctx, `UPDATE user_request SET status='rejected',reason=?,reviewed_by=?,reviewed_at=NOW(),first_by_id=NULL,first_by=NULL,first_at=NULL
		WHERE id=? AND status='pending'`, reason, by, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return conflict("คำขอนี้ตรวจเสร็จแล้ว")
	}
	s.audit(c, "", "user_request_reject", echo.Map{"id": id, "reason": reason})
	var channel, phone, email string
	s.DB.QueryRowContext(ctx, `SELECT COALESCE(otp_channel,''),COALESCE(phone,''),COALESCE(email,'') FROM user_request WHERE id=?`, id).Scan(&channel, &phone, &email)
	notified := s.notifyRequest(ctx, id, channel, phone, email,
		fmt.Sprintf("E-AGM: คำขอ User REQ-%06d ไม่ได้รับอนุมัติ เหตุผล: %s กรุณาติดต่อฝ่ายผู้ถือหุ้น (OMD) หากมีข้อสงสัย", id, reason))
	return c.JSON(http.StatusOK, echo.Map{"status": "rejected", "notified": notified})
}

// notifyRequest tells the holder the result on the contact they confirmed by OTP. A failure does not undo the review.
func (s *Server) notifyRequest(ctx context.Context, id int, channel, phone, email, msg string) bool {
	to := phone
	if channel == "email" {
		to = email
	} else {
		channel = "sms"
	}
	if to == "" || s.OTP.Notify(channel, to, msg) != nil {
		return false
	}
	s.DB.ExecContext(ctx, `UPDATE user_request SET notified_at=NOW() WHERE id=?`, id)
	return true
}

// userRequestStatus: POST /api/online/user-request/status {ticket} - the holder checks the request (no login).
func (s *Server) userRequestStatus(c echo.Context) error {
	var b struct {
		Ticket string `json:"ticket"`
	}
	if err := c.Bind(&b); err != nil || len(b.Ticket) != 48 {
		return notFound("ไม่พบคำขอ")
	}
	var id int
	var status, reason string
	var created time.Time
	err := s.DB.QueryRowContext(c.Request().Context(), `SELECT id,status,COALESCE(reason,''),created_at FROM user_request WHERE ticket_hash=?`,
		s.hashSecret("ticket", b.Ticket)).Scan(&id, &status, &reason, &created)
	if err != nil || status == "draft" || time.Since(created) > 60*24*time.Hour {
		return notFound("ไม่พบคำขอ")
	}
	out := echo.Map{"status": status, "reference": fmt.Sprintf("REQ-%06d", id)}
	if status == "rejected" {
		out["reason"] = reason
	}
	return c.JSON(http.StatusOK, out)
}
