@echo off
rem E-AGM dev API on http://localhost:8080 (start MySQL in XAMPP first). DEV_OTP=1 is for local testing only.
cd /d "%~dp0backend"
set JWT_SECRET=dev-secret-for-local-testing-only-123
set DB_ROOT_PASSWORD=
set DEV_OTP=1
go run ./cmd/server
pause
