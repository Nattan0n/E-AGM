package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/thairung/e-agm/pkg/db"
)

// Integration tests run against a real MySQL/MariaDB that already has the migrations and the seed applied
// (cmd/migrate + cmd/seed). They are skipped unless EAGM_TEST_DSN is set, and they create their own meeting year
// ("2999") so nothing else is touched; the year is removed afterwards. NEVER point this at a production database.
//
//	EAGM_TEST_DSN="root:@tcp(127.0.0.1:3306)/eagm_test?parseTime=true&charset=utf8mb4&loc=Local" SEED_PASSWORD=... go test ./internal/api
const testYear = "2999"

type env struct {
	t   *testing.T
	e   *echo.Echo
	db  *sql.DB
	adm string
	stf string
}

func (v *env) do(method, path, token string, body any) (int, map[string]any, []byte) {
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	v.e.ServeHTTP(rec, req)
	var m map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	return rec.Code, m, rec.Body.Bytes()
}

func (v *env) login(user string) string {
	pw := os.Getenv("SEED_PASSWORD")
	code, m, _ := v.do("POST", "/api/auth/login", "", map[string]string{"username": user, "password": pw})
	if code != 200 {
		v.t.Fatalf("login %s: %d", user, code)
	}
	return m["token"].(string)
}

func (v *env) must(code int, want int, what string, body []byte) {
	v.t.Helper()
	if code != want {
		v.t.Fatalf("%s: got %d want %d: %s", what, code, want, body)
	}
}

func setup(t *testing.T) *env {
	dsn := os.Getenv("EAGM_TEST_DSN")
	if dsn == "" {
		t.Skip("EAGM_TEST_DSN not set")
	}
	d, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, q := range []string{
			`DELETE FROM regissub WHERE meeting_year=?`, `DELETE FROM regismaim WHERE meeting_year=?`, `DELETE FROM novote WHERE meeting_year=?`,
			`DELETE FROM holderlate WHERE meeting_year=?`, `DELETE FROM votes_online WHERE meeting_year=?`, `DELETE FROM online_registration WHERE meeting_year=?`,
			`DELETE FROM termpartner WHERE meeting_year=?`, `DELETE FROM audit_log WHERE meeting_year=?`, `DELETE FROM master WHERE codemaster=?`,
		} {
			d.Exec(q, testYear)
		}
		d.Close()
	})
	d.Exec(`DELETE FROM master WHERE codemaster=?`, testYear)
	if _, err := d.Exec(`INSERT INTO master(codemaster,detailmaster,datemaster,quorum_pct,room_open) VALUES(?, 'test', '', 25, 1)`, testYear); err != nil {
		t.Fatal(err)
	}
	e := echo.New()
	s := &Server{DB: d, Secret: []byte("test-secret-1234567890"), OTP: LogOTPSender{}, DevOTP: true, Origin: "http://localhost:3000"}
	s.Routes(e)
	v := &env{t: t, e: e, db: d}
	v.adm, v.stf = v.login("admin01"), v.login("staff01")
	return v
}

func (v *env) term(summary map[string]any, id string) map[string]any {
	for _, x := range summary["terms"].([]any) {
		m := x.(map[string]any)
		if m["term_id"] == id {
			return m
		}
	}
	v.t.Fatalf("term %s not in summary", id)
	return nil
}

func (v *env) summary() map[string]any {
	code, m, b := v.do("GET", "/api/summary", v.stf, nil)
	v.must(code, 200, "summary", b)
	return m
}

func total(m map[string]any, k string) float64 { return m["total"].(map[string]any)[k].(float64) }

func TestClosedAgendaIsFrozen(t *testing.T) {
	v := setup(t)
	for _, id := range []string{"1", "2"} {
		code, _, b := v.do("POST", "/api/admin/agendas", v.adm, map[string]any{"term_id": id, "name": "agenda " + id, "vote_type": "ordinary"})
		v.must(code, 201, "create agenda", b)
	}
	agendaID := func(term string) int {
		var id int
		v.db.QueryRow(`SELECT id FROM termpartner WHERE meeting_year=? AND term_id=?`, testYear, term).Scan(&id)
		return id
	}
	reg := func(acc string) {
		code, _, b := v.do("POST", "/api/registration", v.stf, map[string]any{"account_id": acc, "type": "person"})
		v.must(code, 201, "register "+acc, b)
	}
	reg("TRU-000001")
	reg("TRU-000002")
	reg("TRU-000003")

	// open agenda 1, one disagree, close it
	code, _, b := v.do("PATCH", "/api/admin/agendas/"+itoa(agendaID("1"))+"/status", v.adm, map[string]string{"status": "open"})
	v.must(code, 204, "open", b)
	code, _, b = v.do("POST", "/api/vote/onsite", v.stf, map[string]any{"account_id": "TRU-000001", "term_id": "1", "choice": "disagree"})
	v.must(code, 204, "vote", b)
	code, _, b = v.do("PATCH", "/api/admin/agendas/"+itoa(agendaID("1"))+"/status", v.adm, map[string]string{"status": "closed"})
	v.must(code, 204, "close", b)
	before := v.term(v.summary(), "1")
	if total(before, "disagree") == 0 || total(before, "agree") == 0 {
		t.Fatalf("expected a mixed result, got %v", before["total"])
	}

	// a late registration and a cancellation after the close must not change the closed result
	reg("TRU-000004")
	code, _, b = v.do("DELETE", "/api/registration/TRU-000002", v.stf, nil)
	v.must(code, 204, "cancel", b)
	after := v.term(v.summary(), "1")
	for _, k := range []string{"agree", "disagree", "abstain", "spoiled"} {
		if total(before, k) != total(after, k) {
			t.Errorf("closed agenda changed (%s): %v -> %v", k, total(before, k), total(after, k))
		}
	}
	if before["eligible_holders"] != after["eligible_holders"] {
		t.Errorf("eligible_holders changed: %v -> %v", before["eligible_holders"], after["eligible_holders"])
	}
	// the late holder has no voting right on the closed agenda but does on the other one
	var f1, f2 int
	v.db.QueryRow(`SELECT full_term FROM regissub WHERE meeting_year=? AND id_acc='TRU-000004' AND id_term=?`, testYear, agendaID("1")).Scan(&f1)
	v.db.QueryRow(`SELECT full_term FROM regissub WHERE meeting_year=? AND id_acc='TRU-000004' AND id_term=?`, testYear, agendaID("2")).Scan(&f2)
	if f1 != 0 || f2 == 0 {
		t.Errorf("late registrant rights: closed=%d open=%d (want 0 and >0)", f1, f2)
	}

	// head counts and no-vote figures on agenda 2 (open it first)
	code, _, b = v.do("PATCH", "/api/admin/agendas/"+itoa(agendaID("2"))+"/status", v.adm, map[string]string{"status": "open"})
	v.must(code, 204, "open 2", b)
	s := v.term(v.summary(), "2")
	if s["eligible_holders"].(float64) != 3 { // 1, 3, 4 (2 was cancelled)
		t.Errorf("eligible_holders = %v want 3", s["eligible_holders"])
	}
	code, _, b = v.do("POST", "/api/novote", v.stf, map[string]any{"account_id": "TRU-000003", "term_id": "2"})
	v.must(code, 201, "novote", b)
	s = v.term(v.summary(), "2")
	if s["eligible_holders"].(float64) != 2 || s["novote_holders"].(float64) != 1 || s["novote_shares"].(float64) == 0 {
		t.Errorf("after novote: eligible_holders=%v novote_holders=%v novote_shares=%v", s["eligible_holders"], s["novote_holders"], s["novote_shares"])
	}

	// roll call of agenda 2
	code, _, b = v.do("GET", "/api/vote/roll?term_id=2", v.stf, nil)
	v.must(code, 200, "roll", b)
	var roll []RollRow
	json.Unmarshal(b, &roll)
	states := map[string]string{}
	for _, r := range roll {
		states[r.AccountID] = r.State
	}
	if states["TRU-000003"] != "no_right" || states["TRU-000001"] != "not_voted" || len(roll) != 3 {
		t.Errorf("roll states = %v", states)
	}
	// roll call of the closed agenda shows the recorded vote and who keyed it
	code, _, b = v.do("GET", "/api/vote/roll?term_id=1", v.stf, nil)
	v.must(code, 200, "roll 1", b)
	json.Unmarshal(b, &roll)
	for _, r := range roll {
		if r.AccountID == "TRU-000001" && (r.State != "voted" || r.Disagree == 0 || r.By == "") {
			t.Errorf("roll row for the voter = %+v", r)
		}
	}

	// stats breakdown
	_, st, _ := v.do("GET", "/api/stats", v.stf, nil)
	if st["self_count"].(float64) != 3 { // 1, 3, 4
		t.Errorf("self_count = %v want 3", st["self_count"])
	}

	// audit: who did it (username + id), and the split amounts
	code, _, b = v.do("POST", "/api/vote/onsite", v.stf, map[string]any{"account_id": "TRU-000001", "term_id": "2",
		"split": map[string]int{"agree": 0, "disagree": 0, "abstain": 0, "spoiled": 0}})
	if code == 400 { // split must add up: use the holder's real shares
		var sh int
		v.db.QueryRow(`SELECT full_term FROM regissub WHERE meeting_year=? AND id_acc='TRU-000001' AND id_term=?`, testYear, agendaID("2")).Scan(&sh)
		code, _, b = v.do("POST", "/api/vote/onsite", v.stf, map[string]any{"account_id": "TRU-000001", "term_id": "2",
			"split": map[string]int{"agree": sh - 10, "disagree": 6, "abstain": 4, "spoiled": 0}})
	}
	v.must(code, 204, "split vote", b)
	var detail string
	v.db.QueryRow(`SELECT detail FROM audit_log WHERE meeting_year=? AND action='vote_onsite' ORDER BY id DESC LIMIT 1`, testYear).Scan(&detail)
	if !strings.Contains(detail, `"by_user":"staff01"`) || !strings.Contains(detail, `"split":`) {
		t.Errorf("audit detail lacks who/split: %s", detail)
	}
}

func TestOnlineIdentityNeedsAnIDNumber(t *testing.T) {
	v := setup(t)
	// a holder whose register entry has no ID number, no phone and no e-mail (the exploitable case)
	v.db.Exec(`UPDATE holder SET I_tax='', M_phone='', I_Email='' WHERE Account_id='TRU-000010'`)
	v.db.Exec(`INSERT INTO termpartner(meeting_year,term_id,term_name,vote_type) VALUES(?, '1', 'a', 'ordinary')`, testYear)
	for _, id := range []string{"abc", "-", "123"} {
		code, _, b := v.do("POST", "/api/online/register", "", map[string]any{"account_id": "TRU-000010", "id_card": id, "phone": "0899999999", "channel": "sms", "consent": true})
		if code != 401 {
			t.Errorf("id_card %q for a holder without ID number: got %d want 401 (%s)", id, code, b)
		}
	}
	// a normal holder still registers with the right ID number
	var tax, phone, mail string
	v.db.QueryRow(`SELECT I_tax,M_phone,I_Email FROM holder WHERE Account_id='TRU-000011'`).Scan(&tax, &phone, &mail)
	code, _, b := v.do("POST", "/api/online/register", "", map[string]any{"account_id": "TRU-000011", "id_card": tax, "phone": phone, "email": mail, "channel": "sms", "consent": true})
	v.must(code, 200, "legit register", b)
}

func TestResultsPublishAndImport(t *testing.T) {
	v := setup(t)
	code, _, b := v.do("POST", "/api/admin/agendas", v.adm, map[string]any{"term_id": "1", "name": "a", "vote_type": "ordinary"})
	v.must(code, 201, "agenda", b)

	// import: a row without an ID number is accepted (and counted), an existing holder keeps its ID number
	var keep string
	v.db.QueryRow(`SELECT I_tax FROM holder WHERE Account_id='TRU-000012'`).Scan(&keep)
	rows := []map[string]any{
		{"account_id": "ZZ-NOTAX-1", "first": "ทดสอบ", "shares": 10},
		{"account_id": "TRU-000012", "first": "x", "last": "y", "shares": 0, "tax_id": ""},
	}
	var cur int
	v.db.QueryRow(`SELECT Q_share FROM holder WHERE Account_id='TRU-000012'`).Scan(&cur)
	rows[1]["shares"] = cur
	code, m, b := v.do("POST", "/api/admin/holders/import", v.adm, map[string]any{"rows": rows})
	v.must(code, 200, "import", b)
	if m["no_tax"].(float64) != 2 {
		t.Errorf("no_tax = %v want 2", m["no_tax"])
	}
	var after string
	v.db.QueryRow(`SELECT I_tax FROM holder WHERE Account_id='TRU-000012'`).Scan(&after)
	if after != keep {
		t.Errorf("import blanked an existing ID number: %q -> %q", keep, after)
	}
	t.Cleanup(func() { v.db.Exec(`DELETE FROM holder WHERE Account_id='ZZ-NOTAX-1'`) })

	// holder session
	var tax, phone, mail string
	v.db.QueryRow(`SELECT I_tax,M_phone,I_Email FROM holder WHERE Account_id='TRU-000013'`).Scan(&tax, &phone, &mail)
	code, m, b = v.do("POST", "/api/online/register", "", map[string]any{"account_id": "TRU-000013", "id_card": tax, "phone": phone, "email": mail, "channel": "sms", "consent": true})
	v.must(code, 200, "online register", b)
	code, m, b = v.do("POST", "/api/online/verify-otp", "", map[string]any{"account_id": "TRU-000013", "otp": m["dev_otp"]})
	v.must(code, 200, "verify", b)
	htok := m["token"].(string)

	// not published: nothing
	_, m, _ = v.do("GET", "/api/online/results", htok, nil)
	if m["published"] != false || len(m["terms"].([]any)) != 0 {
		t.Errorf("unpublished results leaked: %v", m)
	}
	code, _, b = v.do("PUT", "/api/admin/meeting", v.adm, map[string]any{"results_published": true})
	v.must(code, 204, "publish", b)
	var id int
	v.db.QueryRow(`SELECT id FROM termpartner WHERE meeting_year=?`, testYear).Scan(&id)
	code, _, b = v.do("PATCH", "/api/admin/agendas/"+itoa(id)+"/status", v.adm, map[string]string{"status": "open"})
	v.must(code, 204, "open", b)
	_, m, _ = v.do("GET", "/api/online/results", htok, nil)
	terms := m["terms"].([]any)
	if m["published"] != true || len(terms) != 1 || terms[0].(map[string]any)["status"] != "open" {
		t.Errorf("published results = %v", m)
	}
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }
