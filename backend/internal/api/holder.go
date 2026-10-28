package api

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

type HolderItem struct {
	AccountID string `json:"account_id"`
	Name      string `json:"name"`
	Shares    int    `json:"shares"`
	MaskedID  string `json:"masked_id"`
	Phone     string `json:"phone"`
	Status    string `json:"status"`              // none | onsite | online
	VoteMode  string `json:"vote_mode,omitempty"` // online holders only: self | staff
	GroupName string `json:"group_name,omitempty"`
	RegType   string `json:"reg_type,omitempty"` // person | proxy | group
	Late      bool   `json:"late"`
	NoVote    bool   `json:"novote_any"`
}

func maskID(id string) string {
	if len(id) <= 4 {
		return strings.Repeat("x", len(id))
	}
	return strings.Repeat("x", len(id)-4) + id[len(id)-4:]
}

func escLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// searchHolders finds holders by account id / name / tax id and reports registration status.
func (s *Server) searchHolders(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	if len([]rune(q)) < 2 {
		return bad("q must be at least 2 characters")
	}
	m, err := s.meeting(c.Request().Context())
	if err != nil {
		return err
	}
	like := "%" + escLike(q) + "%"
	rows, err := s.DB.QueryContext(c.Request().Context(), `
		SELECT h.Account_id, TRIM(CONCAT_WS(' ',h.N_title,h.N_first,h.N_last)), COALESCE(h.Q_share,0),
		       COALESCE(h.I_tax,''), COALESCE(h.M_phone,''),
		       CASE WHEN r.id IS NOT NULL THEN 'onsite' WHEN o.id IS NOT NULL THEN 'online' ELSE 'none' END,
		       COALESCE(r.group_regis,''), COALESCE(r.group_type,''),
		       COALESCE(o.vote_mode,''), l.HLKey IS NOT NULL,
		       EXISTS(SELECT 1 FROM novote n WHERE n.meeting_year=? AND n.acc_novote=h.Account_id)
		FROM holder h
		LEFT JOIN regismaim r ON r.meeting_year=? AND r.id_acc=h.Account_id
		LEFT JOIN online_registration o ON o.meeting_year=? AND o.acc_id=h.Account_id AND o.status IN ('verified','voted')
		LEFT JOIN holderlate l ON l.meeting_year=? AND l.AccID=h.Account_id
		WHERE h.Account_id LIKE ? OR h.N_first LIKE ? OR h.N_last LIKE ? OR h.I_tax=?
		ORDER BY h.N_first LIMIT 50`,
		m.Year, m.Year, m.Year, m.Year, like, like, like, q)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []HolderItem{}
	for rows.Next() {
		var h HolderItem
		var tax, groupType string
		if err := rows.Scan(&h.AccountID, &h.Name, &h.Shares, &tax, &h.Phone, &h.Status, &h.GroupName, &groupType, &h.VoteMode, &h.Late, &h.NoVote); err != nil {
			return err
		}
		h.MaskedID = maskID(tax)
		switch groupType {
		case "":
		case "0":
			h.RegType = "person"
		case "1":
			h.RegType = "proxy"
		default:
			h.RegType = "group"
		}
		out = append(out, h)
	}
	return c.JSON(http.StatusOK, out)
}
