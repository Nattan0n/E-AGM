"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, IconName } from "@/components/brand/Icon";
import { LogoMark } from "@/components/brand/Logo";
import { ApiError, api, errMsg, setSession, StaffSession } from "@/lib/api";
import s from "./login.module.css";

const FEATURES: { icon: IconName; text: string }[] = [
  { icon: "register", text: "ลงทะเบียนผู้ถือหุ้นหน้างาน รายบุคคล มอบฉันทะ และกลุ่ม" },
  { icon: "vote", text: "ลงคะแนนแทนผู้ถือหุ้น ครบทุกวาระ" },
  { icon: "chart", text: "สรุปผลและองค์ประชุมแบบเรียลไทม์ รวม Onsite + Online" },
  { icon: "shield", text: "บันทึก Audit Log ทุกการใช้งาน ตามมาตรฐาน MDES" },
];

export default function StaffLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api<StaffSession>("/api/auth/login", { method: "POST", body: { username: username.trim(), password }, session: null });
      setSession("staff", { token: r.token, role: r.role, name: r.name, username: r.username });
      router.replace(r.role === "admin" ? "/admin" : "/staff");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError("พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่");
      else if (err instanceof ApiError && err.status === 401) setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      else setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <div className={s.root}>
      <section className={s.brand}>
        <div className={s.brandIn}>
          <div className={s.logo}><LogoMark size={72} /></div>
          <h1>E-AGM</h1>
          <p className={s.company}>บริษัท ไทยรุ่งยูเนี่ยนคาร์ จำกัด (มหาชน)</p>
          <p className={s.tag}>ระบบประชุมผู้ถือหุ้น — สำหรับเจ้าหน้าที่และผู้ดูแลระบบ</p>
          <p className={s.lead}>จัดการการประชุมผู้ถือหุ้นได้ครบในที่เดียว ตั้งแต่ลงทะเบียนหน้างาน ลงคะแนน ไปจนถึงสรุปผลการประชุม ทั้งแบบ Onsite และ Online</p>
          <ul className={s.feats}>
            {FEATURES.map((f) => (
              <li key={f.text}><span className={s.ic}><Icon name={f.icon} size={19} /></span>{f.text}</li>
            ))}
          </ul>
        </div>
        <div className={s.brandFoot}>© Thai Rung Union Car Public Company Limited</div>
      </section>

      <section className={s.panel}>
        <form className={s.card} onSubmit={submit}>
          <h2>เข้าสู่ระบบ</h2>
          <p className={s.sub}>กรอกชื่อผู้ใช้และรหัสผ่านที่ได้รับจากผู้ดูแลระบบ</p>

          <div className={s.field}>
            <label className={s.label} htmlFor="u">ชื่อผู้ใช้</label>
            <div className={s.inputWrap}>
              <Icon name="user" size={18} />
              <input id="u" className={s.input} value={username} onChange={(e) => setUsername(e.target.value)}
                autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label} htmlFor="p">รหัสผ่าน</label>
            <div className={s.inputWrap}>
              <Icon name="lock" size={18} />
              <input id="p" className={s.input} type={show ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              <button type="button" className={s.eye} onClick={() => setShow((v) => !v)}
                aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} aria-pressed={show}>
                <Icon name={show ? "eyeOff" : "eye"} size={18} />
              </button>
            </div>
          </div>

          {error && <div className={s.err} role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>}

          <button className={s.submit} disabled={busy || !username.trim() || !password}>
            {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
          <p className={s.help}>ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ (ITD)</p>
          <p className={s.help}><Link href="/">← กลับหน้าเลือกบทบาท</Link></p>
        </form>
        <div className={s.foot}>© Thai Rung Union Car Public Company Limited</div>
      </section>
    </div>
  );
}
