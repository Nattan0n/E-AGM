package api

import (
	"crypto/hmac"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/thairung/e-agm/internal/auth"
)

// Requesting a User (flow page 1). The User is the Account ID; a holder who does not know it, or whose register entry
// has no e-mail / mobile, starts here with the ID card number:
//
//	found + contact on file   -> the User is sent to that contact right away (nothing shown on screen)
//	found + no contact        -> the holder enters an e-mail / mobile, confirms it by OTP -> OMD review
//	not found in the register -> the holder fills in a request with documents, confirms the contact by OTP -> OMD review
//
// A request is continued with a ticket (random secret held by the browser), never with the ID card alone.

// requestGuard limits User requests per IP: each start counts, whatever the outcome (the answer tells whether an ID
// card is in the register, so it must not be usable for mass lookups).
var requestGuard = auth.NewFailGuard(10, time.Hour, time.Hour)

const (
	maxRequestFiles = 3
	maxRequestFile  = 3 << 20 // 3 MB each
	// UserRequestBodyLimit is the body limit for the upload endpoint (the API default is 1 MB).
	UserRequestBodyLimit = "10M"
)

var allowedDocTypes = map[string]bool{"application/pdf": true, "image/jpeg": true, "image/png": true}

func newTicket() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// userRequestStart: POST {id_card, account_id?}
func (s *Server) userRequestStart(c echo.Context) error {
	ctx := c.Request().Context()
	var r struct {
		IDCard    string `json:"id_card"`
		AccountID string `json:"account_id"`
	}
	if err := c.Bind(&r); err != nil {
		return bad("ข้อมูลไม่ถูกต้อง")
	}
	idc := nonDigit.ReplaceAllString(r.IDCard, "")
	acc := strings.ToUpper(strings.TrimSpace(r.AccountID))
	if len(idc) < 6 {
		return bad("กรุณากรอกเลขประจำตัวประชาชน / Passport ให้ถูกต้อง")
	}
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	if m.Locked() || !m.OnlineEnabled {
		return echo.NewHTTPError(http.StatusForbidden, "ปิดรับการเข้าประชุมออนไลน์แล้ว")
	}
	ipKey := "req|" + c.RealIP()
	if !requestGuard.Allowed(ipKey) {
		return echo.NewHTTPError(http.StatusTooManyRequests, "ขอ User หลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่")
	}
	requestGuard.Fail(ipKey)

	// ID numbers are compared on digits only (the register stores them in several formats)
	rows, err := s.DB.QueryContext(ctx, `SELECT Account_id, COALESCE(M_phone,''), COALESCE(I_Email,'') FROM holder
		WHERE REGEXP_REPLACE(COALESCE(I_tax,''), '[^0-9]', '') = ? AND (?='' OR Account_id=?) ORDER BY Account_id LIMIT 20`, idc, acc, acc)
	if err != nil {
		return err
	}
	type hit struct{ acc, phone, email string }
	var hits []hit
	for rows.Next() {
		var h hit
		if err := rows.Scan(&h.acc, &h.phone, &h.email); err != nil {
			rows.Close()
			return err
		}
		h.phone, h.email = nonDigit.ReplaceAllString(h.phone, ""), strings.ToLower(strings.TrimSpace(h.email))
		hits = append(hits, h)
	}
	rows.Close()

	// found and at least one account has a contact: send each account's User to its own contacts
	sent := []echo.Map{}
	var noContact []string
	for _, h := range hits {
		if h.phone == "" && h.email == "" {
			noContact = append(noContact, h.acc)
			continue
		}
		msg := "User สำหรับเข้าประชุม E-AGM: " + h.acc
		for _, ch := range []struct{ channel, to string }{{"sms", h.phone}, {"email", h.email}} {
			if ch.to == "" {
				continue
			}
			if err := s.OTP.Send(ch.channel, ch.to, msg); err != nil {
				log.Printf("send User %s via %s failed: %v", h.acc, ch.channel, err)
				continue
			}
			sent = append(sent, echo.Map{"channel": ch.channel, "masked": maskTo(ch.channel, ch.to)})
		}
		s.audit(c, h.acc, "user_sent", nil)
	}
	if len(sent) > 0 {
		resp := echo.Map{"result": "sent", "channels": sent}
		if s.DevOTP {
			accs := []string{}
			for _, h := range hits {
				accs = append(accs, h.acc)
			}
			resp["dev_user"] = strings.Join(accs, ", ")
		}
		return c.JSON(http.StatusOK, resp)
	}

	kind := "not_found"
	if len(noContact) > 0 {
		kind = "contact"
	}
	ticket, err := newTicket()
	if err != nil {
		return err
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO user_request(meeting_year,kind,acc_ids,id_card,ticket_hash,ip_address) VALUES(?,?,?,?,?,?)`,
		m.Year, kind, nullStr(strings.Join(noContact, ",")), idc, s.hashSecret("ticket", ticket), c.RealIP()); err != nil {
		return err
	}
	s.audit(c, "", "user_request_start", echo.Map{"kind": kind})
	return c.JSON(http.StatusOK, echo.Map{"result": kind, "ticket": ticket})
}

type holderUserReq struct {
	ID       int
	Kind     string
	Status   string
	Channel  string
	Phone    string
	Email    string
	OTPHash  string
	OTPExp   sql.NullTime
	Created  time.Time
	Attempts int
}

// loadTicket finds the request a ticket belongs to (draft requests only, 24 h).
func (s *Server) loadTicket(c echo.Context, ticket string) (*holderUserReq, error) {
	if len(ticket) != 48 {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "คำขอหมดอายุ กรุณาเริ่มขอ User ใหม่")
	}
	var u holderUserReq
	var ch sql.NullString
	err := s.DB.QueryRowContext(c.Request().Context(), `SELECT id,kind,status,otp_channel,COALESCE(phone,''),COALESCE(email,''),COALESCE(otp_code,''),otp_expires_at,created_at,otp_attempts
		FROM user_request WHERE ticket_hash=?`, s.hashSecret("ticket", ticket)).
		Scan(&u.ID, &u.Kind, &u.Status, &ch, &u.Phone, &u.Email, &u.OTPHash, &u.OTPExp, &u.Created, &u.Attempts)
	if err != nil || u.Status != "draft" || time.Since(u.Created) > 24*time.Hour {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "คำขอหมดอายุ กรุณาเริ่มขอ User ใหม่")
	}
	u.Channel = ch.String
	return &u, nil
}

// userRequestContact: multipart {ticket, phone, email, channel, full_name, note, files[]} - saves the request and
// sends an OTP to the chosen channel. Calling it again (resend) keeps the files already uploaded unless new ones come.
func (s *Server) userRequestContact(c echo.Context) error {
	ctx := c.Request().Context()
	u, err := s.loadTicket(c, c.FormValue("ticket"))
	if err != nil {
		return err
	}
	phone := nonDigit.ReplaceAllString(c.FormValue("phone"), "")
	email := strings.ToLower(strings.TrimSpace(c.FormValue("email")))
	channel := c.FormValue("channel")
	name := strings.TrimSpace(c.FormValue("full_name"))
	note := strings.TrimSpace(c.FormValue("note"))
	if phone != "" && (len(phone) < 9 || len(phone) > 15) {
		return bad("เบอร์มือถือไม่ถูกต้อง")
	}
	if email != "" && (!strings.Contains(email, "@") || len(email) > 100) {
		return bad("อีเมลไม่ถูกต้อง")
	}
	if phone == "" && email == "" {
		return bad("กรุณากรอกอีเมลหรือเบอร์มือถืออย่างน้อย 1 ช่องทาง")
	}
	to := phone
	if channel == "email" {
		to = email
	} else {
		channel = "sms"
	}
	if to == "" {
		return bad("ช่องทางที่เลือกรับ OTP ยังไม่ได้กรอก")
	}
	if len([]rune(note)) > 500 {
		note = string([]rune(note)[:500])
	}

	// documents (required for a holder not found in the register)
	var files []struct {
		name, ctype string
		data        []byte
	}
	if form, err := c.MultipartForm(); err == nil && form != nil {
		fh := form.File["files"]
		if len(fh) > maxRequestFiles {
			return bad(fmt.Sprintf("แนบเอกสารได้ไม่เกิน %d ไฟล์", maxRequestFiles))
		}
		for _, f := range fh {
			if f.Size > maxRequestFile {
				return bad("ไฟล์ " + f.Filename + " ใหญ่เกิน 3 MB")
			}
			rd, err := f.Open()
			if err != nil {
				return err
			}
			b, err := io.ReadAll(io.LimitReader(rd, maxRequestFile+1))
			rd.Close()
			if err != nil {
				return err
			}
			ct := http.DetectContentType(b)
			if i := strings.IndexByte(ct, ';'); i > 0 {
				ct = ct[:i]
			}
			if !allowedDocTypes[ct] {
				return bad("ไฟล์ " + f.Filename + " ต้องเป็น PDF, JPG หรือ PNG")
			}
			fn := f.Filename
			if len(fn) > 200 {
				fn = fn[len(fn)-200:]
			}
			files = append(files, struct {
				name, ctype string
				data        []byte
			}{fn, ct, b})
		}
	}
	var have int
	s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_request_file WHERE request_id=?`, u.ID).Scan(&have)
	if u.Kind == "not_found" {
		if name == "" {
			return bad("กรุณากรอกชื่อ-นามสกุลตามเอกสาร")
		}
		if len(files) == 0 && have == 0 {
			return bad("กรุณาแนบเอกสารประกอบอย่างน้อย 1 ไฟล์")
		}
	}

	// 3 OTPs per hour per request
	// (audit detail is {"channel":..,"id":N} - keys are sorted when encoded)
	var sentN int
	s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_log WHERE action='user_request_otp' AND detail LIKE ? AND created_at > NOW() - INTERVAL 1 HOUR`,
		fmt.Sprintf(`%%"id":%d}`, u.ID)).Scan(&sentN)
	if sentN >= 3 {
		return echo.NewHTTPError(http.StatusTooManyRequests, "ขอ OTP ครบ 3 ครั้งในชั่วโมงนี้แล้ว กรุณารอสักครู่")
	}
	code, err := newOTP()
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE user_request SET phone=?,email=?,otp_channel=?,otp_code=?,otp_expires_at=?,otp_attempts=0,
		full_name=COALESCE(?,full_name),note=COALESCE(?,note) WHERE id=?`,
		nullStr(phone), nullStr(email), channel, s.hashSecret("ureq", strconv.Itoa(u.ID), code), time.Now().Add(10*time.Minute),
		nullStr(name), nullStr(note), u.ID); err != nil {
		return err
	}
	if len(files) > 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM user_request_file WHERE request_id=?`, u.ID); err != nil {
			return err
		}
		for _, f := range files {
			if _, err := tx.ExecContext(ctx, `INSERT INTO user_request_file(request_id,filename,content_type,size,data) VALUES(?,?,?,?,?)`,
				u.ID, f.name, f.ctype, len(f.data), f.data); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if err := s.OTP.Send(channel, to, code); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "ส่ง OTP ไม่สำเร็จ")
	}
	s.audit(c, "", "user_request_otp", echo.Map{"id": u.ID, "channel": channel})
	resp := echo.Map{"sent": true, "channel": channel, "masked_to": maskTo(channel, to), "expires_in": 600}
	if s.DevOTP {
		resp["dev_otp"] = code
	}
	return c.JSON(http.StatusOK, resp)
}

// userRequestVerify: POST {ticket, otp} - the contact is confirmed and the request goes to the OMD queue.
func (s *Server) userRequestVerify(c echo.Context) error {
	ctx := c.Request().Context()
	var r struct {
		Ticket string `json:"ticket"`
		OTP    string `json:"otp"`
	}
	if err := c.Bind(&r); err != nil || len(r.OTP) != 6 {
		return bad("กรุณากรอกรหัส OTP 6 หลัก")
	}
	u, err := s.loadTicket(c, r.Ticket)
	if err != nil {
		return err
	}
	invalid := echo.NewHTTPError(http.StatusUnauthorized, "OTP ไม่ถูกต้องหรือหมดอายุ")
	if u.OTPHash == "" || !u.OTPExp.Valid || u.OTPExp.Time.Before(time.Now()) {
		return invalid
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE user_request SET otp_attempts=otp_attempts+1 WHERE id=? AND otp_attempts<5`, u.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return echo.NewHTTPError(http.StatusTooManyRequests, "กรอก OTP ผิดครบ 5 ครั้ง กรุณาขอ OTP ใหม่")
	}
	if !hmac.Equal([]byte(s.hashSecret("ureq", strconv.Itoa(u.ID), r.OTP)), []byte(u.OTPHash)) {
		return invalid
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE user_request SET status='pending',otp_code=NULL,submitted_at=NOW() WHERE id=? AND status='draft'`, u.ID); err != nil {
		return err
	}
	s.audit(c, "", "user_request_submit", echo.Map{"id": u.ID, "kind": u.Kind})
	return c.JSON(http.StatusOK, echo.Map{"status": "pending", "reference": fmt.Sprintf("REQ-%06d", u.ID)})
}
