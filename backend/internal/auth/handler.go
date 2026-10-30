package auth

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

// Claims is shared by staff/admin tokens (UserID set) and holder tokens (AccID/RegID set).
type Claims struct {
	UserID   int    `json:"uid,omitempty"`
	Role     string `json:"role"`
	Name     string `json:"name,omitempty"`
	Username string `json:"usr,omitempty"`
	AccID    string `json:"acc,omitempty"`
	RegID    int    `json:"reg,omitempty"`
	jwt.RegisteredClaims
}

type Handler struct {
	DB     *sql.DB
	Secret []byte
}

// loginGuard locks a username+IP pair for 10 minutes after 5 wrong passwords in 10 minutes.
var loginGuard = NewFailGuard(5, 10*time.Minute, 10*time.Minute)

func (h *Handler) audit(c echo.Context, action string, detail map[string]any) {
	b, _ := json.Marshal(detail)
	ua := c.Request().UserAgent()
	if len(ua) > 255 {
		ua = ua[:255]
	}
	h.DB.ExecContext(c.Request().Context(),
		`INSERT INTO audit_log(action,detail,ip_address,user_agent) VALUES(?,?,?,?)`, action, string(b), c.RealIP(), ua)
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// dummyHash keeps response time similar whether or not the user exists.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy"), bcrypt.DefaultCost)

func Sign(secret []byte, c *Claims, ttl time.Duration) (string, error) {
	c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(ttl))
	c.IssuedAt = jwt.NewNumericDate(time.Now())
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(secret)
}

// Login authenticates staff/admin/viewer from useradmin and returns a JWT.
func (h *Handler) Login(c echo.Context) error {
	var req loginReq
	if err := c.Bind(&req); err != nil || req.Username == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password required")
	}
	gk := req.Username + "|" + c.RealIP()
	if !loginGuard.Allowed(gk) {
		h.audit(c, "login_locked", map[string]any{"username": req.Username})
		return echo.NewHTTPError(http.StatusTooManyRequests, "ลองเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 10 นาที")
	}
	var (
		id               int
		hash, role, name string
		active           bool
	)
	err := h.DB.QueryRowContext(c.Request().Context(),
		"SELECT ida, pws_hash, role, COALESCE(Fullname,''), active FROM useradmin WHERE usr = ?", req.Username).
		Scan(&id, &hash, &role, &name, &active)
	if err == sql.ErrNoRows {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		loginGuard.Fail(gk)
		h.audit(c, "login_fail", map[string]any{"username": req.Username})
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	} else if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil || !active {
		loginGuard.Fail(gk)
		h.audit(c, "login_fail", map[string]any{"username": req.Username})
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}
	tok, err := Sign(h.Secret, &Claims{UserID: id, Role: role, Name: name, Username: req.Username}, 12*time.Hour)
	if err != nil {
		return err
	}
	loginGuard.Reset(gk)
	h.audit(c, "login", map[string]any{"username": req.Username, "role": role})
	return c.JSON(http.StatusOK, echo.Map{"token": tok, "role": role, "name": name, "username": req.Username})
}

// FromContext returns the claims placed by the JWT middleware.
func FromContext(c echo.Context) *Claims {
	t, ok := c.Get("user").(*jwt.Token)
	if !ok {
		return nil
	}
	cl, _ := t.Claims.(*Claims)
	return cl
}

// RequireRole rejects requests whose JWT role is not in roles. Use after the JWT middleware.
func RequireRole(roles ...string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cl := FromContext(c)
			if cl == nil {
				return echo.ErrUnauthorized
			}
			for _, r := range roles {
				if cl.Role == r {
					return next(c)
				}
			}
			return echo.ErrForbidden
		}
	}
}
