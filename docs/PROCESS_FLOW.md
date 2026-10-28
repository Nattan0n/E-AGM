# E-AGM Process Flow

> อัปเดต: 2026-10-07 | อ้างอิงจากระบบเก่า Eregist + ข้อกำหนดระบบใหม่ Go+Echo+Next.js+MySQL 8

---

## 0. ภาพรวม Role

| Role | ช่องทาง | หน้าที่ |
|---|---|---|
| **ผู้ถือหุ้น (Online)** | Mobile / Browser | ลงทะเบียน OTP → ลงคะแนนเอง |
| **เจ้าหน้าที่ Onsite (Staff)** | Tablet / Laptop ที่ Venue | ลงทะเบียนแทน → ลงคะแนนแทน |
| **Admin (ITD/OMD)** | Desktop / Laptop | ตั้งค่าระบบ → เปิด/ปิดวาระ → ดูผล |

---

## 1. Pre-Meeting Phase — ก่อนวันประชุม (~2 เดือน)

```
OMD ส่ง Excel → ITD ดำเนินการ
────────────────────────────────────────────────────────────

STEP 1: รับข้อมูลจาก OMD (Excel 4 ไฟล์)
  ├─ รายชื่อผู้ถือหุ้น (→ holder)
  ├─ วาระการประชุม (→ termpartner)
  ├─ รายชื่อผู้ไม่มีสิทธิ์โหวต (→ novote)
  └─ วันที่/รายละเอียดประชุม (→ master)

STEP 2: Backup ฐานข้อมูลปีที่แล้ว
  └─ Export SQL ทั้ง DB เก็บไว้ → เปิดดูย้อนหลังได้

STEP 3: Clear Data (ล้างทั้งหมดยกเว้น useradmin)
  ├─ TRUNCATE: holder, regismaim, regisgroup, regissub
  ├─ TRUNCATE: holderlate, novote, termpartner
  └─ UPDATE: master (วันที่ใหม่)

STEP 4: Import ข้อมูลใหม่
  ├─ แปลง Excel → SQL
  └─ INSERT: holder (ใหม่ทั้งหมด), termpartner, novote, master

STEP 5: Test รอบ ITD (Internal Test)
  ├─ ลงทะเบียนผู้ถือหุ้น: แบบบุคคล / มอบฉันทะ / กลุ่ม
  ├─ เปิดวาระ → ลงคะแนน (ทุก option: เห็นด้วย/ไม่เห็น/งด/บัตรเสีย)
  ├─ ปิดวาระ → ตรวจสอบยอดหุ้นตรงกัน
  ├─ ทำซ้ำจนครบทุกวาระ → ดูสรุปผล
  └─ ✅ ผ่าน → Clear Data กลับสู่สถานะ Clean

STEP 6: Test รอบ OMD (UAT)
  ├─ OMD ทดสอบร่วม: ลงทะเบียน + โหวต
  └─ ✅ ผ่าน → Clear Data → พร้อมใช้งานจริง

STEP 7: OMD ลงทะเบียนล่วงหน้า (Pre-registration)
  └─ Staff ลงทะเบียนผู้ถือหุ้นที่ส่งแบบมอบฉันทะมาล่วงหน้า
```

> **⚠️ ระบบใหม่ควรเพิ่ม:** Import Excel โดยตรงในระบบ (ไม่ต้องแปลง SQL เอง) + ปุ่ม Clear Data ใน Admin พร้อม Confirmation modal

---

## 2. ดูข้อมูลย้อนหลัง (History)

```
ระบบเก่า:
  └─ เก็บเป็น SQL Backup file แยกปี → ดูต้อง restore ผ่าน phpMyAdmin

ระบบใหม่ (Go + Next.js):
  ├─ ตาราง transactional ทุกตัวมี meeting_year column
  │   (termpartner, regissub, votes_online, online_registration,
  │    regismaim, regisgroup, holderlate, audit_log)
  │
  ├─ Close Meeting → set master.closed_at
  │   → Auto-backup SQL (safety export เท่านั้น ไม่ใช่แหล่งข้อมูลหลัก)
  │
  ├─ DB คือ source of truth — ข้อมูลทุกปีสะสมอยู่ใน DB
  │
  └─ Admin หน้า "ประวัติการประชุม":
      ├─ dropdown เลือกปี (จาก master table ที่ closed_at มีค่า)
      ├─ query ด้วย WHERE meeting_year = ? ทุกตาราง
      ├─ แสดง: ผลโหวตแต่ละวาระ, จำนวนผู้ลงทะเบียน, Quorum %
      ├─ ทุกปุ่ม Edit/Delete disabled → view-only
      └─ มีปุ่ม "ส่งออกรายงาน" เท่านั้น
```

---

## 3. Flow ผู้ถือหุ้น (Online)

```
[เข้า URL ระบบ]
      │
      ▼
[กรอก: รหัสผู้ถือหุ้น + เลขบัตร + เบอร์มือถือ + Email]
      │
      ├─ ❌ ข้อมูลไม่ตรง → แจ้งเตือน (กรอกใหม่)
      ├─ ❌ อยู่ใน novote → แจ้งว่าไม่มีสิทธิ์
      │
      ▼ ✅
[เลือกช่องทางรับ OTP: SMS หรือ Email]
      │
      ▼
[กรอก OTP 6 หลัก] (หมดอายุ 10 นาที)
      │
      ├─ ❌ OTP ผิด / หมดอายุ → ขอ OTP ใหม่
      │
      ▼ ✅ (บันทึกลง online_registration, status=verified)
[ห้องรอเข้าประชุม]
  ├─ แสดง: ชื่อ, จำนวนหุ้น, สถานะองค์ประชุม
  └─ รอ Admin เปิดวาระ
      │
      ▼ (Admin เปิดวาระ)
[หน้าลงคะแนนเสียง]
  ├─ แสดงทุกวาระ (เปิดอยู่ = กดได้, รอ = กดไม่ได้)
  ├─ กดเลือก: เห็นด้วย / ไม่เห็นด้วย / งดออกเสียง / บัตรเสีย
  └─ บันทึกลง votes_online (UNIQUE acc_id+term_id — โหวตซ้ำไม่ได้)
      │
      ▼ (Admin ปิดวาระสุดท้าย)
[ยืนยันการลงคะแนน]
  └─ แสดงสรุปทุกวาระที่โหวตแล้ว + วาระที่ไม่ได้โหวต (= auto-agree)
```

---

## 4. Flow เจ้าหน้าที่ Onsite (Staff)

```
[Login ด้วย usr + pws]
      │
      ▼
[ค้นหาผู้ถือหุ้น]
  ├─ ค้นด้วย: รหัส / ชื่อ / เลขบัตร
  └─ ✅ พบ → เลือก Case

      ┌─────────────────────────────────────┐
      │          เลือก Case ลงทะเบียน       │
      └─────────────────────────────────────┘
      │                │                   │
      ▼                ▼                   ▼
[บุคคล]         [มอบฉันทะ]           [กลุ่ม]
 ลงทะเบียน       ระบุผู้รับมอบ         สร้างกลุ่ม
 ผู้ถือหุ้นเอง    + จำนวนหุ้น           + เพิ่มสมาชิก
      │                │                   │
      └────────────────┴───────────────────┘
                       │
                       ▼
      [บันทึกลง regismaim + regissub (pre-fill ทุกวาระ)]
                       │
                       ▼ (Admin เปิดวาระ)
      [ลงคะแนนแทน (Onsite)]
        ├─ ค้นหาผู้ถือหุ้นที่ลงทะเบียนแล้ว
        ├─ กดเลือก: เห็นด้วย / ไม่เห็นด้วย / งด / บัตรเสีย
        └─ UPDATE regissub (agree_term / noc_term / fail_term)

      [ผู้ถือหุ้นมาสาย]
        ├─ ค้นหา → ลงทะเบียน (เหมือนปกติ)
        └─ บันทึกลง holderlate (เวลามาถึง)

      [จัดการผู้ไม่มีสิทธิ์]
        └─ เพิ่ม/ลบ รายชื่อจาก novote
```

---

## 5. Flow Admin

```
[Login ด้วย usr + pws (role=Creator/Admin)]
      │
      ▼
[Dashboard]
  ├─ ดู: จำนวนผู้ลงทะเบียน, องค์ประชุม %, สถานะแต่ละวาระ
  └─ Realtime update

      ┌──────────────────────────────────────────┐
      │           Admin Actions                  │
      └──────────────────────────────────────────┘
      │           │           │           │
      ▼           ▼           ▼           ▼
[ตั้งค่า]  [จัดการวาระ]  [เปิด/ปิด]  [ดูผล]
 master      termpartner    voting      results
 วันที่      เพิ่ม/แก้วาระ  คลิกปุ่ม   ส่งออก
                           เปิด/ปิด    รายงาน

[เปิด/ปิดวาระ — ขั้นตอนสำคัญ]
  ├─ เปิดวาระ → set termpartner.open='1'
  │   → ผู้ถือหุ้นออนไลน์เห็นปุ่มโหวต, Staff โหวตแทนได้
  │
  └─ ปิดวาระ → set termpartner.open='0'
      ├─ [⚠️ แสดง Modal Warning]:
      │   "ผู้ที่ยังไม่ได้โหวตจะถูกนับเป็น เห็นด้วย อัตโนมัติ"
      │   "กรุณายืนยัน: [ ] รับทราบและยืนยันผลการนับอัตโนมัติ"
      ├─ คำนวณ auto-agree: full_term - agree_term - noc_term - fail_term
      └─ อัปเดต countshare, relateshare ใน termpartner

[ลงทะเบียนออนไลน์ (Admin View)]
  └─ ดูรายการ + สถานะ online_registration ทุก record

[สรุปผลการประชุม]
  ├─ รวม Onsite: จาก regissub aggregate
  ├─ รวม Online: จาก votes_online × Q_share
  └─ แสดงตาราง: เห็นด้วย / ไม่เห็นด้วย / งด / บัตรเสีย / มติ

[ส่งออกรายงาน]
  └─ Export PDF / Excel รายวาระ

[Audit Log]
  └─ ดู log ทุก action พร้อม timestamp + IP

[ปิดการประชุม (Close Meeting)]
  ├─ กดได้หลังจาก: Vote ครบทุกวาระ + ส่งผลให้ OMD แล้ว
  ├─ [Modal ยืนยัน]: "เมื่อปิดการประชุมแล้ว จะไม่สามารถแก้ไขข้อมูลใดๆ ได้อีก"
  ├─ set master.closed_at = NOW()
  ├─ ทุก API endpoint ตรวจ closed_at ก่อน write → ถ้า locked → reject 403
  └─ สถานะบน Dashboard เปลี่ยนเป็น "ปิดการประชุมแล้ว" (badge สีเทา)

[ดูข้อมูลย้อนหลัง (Read-only)]
  ├─ เลือกปีจาก dropdown → โหลดข้อมูลปีนั้น
  ├─ ปีที่ closed_at มีค่า → แสดงทั้งหมดแบบ view-only
  ├─ ไม่มีปุ่ม Edit / Delete ทุกปุ่ม disabled
  └─ มีปุ่ม "ส่งออกรายงาน" เท่านั้น

[Clear Data]
  ├─ STEP 1 — Auto Backup อัตโนมัติ:
  │   dump SQL ทั้ง DB → บันทึกเป็น backup_{year}_{datetime}.sql
  │   แสดง "Backup สำเร็จ" + ปุ่ม Download
  ├─ STEP 2 — [Modal ยืนยัน 2 ชั้น]:
  │   ชั้น 1: "คุณแน่ใจหรือไม่? จะล้างข้อมูลทั้งหมดของปี {year}"
  │   ชั้น 2: พิมพ์ "ยืนยันลบข้อมูล" เพื่อ unlock ปุ่มยืนยัน
  ├─ STEP 3 — ล้าง: holder, regismaim, regisgroup, regissub,
  │         holderlate, novote, termpartner, online_registration, votes_online, audit_log
  └─ ไม่ล้าง: useradmin
```

---

## 6. กรณีพิเศษ — Online Register แต่มา Onsite จริง

```
ผู้ถือหุ้นลงทะเบียน Online (มี token) แต่มาที่ venue วันจริง

Case A: มีโทรศัพท์ + สัญญาณดี
  └─ ใช้ phone โหวตผ่าน Online system ตามปกติ ✅ (ไม่มีปัญหา)
     Staff อาจ "Check-in" ที่ Onsite เพื่อนับ Quorum เพิ่ม
     แต่ vote ยังเป็น votes_online (ป้องกัน double-vote)

Case B: ลืม phone / สัญญาณไม่มี / ต้องการให้ Staff ช่วย
  └─ Staff ค้นหาใน online_registration → พบ record
     → Admin/Staff กด "Convert to Onsite"
       1. ยกเลิก online token (status='cancelled')
       2. สร้าง regismaim + regissub (Onsite record)
       3. Staff ลงคะแนนแทนได้ตามปกติ
     ⚠️ ต้องมีบันทึกใน audit_log ว่า convert ทำโดยใคร

Case C: ลงทะเบียน Online แล้วมา Onsite โดยไม่บอก
  └─ Staff ค้นหา Account_id → พบใน online_registration (verified)
     → แจ้งว่า "ลงทะเบียน Online แล้ว กรุณาใช้โทรศัพท์โหวต"
     → ถ้าจำเป็น → ทำ Case B

⚠️ ป้องกัน Double-vote:
  - ถ้ามี record ใน online_registration (verified/voted) → ห้าม insert regissub ซ้ำ
  - UNIQUE constraint (acc_id, term_id) ใน votes_online
  - ตรวจสอบ cross-table ก่อน pre-fill regissub
```

---

## 7. สรุป Clear Data Scope — ระบบเก่า vs ระบบใหม่

| ตาราง | ระบบเก่า (PHP) | ระบบใหม่ (Go+Next.js) | หมายเหตุ |
|---|---|---|---|
| `useradmin` | ❌ คงไว้ | ❌ คงไว้ | account admin ไม่เปลี่ยน |
| `master` | ✅ UPDATE ทับ | ✅ INSERT row ใหม่ | เก็บ record ทุกปีไว้ใน DB |
| `holder` | ✅ ล้าง + import ใหม่ | ✅ ล้าง + import ใหม่ | OMD ส่งรายชื่อใหม่ทุกปี |
| `novote` | ✅ ล้าง + import ใหม่ | ✅ ล้าง + import ใหม่ | รายชื่อไม่มีสิทธิ์เปลี่ยนทุกปี |
| `termpartner` | ✅ ล้าง + import ใหม่ | 🔄 เก็บ + `meeting_year` | ดูวาระ + ผลโหวตปีก่อนได้ |
| `regismaim` | ✅ ล้าง | 🔄 เก็บ + `meeting_year` | ดูรายการลงทะเบียนปีก่อนได้ |
| `regisgroup` | ✅ ล้าง | 🔄 เก็บ + `meeting_year` | กลุ่มมอบฉันทะปีก่อน |
| `regissub` | ✅ ล้าง | 🔄 เก็บ + `meeting_year` | ผลโหวต Onsite ทุกปี |
| `holderlate` | ✅ ล้าง | 🔄 เก็บ + `meeting_year` | ผู้มาสายทุกปี |
| `online_registration` ⭐ | ✅ ล้าง | 🔄 เก็บ + `meeting_year` | session online ทุกปี |
| `votes_online` ⭐ | ✅ ล้าง | 🔄 เก็บ + `meeting_year` | ผลโหวต Online ทุกปี |
| `audit_log` ⭐ | ✅ ล้าง | ❌ ไม่ล้าง + `meeting_year` | MDES 2563 — ห้ามล้าง |

> **ระบบเก่า**: TRUNCATE เกือบทุกตาราง → ดูย้อนหลังต้อง restore SQL file ผ่าน phpMyAdmin
> **ระบบใหม่**: ตาราง transactional สะสมด้วย `meeting_year` → ดูย้อนหลังผ่าน dropdown ใน Admin ได้เลย
> **Next Year Prep**: ล้างเฉพาะ `holder`, `novote`, `termpartner` (master data ที่ OMD ส่งใหม่ทุกปี)
> **Auto-backup** ที่ Close Meeting = safety export เท่านั้น — DB คือ source of truth หลัก
