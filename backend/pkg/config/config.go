package config

import (
	"fmt"
	"os"
)

type Config struct {
	DBHost, DBPort, DBName, DBUser, DBPass string
	JWTSecret                              string
	Addr                                   string
	WebOrigin                              string // allowed CORS origin (the Next.js app)
	DevOTP                                 bool   // return OTP in API response; never enable in production
}

func get(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func Load() (*Config, error) {
	c := &Config{
		DBHost:    get("DB_HOST", "localhost"),
		DBPort:    get("DB_PORT", "3306"),
		DBName:    get("DB_NAME", "eagm_db"),
		DBUser:    get("DB_USER", "root"),
		DBPass:    os.Getenv("DB_ROOT_PASSWORD"),
		JWTSecret: os.Getenv("JWT_SECRET"),
		Addr:      get("ADDR", ":8080"),
		WebOrigin: get("WEB_ORIGIN", "http://localhost:3000"),
		DevOTP:    os.Getenv("DEV_OTP") == "1",
	}
	if len(c.JWTSecret) < 16 || c.JWTSecret == "change-me" {
		return nil, fmt.Errorf("JWT_SECRET must be set to a random value of at least 16 chars")
	}
	return c, nil
}

func (c *Config) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4&loc=Local",
		c.DBUser, c.DBPass, c.DBHost, c.DBPort, c.DBName)
}
