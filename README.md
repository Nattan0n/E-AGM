# E-AGM

Unified onsite + online shareholder registration and voting system. Full rebuild of the legacy Eregist (PHP); Eregist is reference only and is not modified.

The HTML mockups in `Eregist/E-AGM_Artifact` are the source of truth for screens and flows.

## Stack
- Backend: Go + Echo (`backend/`)
- Frontend: Next.js 16 App Router + TypeScript (`frontend/`)
- Database: MySQL 8.0 / InnoDB (`migrations/`) — dev also works on XAMPP MariaDB 10.4
- Deploy: Docker Compose + Nginx (`infra/`)

## Layout
```
backend/cmd/server        API entrypoint
backend/cmd/seed          dev seed (users, meeting, agendas, 40 holders)
backend/internal/auth     staff/admin login + JWT + role middleware
backend/internal/api      HTTP handlers: meeting, agenda, holder, registration, vote, summary, online (OTP), admin
backend/pkg               config, db
frontend/app/online       shareholder flow (register -> OTP -> waiting -> vote -> confirm)
frontend/app/staff        onsite staff (search, register, vote on behalf, late, novote, summary)
frontend/app/admin        dashboard, agendas, vote control, users, audit, export, history, settings
migrations/               001 schema ... 006 (003 agenda type + roles, 004 vote mode, 005 advance entry, 006 room open); apply in order
docs/                     design docs (older than the mockups where they disagree)
```

## Run locally (no Docker)
```
# 1. database (XAMPP MariaDB or MySQL 8)
mysql -uroot -e "CREATE DATABASE eagm_db CHARACTER SET utf8mb4"
cat migrations/*.sql | mysql -uroot eagm_db

# 2. backend  (DEV_OTP=1 returns the OTP in the API response - never in production)
cd backend
export JWT_SECRET=<random 16+ chars> DB_ROOT_PASSWORD= DEV_OTP=1 SEED_PASSWORD=<8+ chars>
go run ./cmd/seed        # users admin01 / staff01 / viewer01, meeting 2568, agendas, holders TRU-000001..40
go run ./cmd/server      # http://localhost:8080

# 3. frontend
cd frontend && npm install && npm run dev   # http://localhost:3000
```

## Key rules implemented
- Votes: agree / disagree / abstain / spoiled (บัตรเสีย). Holders who register but do not vote count as **agree** once an agenda is open/closed.
- One vote per holder per agenda online (unique key); onsite and online cannot both be active for one holder (Convert to Onsite cancels the online session and carries votes over).
- Closing a meeting sets `master.closed_at`; every write endpoint then returns 403. Past years stay in the DB (`meeting_year`) and are viewable read-only.
- Pass rules (`backend/internal/api/summary.go: decide`): ordinary = agree > 50% of agree+disagree; special = agree >= 75% of agree+disagree+abstain; unanimous = no disagree/abstain. **Confirm against the company's articles of association.**
- OTP: 6 digits, 10 min, single use, HMAC-hashed, 3 requests/hour, 5 wrong tries; audit log for every action.

## Not built yet
Excel import of holders/agendas, Clear Data (with auto-backup), PDF/Excel export, SMTP/SMS OTP delivery (only the dev log sender exists), Docker/Nginx files, automated tests.
