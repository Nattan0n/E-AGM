# แผนอัพเกรด Eregist — ระบบลงทะเบียนผู้ถือหุ้น + โหวตออนไลน์

> สร้าง: 2026-09-24 | อัพเดต: 2026-09-28 | ผู้ดูแล: ITD-TRU

---

## 1. สภาพระบบปัจจุบัน

### Tech Stack (เดิม)
| ส่วน | เทคโนโลยี | สถานะ |
|---|---|---|
| ภาษา | PHP 5.2.6 (procedural) | ⚠️ Deprecated |
| DB | MySQL 5.0.51 | ⚠️ เก่ามาก |
| Frontend | Dreamweaver + Spry Ajax | ⚠️ ยุติการสนับสนุน |
| DB Driver | `mysql_*` functions | ❌ ถูกถอดใน PHP 7.0+ |
| Auth | Plain-text password | ❌ ไม่ปลอดภัย |

### ฐานข้อมูลหลัก (`eregist_db`)
| ตาราง | หน้าที่ |
|---|---|
| `holder` | ข้อมูลผู้ถือหุ้นทั้งหมด (28 fields) |
| `regismaim` | การลงทะเบียนเข้าประชุม |
| `regisgroup` | การลงทะเบียนแบบกลุ่ม |
| `regissub` | ผลโหวตรายวาระ |
| `termpartner` | วาระการประชุม (8 วาระ, 2026) |
| `master` | ข้อมูลปีประชุม |
| `novote` | ผู้ถือหุ้นที่ไม่มีสิทธิ์โหวต |
| `holderlate` | ผู้ถือหุ้นมาสาย |
| `useradmin` | ผู้ดูแลระบบ (9 คน) |

### ฟีเจอร์ที่มีอยู่แล้ว ✅
- ลงทะเบียนผู้ถือหุ้นแบบ onsite (เจ้าหน้าที่ทำให้)
- โหวตรายวาระ (ใน hall)
- สรุปผลโหวต + Export Excel
- พิมพ์รายงาน / Barcode
- จัดการวาระ + Admin

### สิ่งที่ยังขาด ❌
- ผู้ถือหุ้น **ลงทะเบียนเอง** ล่วงหน้าออนไลน์
- **โหวตออนไลน์** จากนอก hall
- ยืนยันตัวตน (KYC) ดิจิทัล
- ระบบ OTP / Token
- Audit trail ดิจิทัล

---

## 2. กฎหมายที่เกี่ยวข้อง (สำหรับ e-AGM ไทย)

| กฎหมาย | ใจความสำคัญ |
|---|---|
| **พ.ร.ก. ประชุมอิเล็กทรอนิกส์ พ.ศ. 2563** | รองรับประชุมออนไลน์ 100% ไม่ต้องมี quorum physical |
| **ประกาศกระทรวงดิจิทัลฯ พ.ศ. 2563** | บังคับ: ยืนยันตัวตน, OTP, บันทึก log, บันทึกเสียง/วิดีโอ |
| **พ.ร.บ. บริษัทมหาชน (ฉบับที่ 4) พ.ศ. 2565** | รองรับ e-Proxy, e-Meeting ถาวรในกฎหมาย |
| **PDPA พ.ศ. 2562** | ข้อมูลผู้ถือหุ้น, ภาพถ่าย, log ต้องจัดการตาม PDPA |

### ข้อบังคับทางเทคนิค (MDES 2563)
- ✅ ยืนยันตัวตนก่อนเข้าร่วมประชุม (Username+Password หรือ OTP)
- ✅ สื่อสาร 2 ทาง audio/video แบบ real-time
- ✅ รองรับโหวตแบบ เปิดเผย และ ลับ
- ✅ เก็บ electronic traffic data (เข้า-ออก, timestamp, user identity)
- ✅ บันทึกเสียง/ภาพตลอดการประชุม
- ✅ มาตรการ IT Security: Confidentiality, Integrity, Availability

---

## 3. ระบบของภายนอกที่เขาทำกัน (Benchmark)

### Inventech Connect (เอกชน, ใช้มากสุดในตลาด)
**URL ของผู้ถือหุ้น:** `https://inv.inventech.co.th/[CompanyCode]/#/homepage`

**Flow ลงทะเบียน:**
1. รับหนังสือเชิญประชุม → เปิด URL
2. กรอก: เลขทะเบียนผู้ถือหุ้น + เลขบัตรประชาชน + เบอร์มือถือ
3. รับ OTP ทาง SMS → ยืนยัน
4. ระบบ confirm + ส่ง link เข้าร่วม

**Flow โหวตวันประชุม:**
1. Login ด้วย OTP หรือ Username/PIN
2. เข้าเมนู "ลงคะแนน" ระหว่างวาระเปิด (ประมาณ 1 นาที)
3. เลือก: **เห็นด้วย / ไม่เห็นด้วย / งดออกเสียง / บัตรเสีย**
4. ยืนยัน → ผลเป็น real-time

### TSD e-Proxy Voting (กลุ่ม SET, มอบฉันทะ)
**URL:** `https://ivp.tsd.co.th/`

**Credentials ที่ต้องใช้:**
- เลขบัตรประชาชน 13 หลัก
- Laser Code (หลังบัตร)
- NDID หรือ ThaID App
- OTP ทาง SMS

**Flow:** ลงทะเบียนล่วงหน้า → เลือกบริษัท → มอบฉันทะ/โหวต → จ่ายอากรแสตมป์ผ่าน QR Code → รับ confirm

### IR PLUS AGM (ระบบที่ใช้กันในบริษัทจดทะเบียนขนาดกลาง)
**URL:** `https://webagm.irplus.in.th`

**KYC Process:**
1. กรอกเลขบัตรประชาชน
2. อัปโหลดรูปบัตรประชาชน
3. ถ่ายเซลฟี่ถือบัตร (facial match)
4. รับ OTP
5. ตั้ง 6-digit PIN
6. วันประชุม: login + โหวต

---

## 4. สิ่งที่ต้องการ vs ระบบเดิม

| Feature | ระบบเดิม | ที่ต้องเพิ่ม |
|---|---|---|
| ลงทะเบียนโดยเจ้าหน้าที่ (onsite) | ✅ มีแล้ว | คงไว้ |
| ลงทะเบียนออนไลน์โดยผู้ถือหุ้น | ❌ | ✅ **เพิ่มใหม่** |
| โหวตใน hall (เจ้าหน้าที่) | ✅ มีแล้ว | คงไว้ |
| โหวตออนไลน์ (ผู้ถือหุ้นเอง) | ❌ | ✅ **เพิ่มใหม่** |
| ยืนยันตัวตนด้วย OTP | ❌ | ✅ **เพิ่มใหม่** |
| Audit log ดิจิทัล | ❌ | ✅ **เพิ่มใหม่** |
| Dashboard real-time | ❌ | ✅ **เพิ่มใหม่** |

---

## 5. Infrastructure Context

### ปัจจุบัน (ระบบเดิม — ใช้เป็น reference เท่านั้น)
```
Internal Network เท่านั้น
  └── Server ภายใน (129.200.6.50 / 129.200.6.54)
        └── XAMPP: Eregist PHP + MySQL
              └── เข้าถึงได้เฉพาะใน hall / LAN
```

### อนาคต — Full Rebuild (เมื่อ Cloud Server พร้อม)
```
Internet (ผู้ถือหุ้นภายนอก + เจ้าหน้าที่ onsite)
  └── Cloud Server
        └── Docker Container(s)
              ├── Backend: Go API (Echo)
              ├── Frontend: Vue 3 + Vite
              └── DB: MySQL 8.0

⚠️ ไม่มี Internal PHP อีกต่อไป — ระบบใหม่ handle ทุกอย่าง
```

---

## 5.1 สถาปัตยกรรมใหม่ (Unified System)

> **เปลี่ยนจาก 2-Layer → Unified System**
> ระบบใหม่รองรับทั้ง Onsite (เจ้าหน้าที่) และ Online (ผู้ถือหุ้น) ในระบบเดียว

```
┌─────────────────────────────────────────────────────────────┐
│  CLOUD SERVER — TRU e-AGM Unified System (Docker)           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Go API — Echo Framework (Backend)                  │    │
│  │                                                     │    │
│  │  AUTH                                               │    │
│  │  POST /api/auth/login          — staff/admin login  │    │
│  │  POST /api/auth/register       — pre-reg ออนไลน์   │    │
│  │  POST /api/auth/verify-otp     — ยืนยัน OTP        │    │
│  │                                                     │    │
│  │  ONSITE (JWT required — role: staff/admin)          │    │
│  │  GET  /api/holders/search      — ค้นหาผู้ถือหุ้น   │    │
│  │  POST /api/registration        — ลงทะเบียน onsite  │    │
│  │  POST /api/registration/group  — ลงทะเบียนกลุ่ม    │    │
│  │  POST /api/vote/onsite         — โหวตแทน (staff)   │    │
│  │                                                     │    │
│  │  ONLINE (JWT required — role: holder)               │    │
│  │  GET  /api/agendas             — วาระที่เปิดโหวต   │    │
│  │  POST /api/vote/online         — โหวตออนไลน์       │    │
│  │  GET  /api/vote/my-votes       — ผลโหวตตัวเอง      │    │
│  │                                                     │    │
│  │  ADMIN (JWT required — role: admin)                 │    │
│  │  GET  /api/dashboard           — real-time result   │    │
│  │  PATCH /api/agendas/:id/toggle — เปิด/ปิดวาระ      │    │
│  │  GET  /api/audit-log           — audit log          │    │
│  │  GET  /api/export              — export report      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Vue 3 + Vite (Frontend)                            │    │
│  │  - ผู้ถือหุ้น: ลงทะเบียน / OTP / โหวต / ยืนยัน    │    │
│  │  - เจ้าหน้าที่: ค้นหา / ลงทะเบียน / โหวต onsite   │    │
│  │  - Admin: dashboard / จัดการวาระ / export          │    │
│  │  - Font: Prompt | Primary: #2563EB | Accent: #06B6D4│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  MySQL 8.0 (DB Container)                           │    │
│  │  - holder, master, termpartner  (migrate จากเดิม)  │    │
│  │  - regismaim, regisgroup, regissub (onsite votes)   │    │
│  │  - online_registration ⭐ (ใหม่)                    │    │
│  │  - votes_online ⭐ (ใหม่)                           │    │
│  │  - audit_log ⭐ (ใหม่)                              │    │
│  │  - useradmin (เพิ่ม role/bcrypt password)           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Nginx (Reverse Proxy + SSL)                                 │
└─────────────────────────────────────────────────────────────┘
```

### User Roles
| Role | สิทธิ์ |
|---|---|
| **holder** | ลงทะเบียนออนไลน์, โหวตออนไลน์, ดูผลตัวเอง |
| **staff** | ค้นหาผู้ถือหุ้น, ลงทะเบียน onsite, โหวตแทน |
| **admin** | ทุกอย่าง + เปิด/ปิดวาระ, dashboard, export, audit log |

### Data Migration (ครั้งเดียว)
| ตาราง | จาก | ถึง | หมายเหตุ |
|---|---|---|---|
| `holder` | MySQL เดิม | MySQL ใหม่ | export → import |
| `master` | MySQL เดิม | MySQL ใหม่ | ปีประชุม |
| `termpartner` | MySQL เดิม | MySQL ใหม่ | วาระการประชุม |
| `useradmin` | MySQL เดิม | MySQL ใหม่ | + bcrypt password |
| `regismaim/group/sub` | MySQL เดิม | MySQL ใหม่ | ประวัติ (optional) |

> ไม่มี Sync อีกต่อไป — ระบบใหม่คือ source of truth เลย

---

## 6. การเปลี่ยนแปลง DB ที่จะทำ (Minimal)

### ตารางใหม่ที่ต้องเพิ่ม

```sql
-- สำหรับ pre-registration ออนไลน์
CREATE TABLE online_registration (
  id INT AUTO_INCREMENT PRIMARY KEY,
  acc_id VARCHAR(20) NOT NULL,           -- จาก holder.Account_id
  id_card VARCHAR(13) NOT NULL,          -- ยืนยันกับ holder
  phone VARCHAR(20),
  email VARCHAR(100),
  otp_code VARCHAR(6),
  otp_expires_at DATETIME,
  otp_verified TINYINT DEFAULT 0,
  token VARCHAR(64),                     -- สำหรับ session โหวต
  token_expires_at DATETIME,
  ip_address VARCHAR(45),
  registered_at DATETIME,
  meeting_year INT,
  status ENUM('pending','verified','voted') DEFAULT 'pending',
  INDEX idx_acc (acc_id),
  INDEX idx_token (token)
);

-- เพิ่ม column ใน regissub เพื่อแยก channel
-- ALTER TABLE regissub ADD COLUMN vote_channel ENUM('onsite','online') DEFAULT 'onsite';
-- ALTER TABLE regissub ADD COLUMN voted_at DATETIME;
-- ALTER TABLE regissub ADD COLUMN voter_ip VARCHAR(45);

-- Audit log (บังคับตาม MDES พ.ศ. 2563)
CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  acc_id VARCHAR(20),
  action VARCHAR(50),         -- 'login','otp_request','vote','logout'
  detail TEXT,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  meeting_year INT
);
```

---

## 7. Flow การทำงานระบบใหม่

### A. Pre-Registration (ก่อนวันประชุม ~1-2 สัปดาห์)

```
ผู้ถือหุ้น
  │
  ▼
[กรอก Account ID + เลขบัตรประชาชน]
  │
  ▼
ระบบ: SELECT * FROM holder WHERE Account_id=? AND id_card=?
  │
  ├── ไม่พบ → แจ้ง "ไม่พบข้อมูลผู้ถือหุ้น"
  │
  └── พบ → ส่ง OTP ทาง SMS/Email (6 หลัก, หมดอายุ 10 นาที)
              │
              ▼
           กรอก OTP → ถูก → บันทึก token (UUID) ใน online_registration
                            ส่ง email ยืนยัน + link สำหรับวันประชุม
```

### B. วันประชุม — โหวตออนไลน์

```
ผู้ถือหุ้น
  │
  ▼
[เปิด link หรือ กรอก Account ID + ขอ OTP ใหม่]
  │
  ▼
ยืนยัน OTP → ได้รับ session
  │
  ▼
แสดงวาระที่ status=open (จาก termpartner.open = 1)
  │
  ▼
เลือก: เห็นด้วย / ไม่เห็นด้วย / งดออกเสียง / บัตรเสีย
  │
  ▼
บันทึกใน regissub (vote_channel='online') + audit_log
  │
  ▼
แสดงผลยืนยัน + lock ไม่ให้โหวตซ้ำ
```

---

## 8. ความปลอดภัยที่ต้องมี

| จุด | มาตรการ |
|---|---|
| OTP | หมดอายุ 10 นาที, ใช้ได้ 1 ครั้ง, rate limit 3 ครั้ง/ชม |
| Token | UUID v4, หมดอายุหลังประชุมจบ, ผูกกับ IP (optional) |
| โหวตซ้ำ | ตรวจก่อน INSERT ว่า acc_id โหวตวาระนี้แล้วหรือยัง |
| HTTPS | บังคับ (ต้องมี SSL cert บน nginx) |
| SQL Injection | ใช้ PDO + Prepared Statements ทั้งหมด |
| Log | บันทึกทุก action ตาม MDES (login, vote, logout) |
| PDPA | แจ้งผู้ถือหุ้นว่าเก็บข้อมูลอะไร + จะลบเมื่อไหร่ |

---

## 9. แผนการพัฒนา (Phase) — Full Rebuild

> ⚠️ ระหว่างรอ Cloud Server — dev บน Local Docker ก่อน แล้ว migrate ขึ้น Cloud

### Phase 0 — Design + เตรียมการ (2 สัปดาห์) ✅ กำลังทำอยู่
- [x] Flow diagram (Online + Onsite)
- [x] ER Diagram + Data Structure
- [x] Feature Compare
- [x] Framework Comparison + Stack Decision
- [x] UX/UI Design System (Prompt font, Blue #2563EB)
- [ ] Mockup ครบ 22 หน้า
- [ ] นำเสนอ stakeholder → ได้รับ Approve

### Phase 1 — Setup + Auth + Data Migration (2 สัปดาห์)
- [ ] Setup Go + Echo project structure
- [ ] Docker Compose local: go-api + mysql + vue-frontend + nginx
- [ ] Migrate ข้อมูลจาก MySQL เดิม → MySQL ใหม่
- [ ] API: Auth — login (staff/admin) + register + verify-otp
- [ ] JWT middleware (role: holder / staff / admin)
- [ ] Frontend: หน้า Login + Pre-Registration + OTP

### Phase 2 — Onsite System (3-4 สัปดาห์)
- [ ] API: ค้นหาผู้ถือหุ้น
- [ ] API: ลงทะเบียน onsite (รายบุคคล + กลุ่ม)
- [ ] API: ผู้ถือหุ้นมาสาย / novote
- [ ] API: โหวตแทน onsite + ป้องกันโหวตซ้ำ
- [ ] Frontend: หน้าเจ้าหน้าที่ทั้งหมด (7, 8, 9, 10, 11, 12, 13, 14)

### Phase 3 — Online Voting (2-3 สัปดาห์)
- [ ] API: Waiting Room — ดูวาระ
- [ ] API: โหวตออนไลน์ + ป้องกันซ้ำ (UNIQUE constraint)
- [ ] API: Vote confirmation + audit log
- [ ] Frontend: หน้าผู้ถือหุ้น (4, 5, 6)
- [ ] OTP Email (Phase แรก) → SMS Gateway (Production)

### Phase 4 — Admin + Dashboard (2 สัปดาห์)
- [ ] API: Real-time dashboard (Onsite + Online รวม)
- [ ] API: เปิด/ปิดโหวตรายวาระ
- [ ] API: Audit log viewer
- [ ] API: Export Excel / PDF
- [ ] Frontend: Admin pages ทั้งหมด (15-22)

### Phase 5 — Security + Deploy (1-2 สัปดาห์)
- [ ] Rate limiting (Echo middleware)
- [ ] HTTPS / SSL cert บน nginx
- [ ] PDPA consent flow
- [ ] Load test + UAT
- [ ] Deploy บน Cloud Server จริง
- [ ] DNS: agm.thairung.co.th

---

## 10. Framework Comparison — เปรียบเทียบและแนะนำ

### 10.1 Backend — Go Framework

> เลือก 1 ตัวสำหรับ Go API Server

| Framework | Speed | Security Built-in | Community | Learning Curve | แนะนำ |
|---|---|---|---|---|---|
| **Fiber** | ⭐⭐⭐⭐⭐ (~130k req/s) | ⭐⭐⭐ ปานกลาง | ⭐⭐⭐⭐ ใหญ่ | ง่าย (คล้าย Express) | ✅ ถ้าต้องการเร็วสูงสุด |
| **Echo** | ⭐⭐⭐⭐ (~70k req/s) | ⭐⭐⭐⭐ ดี | ⭐⭐⭐⭐ ใหญ่ | ปานกลาง | ✅ **แนะนำ** สมดุลดีที่สุด |
| **Gin** | ⭐⭐⭐⭐ (~55k req/s) | ⭐⭐⭐⭐ ดี | ⭐⭐⭐⭐⭐ ใหญ่มากสุด | ง่าย | ✅ ถ้าต้องการ community ใหญ่ |
| **net/http** | ⭐⭐⭐ (~45k req/s) | ⭐⭐⭐⭐⭐ Standard | ⭐⭐⭐⭐⭐ Go standard | ยาก (manual) | ไม่แนะนำสำหรับ production เร็ว |

**หมายเหตุ Speed:** ทุก Go framework เร็วกว่า PHP 5.x เดิมประมาณ 10–50 เท่า

**Security Built-in:**
| Feature | Fiber | Echo | Gin |
|---|---|---|---|
| Middleware JWT | ✅ | ✅ | ✅ |
| Rate Limiting | ✅ | ✅ | ✅ (ต้องใช้ pkg เพิ่ม) |
| CORS | ✅ | ✅ | ✅ |
| Helmet (HTTP headers) | ✅ | ✅ | ✅ (ต้องใช้ pkg เพิ่ม) |
| Input Validation | ⚠️ ต้องเพิ่ม | ✅ go-playground/validator | ✅ go-playground/validator |
| SQL Injection (ORM) | ✅ ผ่าน GORM/sqlx | ✅ ผ่าน GORM/sqlx | ✅ ผ่าน GORM/sqlx |

**⭐ Recommendation: Echo**
- สมดุลระหว่าง Speed + Security + Community
- Middleware ครบ: JWT, Rate-limit, CORS ในตัว
- Doc และ example ไทยมีพอสมควร

---

### 10.2 Frontend Framework

> เลือก 1 ตัวสำหรับ User Interface (หน้าโหวต, ลงทะเบียน)

| Framework | Performance | Security | Bundle Size | Learning Curve | เหมาะกับงานนี้ |
|---|---|---|---|---|---|
| **Next.js** | ⭐⭐⭐⭐⭐ SSR+SSG | ⭐⭐⭐⭐⭐ CSP/Header ครบ | กลาง | ปานกลาง (ต้องรู้ React) | ✅ **แนะนำ** ถ้า SEO + SSR สำคัญ |
| **Vue 3** | ⭐⭐⭐⭐ SPA | ⭐⭐⭐⭐ ดี | เล็กกว่า React | ง่ายกว่า React | ✅ ถ้า team เริ่มต้น frontend |
| **React** | ⭐⭐⭐⭐ SPA | ⭐⭐⭐⭐ ดี | กลาง | ปานกลาง | ✅ ถ้ามี React dev อยู่แล้ว |
| **Svelte** | ⭐⭐⭐⭐⭐ เร็วที่สุด | ⭐⭐⭐ ปานกลาง | เล็กมาก | ง่าย | ⚠️ Community ยังเล็ก |

**Security ที่สำคัญสำหรับงาน AGM:**
| Security Point | Next.js | Vue 3 | React |
|---|---|---|---|
| XSS Protection | ✅ Auto-escape | ✅ Auto-escape | ✅ Auto-escape |
| CSP Header | ✅ ง่ายผ่าน next.config | ⚠️ ต้องตั้ง nginx | ⚠️ ต้องตั้ง nginx |
| HTTPS-only | ✅ | ✅ | ✅ |
| JWT Token storage | ✅ httpOnly cookie | ✅ httpOnly cookie | ✅ httpOnly cookie |
| CSRF | ✅ Built-in | ⚠️ ต้องใช้ pkg เพิ่ม | ⚠️ ต้องใช้ pkg เพิ่ม |

**⭐ Recommendation: Vue 3 + Vite**
- เรียนรู้ง่ายสุดสำหรับ team ที่เริ่มต้น
- ไม่จำเป็นต้องมี SSR (หน้า AGM ต้องการ auth ก่อน = ไม่ต้อง SEO)
- Bundle เล็ก = โหลดเร็วบน mobile ของผู้ถือหุ้น
- ถ้า team รู้ React อยู่แล้ว → เลือก Next.js แทนได้ทันที

---

### 10.3 Database บน Cloud

| DB | Performance | Security | JSON Support | Go Driver | ค่า Migrate จาก MySQL |
|---|---|---|---|---|---|
| **MySQL 8.0** | ⭐⭐⭐⭐ ดี | ⭐⭐⭐⭐ ดี | ✅ (JSON column) | go-sql-driver/mysql | ง่ายมาก (schema เดิมใช้ได้เลย) |
| **PostgreSQL 16** | ⭐⭐⭐⭐⭐ ดีกว่า | ⭐⭐⭐⭐⭐ ดีกว่า | ✅ JSONB (เร็วกว่า) | pgx (native, เร็วกว่า) | ต้องแปลง syntax บางส่วน |

**Security ที่ต่างกัน:**
- PostgreSQL: Row-Level Security (RLS), ควบคุม permission รายแถวได้
- MySQL: Table-level permission เป็นหลัก
- ทั้งคู่: SSL connection, encrypted-at-rest ถ้า configure

**⭐ Recommendation: MySQL 8.0**
- Schema ตรงกับระบบเดิม 100% — Sync ข้อมูล holder/termpartner ง่ายกว่า
- ลด risk migration
- ทีม DBA/Dev คุ้นเคยอยู่แล้ว
- MySQL 8.0 ปลอดภัยและเร็วเพียงพอสำหรับ AGM ที่ไม่ได้มี concurrent สูงมาก

---

### 10.4 OTP / Email / SMS Gateway

| ช่องทาง | ค่าใช้จ่าย | ความเชื่อถือได้ | Setup | แนะนำ |
|---|---|---|---|---|
| **Email (SMTP)** | ฟรี (ใช้ Gmail/Outlook TRU) | ⭐⭐⭐ อาจตก spam | ง่ายมาก | ✅ Phase แรก |
| **SendGrid** | Free tier 100 msg/วัน | ⭐⭐⭐⭐⭐ | ง่าย (API) | ✅ ถ้าต้องการ reliable |
| **SMS (DTAC/AIS API)** | ~0.5–1 บาท/ข้อความ | ⭐⭐⭐⭐⭐ เชื่อถือได้มาก | ต้องสมัคร + contract | ✅ Phase หลัก |
| **Twilio SMS** | ~1–2 บาท/ข้อความ | ⭐⭐⭐⭐⭐ | API ง่าย | ✅ ถ้าไม่มี local SMS gateway |

**⭐ Recommendation:**
- Phase 1 (dev/test): **Email** — ง่าย ไม่มีค่าใช้จ่าย
- Production: **SMS** — ผู้ถือหุ้น (มักสูงอายุ) เช็ค SMS มากกว่า email

---

### 10.5 Stack สรุปที่แนะนำ

```
┌─────────────────────────────────────────────┐
│  TRU e-AGM — Recommended Tech Stack         │
│                                              │
│  Backend   : Go + Echo Framework             │
│  Frontend  : Vue 3 + Vite                   │
│  Database  : MySQL 8.0 (Docker)             │
│  OTP Phase1: Email SMTP (ฟรี, เริ่มต้น)     │
│  OTP Prod  : SMS Gateway (DTAC/AIS/Twilio)  │
│  Container : Docker + Docker Compose         │
│  Reverse   : Nginx (SSL termination)         │
│  Auth      : JWT (Echo JWT middleware)       │
└─────────────────────────────────────────────┘
```

| Layer | เทคโนโลยี | เหตุผล |
|---|---|---|
| Backend API | **Go + Echo** | เร็ว, Security middleware ครบ, ประหยัด server resource |
| Frontend | **Vue 3 + Vite** | เรียนง่าย, bundle เล็ก, mobile friendly |
| Database | **MySQL 8.0** | Compatible กับระบบเดิม, migrate ง่าย |
| OTP (Phase 1) | **Email SMTP** | ไม่มีค่าใช้จ่าย สำหรับช่วง dev |
| OTP (Production) | **SMS Gateway** | เชื่อถือได้กว่า email สำหรับ AGM จริง |
| Container | **Docker** | Deploy ง่าย, isolate, scale ได้ |
| Reverse Proxy | **Nginx** | SSL, rate limit, static serve |

---

## 11. คำถามที่ต้องตัดสินใจก่อนพัฒนา

| # | คำถาม | ตัวเลือก | หมายเหตุ |
|---|---|---|---|
| 1 | **Frontend Framework** | Next.js / Vue 3 / React / Svelte | Go API รองรับได้ทุกตัว |
| 2 | **OTP Channel** | Email (ฟรี/ง่าย) หรือ SMS (ต้องซื้อ gateway) | SMS เชื่อถือได้กว่าแต่มีค่าใช้จ่าย |
| 3 | **KYC Level** | แค่ Account ID + บัตรประชาชน หรือ ต้องถ่ายรูปบัตรด้วย | ระบบในไทยส่วนใหญ่ใช้แค่ข้อมูล + OTP |
| 4 | **โหวตออนไลน์** | โหวตล่วงหน้า (pre-vote) หรือ โหวตระหว่างประชุมเท่านั้น | ระบบเดิม real-time เท่านั้น |
| 5 | **Cloud Timeline** | Cloud Server มีพร้อมเมื่อไหร่? | กระทบ Phase 4 |
| 6 | **DB บน Cloud** | MySQL (ตรงกับเดิม) หรือ PostgreSQL (Go นิยมกว่า) | migrate ง่ายกว่าถ้าใช้ MySQL |
| 7 | **Go Framework** | Gin / Echo / Fiber / net/http | Gin = ใช้กันมากสุด |
| 8 | **Subdomain** | `evote.thairung.co.th` หรือ path ใต้ domain เดิม | ต้องขอ DNS จาก IT |

---

## References

- [พ.ร.ก. ประชุมอิเล็กทรอนิกส์ พ.ศ. 2563](https://www.etda.or.th/th/Our-Service/e-meeting/law.aspx)
- [ประกาศ MDES มาตรฐานความปลอดภัย](https://mdes.go.th/law/128)
- [ETDA — รับรองระบบ e-Meeting](https://www.etda.or.th/th/Our-Service/e-meeting.aspx)
- [Inventech Connect](https://www.inventech.co.th/services/inventech-connect/)
- [TSD Investor Portal](https://ivp.tsd.co.th/)
- [IR PLUS AGM](https://irplusagm.in.th/)
- [SET DAP e-Shareholder Meeting](https://www.set.or.th/en/dap/services/emeeting-platform)
