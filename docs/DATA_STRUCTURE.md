# Data Structure — Eregist

> ตารางเดิม = สีเทา | ตารางใหม่ ⭐ = สีน้ำเงิน
> **ทุกตารางเดิมใช้ Engine=MyISAM** — ไม่รองรับ Foreign Key constraints จริง, relation เป็นเชิง logic เท่านั้น

---

## ตารางเดิม (Existing Tables)

### 1. `holder` — ข้อมูลผู้ถือหุ้น (ตารางหลัก)

> ⚠️ ไม่มี PRIMARY KEY ใน DDL จริง — `Account_id` ใช้เป็น de facto key ในทุก JOIN

| Column | Type | คำอธิบาย |
|---|---|---|
| security | varchar(5) | Prefix บริษัท เช่น 'TRU' |
| **Account_id** | varchar(15) | รหัสผู้ถือหุ้น (de facto PK, NOT NULL) |
| Holder_type | varchar(1) | 0=บริษัทตนเอง, 1=บุคคล, 2=นิติบุคคล, 3=ต่างชาติ |
| Q_share | int(11) | จำนวนหุ้น |
| I_title | varchar(3) | รหัสคำนำหน้า (เช่น '103'=นาย, '104'=นาง, '105'=น.ส.) |
| N_title | varchar(50) | คำนำหน้าชื่อ (TH) เช่น 'นาย', 'นาง', 'บริษัท' |
| N_first | varchar(150) | ชื่อ (หรือชื่อบริษัท) |
| N_last | varchar(255) | นามสกุล |
| A_holder | varchar(255) | ที่อยู่ |
| I_zip | varchar(7) | รหัสไปรษณีย์ |
| H_phone | varchar(100) | โทรศัพท์บ้าน |
| W_phone | varchar(50) | โทรศัพท์ที่ทำงาน |
| M_phone | varchar(50) | โทรศัพท์มือถือ |
| I_Fax | varchar(29) | แฟกซ์ |
| I_Email | varchar(100) | อีเมล |
| C_tax | varchar(1) | มีหนังสือรับรอง Y/N |
| I_tax | varchar(50) | เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน / Passport |
| Tax_rate | varchar(9) | อัตราภาษี |
| I_natve | varchar(5) | รหัสสัญชาติ (000=ไทย, C20=ฮ่องกง, M10=มาเลเซีย, S20=สิงคโปร์) |
| I_occupation | varchar(50) | รหัสอาชีพ |
| Codebank | varchar(5) | รหัสธนาคาร |
| Account | varchar(50) | เลขบัญชีธนาคาร |
| Parti | varchar(5) | รหัส participation |
| Reftype | varchar(3) | รูปแบบอ้างอิง (0=ไม่มี, 3=ต่างชาติ, 5=นิติบุคคล, 9=TSD) |
| I_ref | varchar(50) | เลขอ้างอิง |
| S_mail | varchar(50) | รหัสพัสดุไปรษณีย์ |
| Year_do | varchar(5) | ปีที่เป็นผู้ถือหุ้น |

---

### 2. `master` — ตั้งค่าปีประชุม

| Column | Type | คำอธิบาย |
|---|---|---|
| **id** | int(11) AUTO | **PK** |
| codemaster | varchar(4) | รหัสปี เช่น '2025', '2026' |
| detailmaster | varchar(255) | รายละเอียดประชุม |
| datemaster | varchar(80) | วันที่ประชุม (เก็บเป็น string เช่น 'วันจันทร์ที่ 28 เมษายน 2568 เวลา 14.00 น.') |
| updmaster | timestamp | auto update |
| closed_at | DATETIME | ⭐ **NULL** = กำลังดำเนินการ (Active) \| **มีค่า** = ปิดการประชุมแล้ว (Locked, Read-only) |

> **Meeting Status Logic (ระบบใหม่):**
> - `closed_at IS NULL` → Active — แก้ไข/โหวต/ลงทะเบียนได้ปกติ
> - `closed_at IS NOT NULL` → Locked — ดูได้อย่างเดียว ห้าม write ทุก endpoint
> - ปีเก่าที่ผ่านมา → Locked ทั้งหมด ดูย้อนหลังได้แบบ read-only

---

### 3. `termpartner` — วาระการประชุม

> ⚠️ `id` เป็น PK แต่ **ไม่ใช่ AUTO_INCREMENT** — ต้อง set เอง | `term_id` เป็น varchar เช่น '1', '5.1', '5.2'

| Column | Type | คำอธิบาย |
|---|---|---|
| **id** | int(11) | **PK** (manual set) |
| term_id | varchar(5) | รหัสวาระ เช่น '1', '5.1', '5.2', '5.3' |
| term_name | varchar(255) | ชื่อวาระ (ภาษาไทย) |
| term_name_en | varchar(255) | ชื่อวาระ (ภาษาอังกฤษ) |
| closevote | timestamp | เวลาปิดโหวต (auto update) |
| watermark | varchar(1) | '1' = มีลายน้ำ |
| relateshare | int(11) | จำนวนหุ้นที่เกี่ยวข้อง (นับรวมจาก regissub) |
| countshare | int(11) | จำนวนผู้ถือหุ้นที่ลงคะแนน |
| open | varchar(1) | '0'=ปิด, '1'=เปิดโหวต |
| statusprint | enum('on','off') | สถานะพิมพ์ผล |

---

### 4. `regismaim` — การลงทะเบียนเข้าประชุม

| Column | Type | คำอธิบาย |
|---|---|---|
| **id** | int(11) AUTO | **PK** |
| id_acc | varchar(25) | FK → holder.Account_id |
| name_regis | varchar(255) | ชื่อที่ลงทะเบียน |
| mq_share | int(11) | จำนวนหุ้นที่นำมาลงทะเบียน |
| group_regis | varchar(50) | ชื่อกลุ่ม (NULL ถ้าไม่มีกลุ่ม) |
| group_type | varchar(100) | '0'=บุคคล, '1'=มอบฉันทะ, หรือชื่อกลุ่ม |
| admin_regist | varchar(50) | username เจ้าหน้าที่ที่ลงทะเบียนให้ |
| upd_regis | timestamp | เวลาลงทะเบียน (auto update) |

---

### 5. `regisgroup` — การลงทะเบียนแบบกลุ่ม

| Column | Type | คำอธิบาย |
|---|---|---|
| **id_group** | int(11) AUTO | **PK** |
| id_acc | varchar(10) | FK → holder.Account_id (หัวกลุ่ม) |
| name_group | varchar(255) | ชื่อกลุ่ม |
| totle_regis | int(11) | จำนวนหุ้นรวมของกลุ่ม |
| upd_addgroup | timestamp | เวลาสร้างกลุ่ม |

---

### 6. `regissub` — ผลโหวตรายวาระ (Onsite)

> ⚠️ **ไม่มี PK** — มีแค่ UNIQUE KEY (id_term, id_acc)
> ⚠️ Engine=MyISAM — ไม่รองรับ FK จริง
> **Pattern**: ลงทะเบียน 1 คน → INSERT 8 rows ทันที (ทุกวาระ) ด้วย full_term=Q_share, ที่เหลือ=0 → ถ้าโหวตค่อย UPDATE

| Column | Type | คำอธิบาย |
|---|---|---|
| id_term | int(2) | FK → termpartner.id |
| id_acc | varchar(25) | FK → holder.Account_id |
| agree_term | int(11) | **หุ้นที่โหวตไม่เห็นด้วย** (⚠️ ชื่อ column ทำให้สับสน — จริงๆ คือ disagree) |
| noc_term | int(11) | หุ้นที่งดออกเสียง (abstain) |
| full_term | int(11) | หุ้นทั้งหมดของผู้ถือหุ้นนี้ |
| fail_term | int(11) | บัตรเสีย (spoiled ballot) |
| time_regis | timestamp | เวลาลงทะเบียน (ไม่ใช่เวลาโหวต) |

> **กฎ Auto-agree:**
> `เห็นด้วย = full_term - agree_term(disagree) - noc_term - fail_term`
> ผู้ถือหุ้นที่ลงทะเบียนแต่ไม่โหวต → ถูกนับเป็น "เห็นด้วย" อัตโนมัติ

---

### 7. `novote` — ผู้ถือหุ้นที่ไม่มีสิทธิ์โหวต

| Column | Type | คำอธิบาย |
|---|---|---|
| **id_novote** | int(2) AUTO | **PK** |
| id_term | varchar(5) | FK → termpartner.term_id |
| acc_novote | varchar(30) | FK → holder.Account_id |
| name_novote | varchar(100) | ชื่อผู้ถือหุ้น |
| share_novote | int(11) | จำนวนหุ้น |

---

### 8. `holderlate` — ผู้ถือหุ้นมาสาย

> ⚠️ UNIQUE KEY AccID — 1 คน มีได้แค่ 1 record (ไม่ใช่ per term)
> ⚠️ ENGINE=MyISAM, CHARSET=tis620

| Column | Type | คำอธิบาย |
|---|---|---|
| **HLKey** | int(7) AUTO | **PK** |
| AccID | varchar(29) | FK → holder.Account_id |
| TermID | varchar(5) | term_id ที่เปิดอยู่ตอนมาสาย |
| CoopQty | double | จำนวนหุ้นที่นำมา |
| LastDate | datetime | เวลาที่มาถึง |

---

### 9. `useradmin` — ผู้ดูแลระบบ

> ⚠️ **password เก็บเป็น plain text** varchar(20) — ต้องแก้ในระบบใหม่

| Column | Type | คำอธิบาย |
|---|---|---|
| **ida** | int(11) AUTO | **PK** |
| Fullname | varchar(80) | ชื่อเต็ม |
| usr | varchar(20) | username |
| pws | varchar(20) | password (⚠️ plain text) |
| Part | varchar(100) | แผนก เช่น 'ITD', 'OMD' |
| etc | varchar(255) | role: 'Creator' / 'Admin' / 'User' |

---

## ตารางใหม่ ⭐ (New Tables — ระบบใหม่ Go+Echo)

### 10. `online_registration` ⭐ — ลงทะเบียนออนไลน์

| Column | Type | คำอธิบาย |
|---|---|---|
| **id** | INT AUTO | **PK** |
| acc_id | varchar(15) | FK → holder.Account_id |
| meeting_year | varchar(4) | FK → master.codemaster |
| id_card_hash | varchar(64) | เลขบัตร (hashed — ไม่เก็บ plain text) |
| phone | varchar(50) | เบอร์มือถือ (M_phone) |
| email | varchar(100) | อีเมล (I_Email) |
| otp_code | varchar(64) | OTP (hashed) |
| otp_expires_at | DATETIME | OTP หมดอายุ |
| otp_verified | TINYINT | 0=ยังไม่ยืนยัน, 1=ยืนยันแล้ว |
| token | varchar(64) | UUID session สำหรับโหวต |
| token_expires_at | DATETIME | token หมดอายุ |
| ip_address | varchar(45) | IP ที่ลงทะเบียน |
| registered_at | DATETIME | เวลาลงทะเบียน |
| status | ENUM | `pending` / `verified` / `voted` |

**Index:** `idx_acc_id`, `idx_token`, `idx_meeting_year`

---

### 11. `votes_online` ⭐ — ผลโหวตออนไลน์

> แยกจาก regissub เพราะ: เก็บ choice (ENUM) ไม่ใช่ aggregate shares, ต้องมี IP+timestamp ตาม MDES 2563, ต้องรู้ว่า vote มาจาก session ไหน

| Column | Type | คำอธิบาย |
|---|---|---|
| **id** | INT AUTO | **PK** |
| online_reg_id | INT | FK → online_registration.id |
| acc_id | varchar(15) | FK → holder.Account_id |
| term_id | varchar(5) | FK → termpartner.term_id |
| vote_choice | ENUM | `agree` / `disagree` / `abstain` / `spoiled` |
| voted_at | DATETIME | เวลาโหวต |
| ip_address | varchar(45) | IP ที่โหวต |
| meeting_year | varchar(4) | ปีประชุม |

**Unique Constraint:** `(acc_id, term_id)` — ป้องกันโหวตซ้ำ

---

### 12. `audit_log` ⭐ — บันทึก Audit (ตาม MDES 2563)

| Column | Type | คำอธิบาย |
|---|---|---|
| **id** | INT AUTO | **PK** |
| acc_id | varchar(15) | Account_id (nullable — ถ้ายังไม่ login) |
| action | varchar(50) | `login` / `otp_request` / `vote` / `logout` / `register` |
| detail | TEXT (JSON) | ข้อมูลเพิ่มเติม |
| ip_address | varchar(45) | IP Address |
| user_agent | varchar(255) | Browser/Device |
| created_at | DATETIME | เวลา (auto) |
| meeting_year | varchar(4) | ปีประชุม |

**Index:** `idx_acc_id`, `idx_action`, `idx_created_at`

---

## Relationships Summary (Logical — ไม่มี FK จริงใน MyISAM)

```
master (1) ─────────────── (N) termpartner
master (1) ─────────────── (N) online_registration ⭐

holder (1) ─────────────── (N) regismaim
holder (1) ─────────────── (N) regisgroup
holder (1) ─────────────── (N) regissub
holder (1) ─────────────── (N) novote
holder (1) ─────────────── (N) holderlate
holder (1) ─────────────── (N) online_registration ⭐
holder (1) ─────────────── (N) votes_online ⭐

regisgroup (1) ──────────── (N) regismaim

termpartner (1) ─────────── (N) regissub
termpartner (1) ─────────── (N) novote
termpartner (1) ─────────── (N) votes_online ⭐

online_registration (1) ──── (N) votes_online ⭐
```

---

## SQL — สร้างตารางใหม่ (Engine=InnoDB, ระบบใหม่)

```sql
-- online_registration
CREATE TABLE online_registration (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  acc_id           VARCHAR(15) NOT NULL,
  meeting_year     VARCHAR(4) NOT NULL,
  id_card_hash     VARCHAR(64) NOT NULL,
  phone            VARCHAR(50),
  email            VARCHAR(100),
  otp_code         VARCHAR(64),
  otp_expires_at   DATETIME,
  otp_verified     TINYINT DEFAULT 0,
  token            VARCHAR(64),
  token_expires_at DATETIME,
  ip_address       VARCHAR(45),
  registered_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  status           ENUM('pending','verified','voted') DEFAULT 'pending',
  INDEX idx_acc    (acc_id),
  INDEX idx_token  (token),
  INDEX idx_year   (meeting_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- votes_online
CREATE TABLE votes_online (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  online_reg_id  INT NOT NULL,
  acc_id         VARCHAR(15) NOT NULL,
  term_id        VARCHAR(5) NOT NULL,
  vote_choice    ENUM('agree','disagree','abstain','spoiled') NOT NULL,
  voted_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address     VARCHAR(45),
  meeting_year   VARCHAR(4),
  UNIQUE KEY uq_acc_term (acc_id, term_id),
  INDEX idx_term (term_id),
  INDEX idx_year (meeting_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- audit_log
CREATE TABLE audit_log (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  acc_id       VARCHAR(15),
  action       VARCHAR(50) NOT NULL,
  detail       TEXT,
  ip_address   VARCHAR(45),
  user_agent   VARCHAR(255),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  meeting_year VARCHAR(4),
  INDEX idx_acc    (acc_id),
  INDEX idx_action (action),
  INDEX idx_time   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
