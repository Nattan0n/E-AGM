# Feature Compare — Eregist

> แนวทางใหม่: **Full Rebuild** — สร้างระบบใหม่ที่รองรับทั้ง Onsite + Online ในระบบเดียว
> ระบบเดิม (PHP) ใช้เป็น reference เท่านั้น ไม่ได้คงไว้

---

## ระบบเดิม (Reference — PHP Onsite Only)

### ผู้ถือหุ้น / การลงทะเบียน
- เจ้าหน้าที่ลงทะเบียนผู้ถือหุ้นให้ (onsite เท่านั้น)
- ลงทะเบียนแบบรายบุคคล
- ลงทะเบียนแบบกลุ่ม
- ค้นหาผู้ถือหุ้น
- ลบ / แก้ไขการลงทะเบียน
- ติดตามผู้ถือหุ้นมาสาย (holderlate)
- จัดการผู้ถือหุ้นที่ไม่มีสิทธิ์โหวต (novote)

### การโหวต
- เปิด / ปิด โหวตรายวาระ (admin)
- โหวตใน hall (เจ้าหน้าที่กดให้)
- รองรับ **4 ตัวเลือก**: เห็นด้วย / ไม่เห็นด้วย / งดออกเสียง / บัตรเสีย
- โหวตแบบรายบุคคล / กลุ่ม

### รายงาน / Export
- สรุปผลโหวตรายวาระ
- Export Excel / พิมพ์รายงาน
- กราฟผลโหวต
- เปรียบเทียบข้อมูลผู้ถือหุ้นข้ามปี

### Admin
- จัดการวาระการประชุม (CRUD)
- จัดการ admin user / ตั้งค่าปีประชุม
- Barcode generation

---

## ระบบใหม่ (Full Rebuild — Unified Onsite + Online)

### ฝั่งผู้ถือหุ้น — Online Self Service ⭐ (ใหม่)
- ลงทะเบียนเองผ่านเว็บ (pre-registration)
- ยืนยันตัวตนด้วย Account ID + เลขบัตรประชาชน
- รับ OTP ทาง Email / SMS
- Waiting Room — ดูวาระ / รอวันประชุม
- โหวตออนไลน์จากนอก hall (ระหว่างวาระเปิด)
- ดูผลยืนยันการโหวต + พิมพ์หลักฐาน

### ฝั่งเจ้าหน้าที่ — Onsite (rebuild จากของเดิม)
- ค้นหาผู้ถือหุ้น (ค้น Account ID / ชื่อ)
- ลงทะเบียนรายบุคคล
- ลงทะเบียนแบบกลุ่ม / จัดการสมาชิกกลุ่ม
- ติดตามผู้ถือหุ้นมาสาย
- จัดการผู้ไม่มีสิทธิ์โหวต
- โหวตแทนผู้ถือหุ้น (onsite) — **4 ตัวเลือก**: เห็นด้วย / ไม่เห็นด้วย / งดออกเสียง / บัตรเสีย
- สรุปผลโหวต Onsite

### Security / Authentication ⭐ (ใหม่)
- OTP (หมดอายุ 10 นาที, ใช้ครั้งเดียว)
- JWT Token สำหรับ session โหวต
- ป้องกันโหวตซ้ำ (online + onsite นับรวมกัน)
- Rate limiting
- HTTPS + bcrypt password

### Audit / Compliance ⭐ (ใหม่ — ตาม MDES 2563)
- บันทึก log ทุก action (login, otp_request, vote, logout)
- เก็บ timestamp + IP + user agent ทุก event
- ดู audit log ย้อนหลัง (admin)

### Admin — Unified Dashboard ⭐ (ใหม่)
- Dashboard ผลโหวต real-time (Onsite + Online รวม)
- เปิด/ปิดโหวตรายวาระ (Online / Onsite แยกหรือพร้อมกันได้)
- รายชื่อผู้ลงทะเบียนออนไลน์
- Audit Log viewer
- Export รายงานรวม (Onsite + Online) — Excel / PDF
- จัดการ User / เจ้าหน้าที่ (role: Admin / Staff)
- ตั้งค่าปีประชุม / วาระ (CRUD)

### สิ่งที่ไม่ได้ทำใหม่ (ยกเลิก)
- ~~Data Sync Internal → Cloud~~ (ไม่จำเป็นเพราะ rebuild ใหม่ทั้งหมด)
- ~~Barcode generation~~ (พิจารณาใหม่ตาม requirement)
