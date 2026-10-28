// Command seed loads dev/demo data: admin+staff users, a meeting, agendas and sample holders.
// Safe to re-run (uses upserts). DEV ONLY - passwords come from SEED_PASSWORD.
package main

import (
	"fmt"
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"

	"github.com/thairung/e-agm/pkg/config"
	"github.com/thairung/e-agm/pkg/db"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	pw := os.Getenv("SEED_PASSWORD")
	if len(pw) < 8 {
		log.Fatal("set SEED_PASSWORD (min 8 chars)")
	}
	d, err := db.Open(cfg.DSN())
	if err != nil {
		log.Fatal(err)
	}
	defer d.Close()
	hash, _ := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)

	users := [][]string{
		{"admin01", "ผู้ดูแลระบบ", "ITD", "admin"},
		{"staff01", "เจ้าหน้าที่ทะเบียน 1", "OMD", "staff"},
		{"viewer01", "ผู้ชมผลการประชุม", "OMD", "viewer"},
	}
	for _, u := range users {
		_, err := d.Exec(`INSERT INTO useradmin(usr,Fullname,Part,pws_hash,role) VALUES(?,?,?,?,?)
			ON DUPLICATE KEY UPDATE Fullname=VALUES(Fullname),pws_hash=VALUES(pws_hash),role=VALUES(role)`, u[0], u[1], u[2], string(hash), u[3])
		must(err)
	}

	_, err = d.Exec(`INSERT INTO master(codemaster,detailmaster,datemaster,quorum_pct) VALUES('2568','ประชุมสามัญผู้ถือหุ้น ประจำปี 2568','วันพุธที่ 25 มิถุนายน 2568 เวลา 14.00 น.',33.33)
		ON DUPLICATE KEY UPDATE detailmaster=VALUES(detailmaster)`)
	must(err)

	terms := [][]string{
		{"1", "รับรองรายงานการประชุมสามัญผู้ถือหุ้น ครั้งที่ผ่านมา", "ordinary"},
		{"2", "รับทราบรายงานผลการดำเนินงานประจำปี", "info"},
		{"3", "อนุมัติงบการเงิน สิ้นสุดวันที่ 31 ธันวาคม 2567", "ordinary"},
		{"4", "อนุมัติการจัดสรรกำไรและการจ่ายเงินปันผล", "ordinary"},
		{"5.1", "เลือกตั้งกรรมการแทนกรรมการที่ออกตามวาระ - คนที่ 1", "ordinary"},
		{"5.2", "เลือกตั้งกรรมการแทนกรรมการที่ออกตามวาระ - คนที่ 2", "ordinary"},
		{"5.3", "เลือกตั้งกรรมการแทนกรรมการที่ออกตามวาระ - คนที่ 3", "ordinary"},
		{"6", "อนุมัติค่าตอบแทนกรรมการ", "special"},
		{"7", "แต่งตั้งผู้สอบบัญชีและกำหนดค่าสอบบัญชี", "ordinary"},
		{"8", "เรื่องอื่น ๆ (ถ้ามี)", "info"},
	}
	for _, t := range terms {
		_, err := d.Exec(`INSERT INTO termpartner(meeting_year,term_id,term_name,vote_type) VALUES('2568',?,?,?)
			ON DUPLICATE KEY UPDATE term_name=VALUES(term_name),vote_type=VALUES(vote_type)`, t[0], t[1], t[2])
		must(err)
	}

	first := []string{"สมชาย", "สมหญิง", "สมหมาย", "สมศรี", "ประสงค์", "มาลี", "วิชัย", "ศจีมาศ", "กิตติ", "นภา"}
	last := []string{"ใจดี", "รักชาติ", "หวังดี", "มั่นใจ", "รักไทย", "สุขใจ", "รุ่งเรือง", "วงศ์สุวรรณ", "ชัยวัฒน์", "แสงทอง"}
	for i := 1; i <= 40; i++ {
		acc := fmt.Sprintf("TRU-%06d", i)
		title, ti := "นาย", "103"
		if i%2 == 0 {
			title, ti = "นาง", "104"
		}
		tax := fmt.Sprintf("1%012d", 100000000+i*7919)
		_, err := d.Exec(`INSERT INTO holder(security,Account_id,Holder_type,Q_share,I_title,N_title,N_first,N_last,I_tax,M_phone,I_Email)
			VALUES('TRU',?,'1',?,?,?,?,?,?,?,?)
			ON DUPLICATE KEY UPDATE Q_share=VALUES(Q_share),N_first=VALUES(N_first),N_last=VALUES(N_last),I_tax=VALUES(I_tax)`,
			acc, 1000*(1+i*37%250), ti, title, first[i%len(first)], last[(i*3)%len(last)]+fmt.Sprint(i), tax,
			fmt.Sprintf("08%08d", 10000000+i*131), fmt.Sprintf("holder%d@example.com", i))
		must(err)
	}
	fmt.Println("seeded: users admin01/staff01/viewer01, meeting 2568, 10 agendas, 40 holders (TRU-000001..)")
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
