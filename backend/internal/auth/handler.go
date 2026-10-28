package auth

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

// Claims is shared by staff/admin tokens (UserID set) and holder tokens (AccID/RegID set).
type Claims struct {
	UserID int    `json:"uid,omitempty"`
	Role   string `json:"role"`
	Name   string `json:"name,omitempty"`
	AccID  string `json:"acc,omitempty"`
	RegID  int    `json:"reg,omitempty"`
	jwt.RegisteredClaims
}

type Handler struct {
	DB     *sql.DB
	Secret []byte
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
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	} else if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil || !active {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}
	tok, err := Sign(h.Secret, &Claims{UserID: id, Role: role, Name: name}, 12*time.Hour)
	if err != nil {
		return err
	}
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
