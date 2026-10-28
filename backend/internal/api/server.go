package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	echojwt "github.com/labstack/echo-jwt/v4"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"github.com/thairung/e-agm/internal/auth"
)

type Server struct {
	DB     *sql.DB
	Secret []byte
	OTP    OTPSender
	DevOTP bool // return the OTP in the API response (dev only)
	Origin string
}

func (s *Server) Routes(e *echo.Echo) {
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{s.Origin},
		AllowHeaders: []string{"Authorization", "Content-Type"},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
	}))

	e.GET("/api/health", func(c echo.Context) error {
		if err := s.DB.PingContext(c.Request().Context()); err != nil {
			return c.JSON(http.StatusServiceUnavailable, echo.Map{"status": "db down"})
		}
		return c.JSON(http.StatusOK, echo.Map{"status": "ok"})
	})

	a := &auth.Handler{DB: s.DB, Secret: s.Secret}
	e.POST("/api/auth/login", a.Login, middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(5)))

	jwtMW := echojwt.WithConfig(echojwt.Config{
		SigningKey:    s.Secret,
		NewClaimsFunc: func(echo.Context) jwt.Claims { return new(auth.Claims) },
	})
	staffRoles := auth.RequireRole("staff", "admin", "viewer")
	staffOnly := auth.RequireRole("staff", "admin") // may write onsite data
	adminOnly := auth.RequireRole("admin")

	// ---- staff / admin (read) ----
	g := e.Group("/api", jwtMW, staffRoles)
	g.GET("/me", func(c echo.Context) error {
		cl := auth.FromContext(c)
		return c.JSON(http.StatusOK, echo.Map{"uid": cl.UserID, "role": cl.Role, "name": cl.Name})
	})
	g.GET("/meeting", s.getMeeting)
	g.GET("/stats", s.stats)
	g.GET("/summary", s.summary)
	g.GET("/agendas", s.listAgendas)
	g.GET("/holders/search", s.searchHolders)
	g.GET("/registration/groups", s.listGroups)
	g.GET("/registration/groups/:id", s.groupMembers)
	g.GET("/vote/onsite/:acc", s.holderVotes)
	g.GET("/late", s.listLate)
	g.GET("/novote", s.listNovote)

	// ---- staff / admin (write) ----
	w := e.Group("/api", jwtMW, staffOnly)
	w.POST("/registration", s.registerIndividual)
	w.DELETE("/registration/:acc", s.cancelRegistration)
	w.POST("/registration/:acc/convert", s.convertToOnsite)
	w.POST("/registration/group", s.registerGroup)
	w.POST("/registration/groups/:id/members", s.addGroupMember)
	w.DELETE("/registration/groups/:id/members/:acc", s.removeGroupMember)
	w.POST("/vote/onsite", s.voteOnsite)
	w.POST("/late", s.addLate)
	w.POST("/novote", s.addNovote)
	w.DELETE("/novote/:id", s.deleteNovote)

	// ---- admin ----
	ad := e.Group("/api/admin", jwtMW, adminOnly)
	ad.POST("/agendas", s.createAgenda)
	ad.PUT("/agendas/:id", s.updateAgenda)
	ad.DELETE("/agendas/:id", s.deleteAgenda)
	ad.PATCH("/agendas/:id/status", s.setAgendaStatus)
	ad.GET("/users", s.listUsers)
	ad.POST("/users", s.createUser)
	ad.PUT("/users/:id", s.updateUser)
	ad.GET("/online-registrations", s.listOnlineRegs)
	ad.GET("/audit", s.listAudit)
	ad.GET("/meetings", s.listMeetings)
	ad.GET("/meetings/:year/summary", s.summary)
	ad.PUT("/meeting", s.updateMeeting)
	ad.PATCH("/meeting/room", s.setRoom)
	ad.POST("/meeting", s.createMeeting)
	ad.POST("/meeting/close", s.closeMeeting)
	ad.GET("/export/summary.csv", s.exportSummary)

	// ---- online shareholder ----
	otpLimit := middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(3))
	e.POST("/api/online/register", s.onlineRegister, otpLimit)
	e.POST("/api/online/verify-otp", s.onlineVerify, otpLimit)
	h := e.Group("/api/online", jwtMW, auth.RequireRole("holder"), s.holderSession)
	h.GET("/me", s.onlineMe)
	h.GET("/agendas", s.onlineAgendas)
	h.POST("/vote", s.onlineVote)
	h.PUT("/vote-mode", s.onlineSetMode)
	h.GET("/receipt", s.onlineReceipt)
}

// ---- helpers ----

func (s *Server) audit(c echo.Context, acc, action string, detail any) {
	b, _ := json.Marshal(detail)
	year := ""
	if m, err := s.meeting(c.Request().Context()); err == nil {
		year = m.Year
	}
	ua := c.Request().UserAgent()
	if len(ua) > 255 {
		ua = ua[:255]
	}
	s.DB.ExecContext(c.Request().Context(),
		`INSERT INTO audit_log(acc_id,action,detail,ip_address,user_agent,meeting_year) VALUES(?,?,?,?,?,?)`,
		nullStr(acc), action, string(b), c.RealIP(), ua, nullStr(year))
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func actor(c echo.Context) string {
	if cl := auth.FromContext(c); cl != nil {
		if cl.AccID != "" {
			return cl.AccID
		}
		return cl.Name
	}
	return ""
}

func bad(msg string) error      { return echo.NewHTTPError(http.StatusBadRequest, msg) }
func conflict(msg string) error { return echo.NewHTTPError(http.StatusConflict, msg) }
func notFound(msg string) error { return echo.NewHTTPError(http.StatusNotFound, msg) }

var validChoice = map[string]bool{"agree": true, "disagree": true, "abstain": true, "spoiled": true}
