package api

import (
	"encoding/csv"
	"fmt"

	"github.com/labstack/echo/v4"
)

// csvResponse starts a CSV download (UTF-8 BOM so Excel reads Thai correctly).
func csvResponse(c echo.Context, filename string) *csv.Writer {
	c.Response().Header().Set(echo.HeaderContentType, "text/csv; charset=utf-8")
	c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Response().Write([]byte("\xEF\xBB\xBF"))
	return csv.NewWriter(c.Response())
}

// exportAttendees lists every registration (onsite + online) of the current meeting.
func (s *Server) exportAttendees(c echo.Context) error {
	m, err := s.meetingByYear(c.Request().Context(), c.QueryParam("year"))
	if err != nil {
		return err
	}
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT 'Onsite', r.id_acc, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(r.mq_share,0),
		       IF(r.group_type='1','มอบฉันทะ',IF(r.group_type='0','มาด้วยตนเอง','กลุ่ม')), '', DATE_FORMAT(r.upd_regis,'%Y-%m-%d %H:%i:%s')
		FROM regismaim r LEFT JOIN holder h ON h.Account_id=r.id_acc WHERE r.meeting_year=?
		UNION ALL
		SELECT 'Online', o.acc_id, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(h.Q_share,0),
		       'ออนไลน์', o.status, DATE_FORMAT(o.registered_at,'%Y-%m-%d %H:%i:%s')
		FROM online_registration o LEFT JOIN holder h ON h.Account_id=o.acc_id WHERE o.meeting_year=?
		ORDER BY 7`, m.Year, m.Year)
	if err != nil {
		return err
	}
	defer rows.Close()
	w := csvResponse(c, fmt.Sprintf("attendees_%s.csv", m.Year))
	w.Write([]string{"ช่องทาง", "เลขทะเบียน", "ชื่อ", "จำนวนหุ้น", "ประเภท", "สถานะ", "ลงทะเบียนเมื่อ"})
	for rows.Next() {
		var ch, acc, name, typ, status, at string
		var shares int
		if err := rows.Scan(&ch, &acc, &name, &shares, &typ, &status, &at); err != nil {
			return err
		}
		w.Write([]string{ch, csvSafe(acc), csvSafe(name), fmt.Sprint(shares), typ, status, at})
	}
	w.Flush()
	s.audit(c, "", "export_attendees", echo.Map{"year": m.Year})
	return w.Error()
}

// exportAudit dumps the latest audit entries (admin only).
func (s *Server) exportAudit(c echo.Context) error {
	rows, err := s.DB.QueryContext(c.Request().Context(),
		`SELECT DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s'),COALESCE(acc_id,''),action,COALESCE(detail,''),COALESCE(ip_address,'')
		 FROM audit_log ORDER BY id DESC LIMIT 20000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	w := csvResponse(c, "audit.csv")
	w.Write([]string{"เวลา", "ผู้ถือหุ้น", "การกระทำ", "รายละเอียด", "IP"})
	for rows.Next() {
		var at, acc, action, detail, ip string
		if err := rows.Scan(&at, &acc, &action, &detail, &ip); err != nil {
			return err
		}
		w.Write([]string{at, csvSafe(acc), action, csvSafe(detail), ip})
	}
	w.Flush()
	s.audit(c, "", "export_audit", nil)
	return w.Error()
}
