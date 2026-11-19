"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/api";
import { MOCK } from "@/lib/mock";
import { Icon } from "@/components/brand/Icon";
import { AuthFrame, LOGIN_STEPS } from "@/components/online/AuthFrame";
import { LoginResp, takeNotice, writePending } from "@/components/online/hooks";
import a from "@/components/online/auth.module.css";

// Dev-only prefill: TRU-000005 from the seed data, or a not-yet-registered sample holder in mock mode; empty in production.
const DEV_USER = process.env.NODE_ENV !== "development" ? "" : MOCK ? "1014" : "TRU-000005";

/** Flow page 2 - log in with the User (Account ID); the OTP goes to the e-mail / mobile on file. */
export default function OnlineLogin() {
  const router = useRouter();
  const [user, setUser] = useState(DEV_USER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { const n = takeNotice(); if (n) { const t = setTimeout(() => setNotice(n), 0); return () => clearTimeout(t); } }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setNotice("");
    const acc = user.trim().toUpperCase();
    if (!acc) { setError("กรุณากรอก User (เลขทะเบียนผู้ถือหุ้น)"); return; }
    setBusy(true);
    try {
      const r = await api<LoginResp>("/api/online/login", { method: "POST", body: { account_id: acc }, session: null });
      writePending({ account_id: acc, channels: r.channels, expires_at: Date.now() + r.expires_in * 1000, dev_otp: r.dev_otp, resends: [Date.now()] });
      router.push("/online/otp");
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="เข้าสู่ระบบผู้ถือหุ้น" subtitle="ประชุมผู้ถือหุ้นผ่านระบบออนไลน์ · บริษัท ไทยรุ่งยูเนี่ยนคาร์ จำกัด (มหาชน)" steps={LOGIN_STEPS} step={1} back="/" backLabel="กลับหน้าแรก">
      <form onSubmit={submit} noValidate style={{ display: "contents" }}>
        <div className={a.field}>
          <label className={a.label} htmlFor="user">User (เลขทะเบียนผู้ถือหุ้น)</label>
          <div className={a.wrap}>
            <Icon name="user" size={19} />
            <input id="user" className={`${a.input} ${a.big}`} value={user} onChange={(e) => setUser(e.target.value)} placeholder="เช่น TRU-000001"
              maxLength={25} autoCapitalize="characters" autoComplete="username" autoFocus spellCheck={false} />
          </div>
          <span className={a.hint}>ดูได้จากหนังสือเชิญประชุม หรือข้อความที่ได้รับเมื่อขอ User</span>
        </div>

        <div className={a.note}>
          <Icon name="shield" size={17} />
          <span>ระบบจะส่งรหัส OTP ไปยัง <b>อีเมลและเบอร์มือถือที่ลงทะเบียนไว้</b> กับบริษัท (แสดงแบบปิดบังบางส่วน)</span>
        </div>

        {notice && <div className={`${a.note} ${a.amber}`} role="status"><Icon name="warn" size={17} /><span>{notice}</span></div>}
        {error && <div className={a.err} role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>}

        <button type="submit" className={a.cta} disabled={busy || !user.trim()}>{busy ? "กำลังส่ง OTP..." : "ขอรหัส OTP →"}</button>
      </form>

      <div className={a.or}>ยังไม่มี User หรือจำไม่ได้</div>
      <Link href="/online/request" className={a.ghost}><Icon name="register" size={18} />ขอ User</Link>
      <div className={a.secure}><Icon name="lock" size={13} />ขอ OTP ได้ 3 ครั้ง/ชั่วโมง · ตรวจสอบไม่สำเร็จ 5 ครั้ง ระบบล็อก 15 นาที</div>
    </AuthFrame>
  );
}
