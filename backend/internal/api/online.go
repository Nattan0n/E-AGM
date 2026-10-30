package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/thairung/e-agm/internal/auth"
)

// OTPSender delivers a one-time code. Production: SMTP / SMS gateway; dev: log to stdout.
type OTPSender interface {
	Send(channel, to, code string) error
}

type LogOTPSender struct{}

func (LogOTPSender) Send(channel, to, code string) error {
	log.Printf("[DEV OTP] %s -> %s : %s", channel, to, code)
	return nil
}

var nonDigit = regexp.MustCompile(`\D`)

func (s *Server) hashSecret(parts ...string) string {
	m := hmac.New(sha256.New, s.Secret)
	m.Write([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(m.Sum(nil))
}

func newOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// holderSession validates that the holder token still maps to a live online registration.
func (s *Server) holderSession(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		cl := auth.FromContext(c)
		var status string
		var exp sql.NullTime
		err := s.DB.QueryRowContext(c.Request().Context(),
			`SELECT status, token_expires_at FROM online_registration WHERE id=? AND acc_id=?`, cl.RegID, cl.AccID).Scan(&status, &exp)
		if err != nil || (status != "verified" && status != "voted") || (exp.Valid && exp.Time.Before(time.Now())) {
			return echo.NewHTTPError(http.StatusUnauthorized, "session no longer valid")
		}
		return next(c)
	}
}

type onlineRegReq struct {
	AccountID string `json:"account_id"`
	IDCard    string `json:"id_card"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Channel   string `json:"channel"`   // sms | email
	Consent   bool   `json:"consent"`   // PDPA
	VoteMode  string `json:"vote_mode"` // self (default) | staff - who casts the votes on meeting day
}

// onlineRegister verifies the holder's identity data and sends an OTP.
// The same generic error is returned for every identity mismatch to avoid enumeration.
func (s *Server) onlineRegister(c echo.Context) error {
	ctx := c.Request().Context()
	var r onlineRegReq
	if err := c.Bind(&r); err != nil || r.AccountID == "" || r.IDCard == "" {
		return bad("กรุณากรอกข้อมูลให้ครบ")
	}
	if !r.Consent {
		return bad("กรุณายินยอมการเก็บข้อมูลส่วนบุคคล (PDPA)")
	}
	if r.Channel != "sms" && r.Channel != "email" {
		return bad("เลือกช่องทางรับ OTP")
	}
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	if m.Locked() || !m.OnlineEnabled {
		return echo.NewHTTPError(http.StatusForbidden, "ปิดรับลงทะเบียนออนไลน์แล้ว")
	}
	ipKey := "ip|" + c.RealIP()
	accKey := "acc|" + r.AccountID
	if !identityGuard.Allowed(ipKey) || !identityGuard.Allowed(accKey) {
		s.audit(c, r.AccountID, "register_locked", nil)
		return echo.NewHTTPError(http.StatusTooManyRequests, "กรอกข้อมูลไม่ตรงหลายครั้ง กรุณารอสักครู่แล้วลองใหม่")
	}
	mismatch := &mismatchErr{guardKeys: []string{ipKey, accKey}, err: echo.NewHTTPError(http.StatusUnauthorized, "ข้อมูลไม่ตรงกับทะเบียนผู้ถือหุ้น")}

	var tax, mPhone, mail string
	err = s.DB.QueryRowContext(ctx, `SELECT COALESCE(I_tax,''),COALESCE(M_phone,''),COALESCE(I_Email,'') FROM holder WHERE Account_id=?`, r.AccountID).
		Scan(&tax, &mPhone, &mail)
	if err == sql.ErrNoRows {
		return s.failIdentity(c, r.AccountID, mismatch)
	} else if err != nil {
		return err
	}
	if subtle.ConstantTimeCompare([]byte(nonDigit.ReplaceAllString(tax, "")), []byte(nonDigit.ReplaceAllString(r.IDCard, ""))) != 1 {
		return s.failIdentity(c, r.AccountID, mismatch)
	}
	// Where the register already holds a contact, the OTP target must match it.
	phone, email := nonDigit.ReplaceAllString(r.Phone, ""), strings.ToLower(strings.TrimSpace(r.Email))
	if p := nonDigit.ReplaceAllString(mPhone, ""); p != "" && p != phone {
		return s.failIdentity(c, r.AccountID, mismatch)
	}
	if mail != "" && strings.ToLower(mail) != email {
		return s.failIdentity(c, r.AccountID, mismatch)
	}
	to := phone
	if r.Channel == "email" {
		to = email
	}
	if to == "" {
		return bad("กรอกช่องทางที่ใช้รับ OTP")
	}

	var novoteAll int
	s.DB.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM novote WHERE meeting_year=? AND acc_novote=?) =
		(SELECT COUNT(*) FROM termpartner WHERE meeting_year=?) AND EXISTS(SELECT 1 FROM termpartner WHERE meeting_year=?)`,
		m.Year, r.AccountID, m.Year, m.Year).Scan(&novoteAll)
	if novoteAll == 1 {
		return echo.NewHTTPError(http.StatusForbidden, "ไม่มีสิทธิ์ออกเสียงลงคะแนน")
	}
	if r.VoteMode == "" {
		r.VoteMode = "self"
	}
	if r.VoteMode != "self" && r.VoteMode != "staff" {
		return bad("เลือกวิธีลงคะแนน")
	}
	var onsite int
	s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM regismaim WHERE meeting_year=? AND id_acc=?`, m.Year, r.AccountID).Scan(&onsite)
	if onsite > 0 {
		return conflict("ลงทะเบียนเข้าประชุม Onsite แล้ว")
	}

	// 3 OTP requests per hour per holder
	var recent int
	s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_log WHERE acc_id=? AND action='otp_request' AND created_at > NOW() - INTERVAL 1 HOUR`, r.AccountID).Scan(&recent)
	if recent >= 3 {
		return echo.NewHTTPError(http.StatusTooManyRequests, "ขอ OTP เกินจำนวนที่กำหนด กรุณารอสักครู่")
	}

	code, err := newOTP()
	if err != nil {
		return err
	}
	otpHash := s.hashSecret(r.AccountID, code)
	cardHash := s.hashSecret("idcard", r.AccountID, nonDigit.ReplaceAllString(r.IDCard, ""))
	exp := time.Now().Add(10 * time.Minute)

	var existing int
	var status string
	err = s.DB.QueryRowContext(ctx, `SELECT id,status FROM online_registration WHERE meeting_year=? AND acc_id=? ORDER BY id DESC LIMIT 1`,
		m.Year, r.AccountID).Scan(&existing, &status)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && status != "cancelled" {
		// re-login: new OTP on the existing registration (keeps status verified/voted until re-verified)
		_, err = s.DB.ExecContext(ctx, `UPDATE online_registration SET otp_attempts=0,token_expires_at=NULL,otp_code=?,otp_expires_at=?,otp_verified=0,phone=?,email=?,ip_address=?,vote_mode=IF(status='voted',vote_mode,?) WHERE id=?`,
			otpHash, exp, phone, email, c.RealIP(), r.VoteMode, existing)
	} else if err == nil && status == "cancelled" {
		return conflict("การลงทะเบียนออนไลน์ถูกยกเลิก กรุณาติดต่อเจ้าหน้าที่")
	} else {
		_, err = s.DB.ExecContext(ctx, `INSERT INTO online_registration(acc_id,meeting_year,id_card_hash,phone,email,otp_code,otp_expires_at,ip_address,vote_mode)
			VALUES(?,?,?,?,?,?,?,?,?)`, r.AccountID, m.Year, cardHash, phone, email, otpHash, exp, c.RealIP(), r.VoteMode)
	}
	if err != nil {
		return err
	}
	identityGuard.Reset(accKey)
	if err := s.OTP.Send(r.Channel, to, code); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "ส่ง OTP ไม่สำเร็จ")
	}
	s.audit(c, r.AccountID, "otp_request", echo.Map{"channel": r.Channel})
	resp := echo.Map{"sent": true, "channel": r.Channel, "expires_in": 600, "masked_to": maskTo(r.Channel, to)}
	if s.DevOTP {
		resp["dev_otp"] = code
	}
	return c.JSON(http.StatusOK, resp)
}

// mismatchErr is the generic identity error plus the guard keys to charge for it.
type mismatchErr struct {
	guardKeys []string
	err       error
}

func (s *Server) failIdentity(c echo.Context, acc string, m *mismatchErr) error {
	for _, k := range m.guardKeys {
		identityGuard.Fail(k)
	}
	s.audit(c, acc, "register_fail", nil)
	return m.err
}

func maskTo(channel, to string) string {
	if channel == "email" {
		if i := strings.IndexByte(to, '@'); i > 1 {
			return to[:1] + strings.Repeat("*", i-1) + to[i:]
		}
		return "***"
	}
	if len(to) < 4 {
		return "***"
	}
	return strings.Repeat("X", len(to)-4) + to[len(to)-4:]
}

// onlineVerify checks the OTP (single use, 10 min, 5 attempts) and returns a holder JWT.
func (s *Server) onlineVerify(c echo.Context) error {
	ctx := c.Request().Context()
	var r struct {
		AccountID string `json:"account_id"`
		OTP       string `json:"otp"`
	}
	if err := c.Bind(&r); err != nil || r.AccountID == "" || len(r.OTP) != 6 {
		return bad("account_id and 6-digit otp required")
	}
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	invalid := echo.NewHTTPError(http.StatusUnauthorized, "OTP ไม่ถูกต้องหรือหมดอายุ")

	var id int
	var hash, status string
	var exp sql.NullTime
	var verified bool
	err = s.DB.QueryRowContext(ctx, `SELECT id,COALESCE(otp_code,''),otp_expires_at,otp_verified,status FROM online_registration
		WHERE meeting_year=? AND acc_id=? ORDER BY id DESC LIMIT 1`, m.Year, r.AccountID).Scan(&id, &hash, &exp, &verified, &status)
	if err != nil || status == "cancelled" || verified || hash == "" || !exp.Valid || exp.Time.Before(time.Now()) {
		return invalid
	}
	// max 5 attempts per issued OTP: the counter is bumped atomically BEFORE comparing, so parallel guesses cannot exceed it
	ipKey := "otp|" + c.RealIP()
	if !otpIPGuard.Allowed(ipKey) {
		return echo.NewHTTPError(http.StatusTooManyRequests, "ลองผิดเกินกำหนด กรุณารอสักครู่")
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE online_registration SET otp_attempts=otp_attempts+1 WHERE id=? AND otp_attempts<5`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return echo.NewHTTPError(http.StatusTooManyRequests, "ลองผิดเกินกำหนด กรุณาขอ OTP ใหม่")
	}
	if !hmac.Equal([]byte(s.hashSecret(r.AccountID, r.OTP)), []byte(hash)) {
		otpIPGuard.Fail(ipKey)
		s.audit(c, r.AccountID, "otp_fail", nil)
		return invalid
	}
	otpIPGuard.Reset(ipKey)
	newStatus := "verified"
	if status == "voted" {
		newStatus = "voted"
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE online_registration SET otp_verified=1,otp_attempts=0,otp_code=NULL,status=?,token_expires_at=? WHERE id=?`,
		newStatus, time.Now().Add(12*time.Hour), id); err != nil {
		return err
	}
	tok, err := auth.Sign(s.Secret, &auth.Claims{Role: "holder", AccID: r.AccountID, RegID: id}, 12*time.Hour)
	if err != nil {
		return err
	}
	s.audit(c, r.AccountID, "login", echo.Map{"mode": "online"})
	return c.JSON(http.StatusOK, echo.Map{"token": tok})
}

// ---- authenticated holder endpoints ----

// onlineLogout ends the session server-side so the old token stops working immediately.
func (s *Server) onlineLogout(c echo.Context) error {
	cl := auth.FromContext(c)
	if _, err := s.DB.ExecContext(c.Request().Context(), `UPDATE online_registration SET token_expires_at=NOW() WHERE id=? AND acc_id=?`, cl.RegID, cl.AccID); err != nil {
		return err
	}
	s.audit(c, cl.AccID, "logout", echo.Map{"mode": "online"})
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) onlineMe(c echo.Context) error {
	cl := auth.FromContext(c)
	ctx := c.Request().Context()
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	name, shares, err := holderInfo(ctx, s.DB, cl.AccID)
	if err != nil {
		return err
	}
	st, _ := s.statsOf(ctx, m)
	var mode string
	s.DB.QueryRowContext(ctx, `SELECT vote_mode FROM online_registration WHERE id=?`, cl.RegID).Scan(&mode)
	return c.JSON(http.StatusOK, echo.Map{"account_id": cl.AccID, "name": name, "shares": shares, "meeting": m, "stats": st, "vote_mode": mode})
}

type OnlineAgenda struct {
	TermID   string `json:"term_id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	VoteType string `json:"vote_type"`
	NoVote   bool   `json:"novote"`
	Choice   string `json:"choice"` // "" if not voted
}

func (s *Server) onlineAgendas(c echo.Context) error {
	cl := auth.FromContext(c)
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	if !m.RoomOpen {
		return c.JSON(http.StatusOK, []OnlineAgenda{}) // lobby: agendas stay hidden until an admin opens the room
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT t.term_id, COALESCE(t.term_name,''), t.status, t.vote_type,
		       EXISTS(SELECT 1 FROM novote n WHERE n.meeting_year=t.meeting_year AND n.id_term=t.term_id AND n.acc_novote=?),
		       COALESCE(v.vote_choice,'')
		FROM termpartner t LEFT JOIN votes_online v ON v.meeting_year=t.meeting_year AND v.term_id=t.term_id AND v.acc_id=?
		WHERE t.meeting_year=?`, cl.AccID, cl.AccID, m.Year)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []OnlineAgenda{}
	for rows.Next() {
		var a OnlineAgenda
		if err := rows.Scan(&a.TermID, &a.Name, &a.Status, &a.VoteType, &a.NoVote, &a.Choice); err != nil {
			return err
		}
		out = append(out, a)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && termLess(out[j].TermID, out[j-1].TermID); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return c.JSON(http.StatusOK, out)
}

// onlineVote casts one vote; the (year, acc, term) unique key makes a second vote impossible.
func (s *Server) onlineVote(c echo.Context) error {
	cl := auth.FromContext(c)
	ctx := c.Request().Context()
	m, err := s.writable(ctx)
	if err != nil {
		return err
	}
	var r struct {
		TermID string `json:"term_id"`
		Choice string `json:"choice"`
	}
	if err := c.Bind(&r); err != nil || r.TermID == "" || !validChoice[r.Choice] {
		return bad("term_id and a valid choice are required")
	}
	if !m.RoomOpen {
		return conflict("ห้องประชุมยังไม่เปิด")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var vmode string
	tx.QueryRowContext(ctx, `SELECT vote_mode FROM online_registration WHERE id=? FOR UPDATE`, cl.RegID).Scan(&vmode)
	if vmode == "staff" {
		return echo.NewHTTPError(http.StatusForbidden, "ท่านเลือกให้เจ้าหน้าที่ลงคะแนนแทน — หากต้องการลงคะแนนเอง ให้เปลี่ยนวิธีลงคะแนนก่อน")
	}
	var status, vtype string
	if err := s.DB.QueryRowContext(ctx, `SELECT status,vote_type FROM termpartner WHERE meeting_year=? AND term_id=?`, m.Year, r.TermID).
		Scan(&status, &vtype); err != nil {
		return notFound("agenda not found")
	}
	if status != "open" {
		return conflict("วาระนี้ยังไม่เปิดหรือปิดการลงคะแนนแล้ว")
	}
	if vtype == "info" {
		return conflict("วาระนี้เป็นการรับทราบ ไม่ต้องลงคะแนน")
	}
	var nv int
	s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM novote WHERE meeting_year=? AND id_term=? AND acc_novote=?`, m.Year, r.TermID, cl.AccID).Scan(&nv)
	if nv > 0 {
		return echo.NewHTTPError(http.StatusForbidden, "ไม่มีสิทธิ์ลงคะแนนในวาระนี้")
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO votes_online(online_reg_id,acc_id,term_id,vote_choice,ip_address,meeting_year) VALUES(?,?,?,?,?,?)`,
		cl.RegID, cl.AccID, r.TermID, r.Choice, c.RealIP(), m.Year); err != nil {
		return conflict("ลงคะแนนในวาระนี้แล้ว ไม่สามารถเปลี่ยนแปลงได้")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE online_registration SET status='voted' WHERE id=?`, cl.RegID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, cl.AccID, "vote", echo.Map{"term": r.TermID, "choice": r.Choice})
	return c.NoContent(http.StatusCreated)
}

// onlineSetMode lets a holder switch between voting themselves and leaving it to staff, until the first online vote.
func (s *Server) onlineSetMode(c echo.Context) error {
	cl := auth.FromContext(c)
	ctx := c.Request().Context()
	if _, err := s.writable(ctx); err != nil {
		return err
	}
	var r struct {
		Mode string `json:"mode"`
	}
	if err := c.Bind(&r); err != nil || (r.Mode != "self" && r.Mode != "staff") {
		return bad("mode must be self or staff")
	}
	var n int
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var cur string
	if err := tx.QueryRowContext(ctx, `SELECT vote_mode FROM online_registration WHERE id=? FOR UPDATE`, cl.RegID).Scan(&cur); err != nil {
		return err
	}
	tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM votes_online WHERE meeting_year=? AND acc_id=?`, m.Year, cl.AccID).Scan(&n)
	if n > 0 {
		return conflict("ลงคะแนนออนไลน์ไปแล้ว ไม่สามารถเปลี่ยนวิธีลงคะแนนได้")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE online_registration SET vote_mode=? WHERE id=?`, r.Mode, cl.RegID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.audit(c, cl.AccID, "vote_mode", echo.Map{"mode": r.Mode})
	return c.JSON(http.StatusOK, echo.Map{"vote_mode": r.Mode})
}

// onlineReceipt summarises the holder's votes. Agendas they did not vote on count as "agree".
func (s *Server) onlineReceipt(c echo.Context) error {
	cl := auth.FromContext(c)
	ctx := c.Request().Context()
	m, err := s.meeting(ctx)
	if err != nil {
		return err
	}
	name, shares, err := holderInfo(ctx, s.DB, cl.AccID)
	if err != nil {
		return err
	}
	var ip string
	var regAt time.Time
	s.DB.QueryRowContext(ctx, `SELECT COALESCE(ip_address,''),registered_at FROM online_registration WHERE id=?`, cl.RegID).Scan(&ip, &regAt)
	var last sql.NullTime
	s.DB.QueryRowContext(ctx, `SELECT MAX(voted_at) FROM votes_online WHERE meeting_year=? AND acc_id=?`, m.Year, cl.AccID).Scan(&last)

	rows, err := s.DB.QueryContext(ctx, `
		SELECT t.term_id, COALESCE(t.term_name,''), t.status, t.vote_type,
		       EXISTS(SELECT 1 FROM novote n WHERE n.meeting_year=t.meeting_year AND n.id_term=t.term_id AND n.acc_novote=?),
		       COALESCE(v.vote_choice,'')
		FROM termpartner t LEFT JOIN votes_online v ON v.meeting_year=t.meeting_year AND v.term_id=t.term_id AND v.acc_id=?
		WHERE t.meeting_year=?`, cl.AccID, cl.AccID, m.Year)
	if err != nil {
		return err
	}
	defer rows.Close()
	type line struct {
		TermID string `json:"term_id"`
		Name   string `json:"name"`
		Choice string `json:"choice"`
		Auto   bool   `json:"auto"` // not voted -> counted as agree
	}
	out := []line{}
	for rows.Next() {
		var l line
		var status, vt string
		var nv bool
		if err := rows.Scan(&l.TermID, &l.Name, &status, &vt, &nv, &l.Choice); err != nil {
			return err
		}
		if nv || vt == "info" {
			continue
		}
		if l.Choice == "" {
			l.Choice, l.Auto = "agree", true
		}
		out = append(out, l)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && termLess(out[j].TermID, out[j-1].TermID); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	ref := strings.ToUpper(s.hashSecret("receipt", cl.AccID, m.Year)[:6])
	return c.JSON(http.StatusOK, echo.Map{
		"reference": fmt.Sprintf("AGM-%s-%s-%s", m.Year, cl.AccID, ref),
		"name":      name, "account_id": cl.AccID, "shares": shares, "ip": ip, "registered_at": regAt,
		"last_vote_at": last.Time, "votes": out,
	})
}
