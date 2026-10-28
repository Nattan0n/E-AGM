package main

import (
	"log"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"github.com/thairung/e-agm/internal/api"
	"github.com/thairung/e-agm/pkg/config"
	"github.com/thairung/e-agm/pkg/db"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	conn, err := db.Open(cfg.DSN())
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer conn.Close()

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover(), middleware.RequestID(), middleware.Secure(), middleware.BodyLimit("1M"))

	srv := &api.Server{DB: conn, Secret: []byte(cfg.JWTSecret), OTP: api.LogOTPSender{}, DevOTP: cfg.DevOTP, Origin: cfg.WebOrigin}
	srv.Routes(e)

	e.Logger.Fatal(e.Start(cfg.Addr))
}
