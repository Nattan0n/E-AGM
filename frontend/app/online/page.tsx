"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errMsg, fmt } from "@/lib/api";
import { MOCK } from "@/lib/mock";
import { Icon } from "@/components/brand/Icon";
import { AuthFrame, LOGIN_STEPS } from "@/components/online/AuthFrame";
import { AccountChoice, Channel, LoginResp, SentTo, takeNotice, writePending } from "@/components/online/hooks";
import a from "@/components/online/auth.module.css";

// Dev-only prefill: TRU-000005 from the seed data, or a not-yet-registered sample holder in mock mode; empty in production.
const DEV_ID = process.env.NODE_ENV !== "development" ? "" : MOCK ? "1100000102947" : "1000100039595";

/** Remember the login that waits for its OTP (read by /online/otp). */
function savePending(idCard: string, accountId: string, r: LoginResp, alt?: SentTo) {
  const t = Date.now();
  writePending({ id_card: idCard, account_id: accountId, channels: r.channels ?? [], expires_at: t + (r.expires_in ?? 600) * 1000, dev_otp: r.dev_otp, resends: [t], channel: r.channels?.[0]?.channel, alt });
}

/** Flow page 2 - log in with the ID card / passport number (the User); the OTP goes to the e-mail / mobile on file. */
export default function OnlineLogin() {
  const router = useRouter();
  const [idCard, setIdCard] = useState(DEV_ID);
  const [choices, setChoices] = useState<AccountChoice[] | null>(null);
  const [via, setVia] = useState<{ accountId: string; options: SentTo[] } | null>(null); // account has both channels: pick one
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Runs on mount and again when Next shows this kept-alive page after a redirect back here (logout, declined PDPA,
  // expired session): clear the "busy" left from the earlier submit, and show the one-shot notice. The notice is taken
  // inside the timer so a cancelled run (dev double effects) does not consume it without showing it.
  useEffect(() => {
    const t = setTimeout(() => { setBusy(false); setChoices(null); setVia(null); const n = takeNotice(); if (n) setNotice(n); }, 0);
    return () => clearTimeout(t);
  }, []);

  const login = async (accountId = "", channel?: Channel) => {
    setError(""); setNotice("");
    const idc = idCard.replace(/\D/g, "");
    if (idc.length < 6) { setError("กรุณากรอกเลขประจำตัวประชาชน / Passport ให้ถูกต้อง"); return; }
    setBusy(true);
    try {
      const r = await api<LoginResp>("/api/online/login", { method: "POST", body: { id_card: idc, account_id: accountId, ...(channel ? { channel } : {}) }, session: null });
      if (r.choose) { setChoices(r.choose); setBusy(false); return; }
      if (r.choose_channel) { setVia({ accountId: r.account_id ?? accountId, options: r.choose_channel }); setBusy(false); return; }
      const other = via?.options.find((o) => o.channel !== channel);
      savePending(idc, r.account_id ?? accountId, r, other);
      router.push("/online/otp");
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void login(); };
  const errBox = error && <div className={a.err} role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>;

  // the account has both an e-mail and a mobile on file: the holder chooses where the code goes
  if (via) {
    return (
      <AuthFrame title="รับรหัส OTP ทางไหน" subtitle="เลือกช่องทางที่สะดวก ระบบจะส่งรหัสไปที่ช่องทางเดียวที่เลือก" steps={LOGIN_STEPS} step={1}
        back={() => { setVia(null); setError(""); }} backLabel="เปลี่ยนเลขบัตร">
        <div className={a.accounts}>
          {via.options.map((o) => (
            <button key={o.channel} type="button" className={a.account} disabled={busy} onClick={() => void login(via.accountId, o.channel)}>
              <span className={a.accIcon} aria-hidden="true"><Icon name={o.channel === "email" ? "mail" : "phone"} size={20} /></span>
              <span className={a.accText}><b>{o.channel === "email" ? "ส่งทางอีเมล" : "ส่งทาง SMS"}</b><small>{o.masked}</small></span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        {errBox}
        {busy && <div className={a.hint} style={{ textAlign: "center" }}>กำลังส่ง OTP...</div>}
      </AuthFrame>
    );
  }

  // one ID card, several accounts: pick the one to attend with
  if (choices) {
    return (
      <AuthFrame title="เลือกบัญชีผู้ถือหุ้น" subtitle="เลขบัตรนี้มีหลายบัญชี กรุณาเลือกบัญชีที่จะเข้าประชุม (แต่ละบัญชีเข้าสู่ระบบแยกกัน)" steps={LOGIN_STEPS} step={1}
        back={() => { setChoices(null); setError(""); }} backLabel="เปลี่ยนเลขบัตร">
        <div className={a.accounts} role="list">
          {choices.map((c) => (
            <button key={c.account_id} type="button" role="listitem" className={a.account} disabled={busy || !c.active} onClick={() => void login(c.account_id)}>
              <span className={a.accIcon} aria-hidden="true"><Icon name="register" size={20} /></span>
              <span className={a.accText}><b>บัญชี {c.account_id}</b><small>{fmt(c.shares)} หุ้น{c.active ? "" : " · ยังไม่มีอีเมล/มือถือในทะเบียน"}</small></span>
              <span aria-hidden="true">{c.active ? "→" : ""}</span>
            </button>
          ))}
        </div>
        {choices.some((c) => !c.active) && <div className={a.note}><Icon name="warn" size={17} /><span>บัญชีที่ยังไม่มีอีเมล/มือถือ ต้องกด “ขอ User” เพื่อเพิ่มช่องทางติดต่อก่อน</span></div>}
        {errBox}
        {busy && <div className={a.hint} style={{ textAlign: "center" }}>กำลังส่ง OTP...</div>}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="เข้าสู่ระบบผู้ถือหุ้น" subtitle="ประชุมผู้ถือหุ้นผ่านระบบออนไลน์ · บริษัท ไทยรุ่งยูเนี่ยนคาร์ จำกัด (มหาชน)" steps={LOGIN_STEPS} step={1} back="/" backLabel="กลับหน้าแรก">
      <form onSubmit={submit} noValidate style={{ display: "contents" }}>
        <div className={a.field}>
          <label className={a.label} htmlFor="idc">เลขประจำตัวประชาชน / Passport / เลขนิติบุคคล</label>
          <div className={a.wrap}>
            <Icon name="user" size={19} />
            <input id="idc" className={`${a.input} ${a.big}`} value={idCard} onChange={(e) => setIdCard(e.target.value)} placeholder="13 หลัก (ไม่ต้องใส่ขีด)"
              inputMode="numeric" maxLength={20} autoComplete="off" autoFocus spellCheck={false} />
          </div>
          <span className={a.hint}>ใช้เลขเดียวกับที่ให้ไว้กับบริษัท / นายทะเบียนหลักทรัพย์</span>
        </div>

        <div className={a.note}>
          <Icon name="shield" size={17} />
          <span>ระบบจะส่งรหัส OTP ไปยัง <b>เบอร์มือถือหรืออีเมลที่ลงทะเบียนไว้</b> กับบริษัท ตามช่องทางที่ท่านเลือก (แสดงแบบปิดบังบางส่วน)</span>
        </div>

        {notice && <div className={`${a.note} ${a.amber}`} role="status"><Icon name="warn" size={17} /><span>{notice}</span></div>}
        {errBox}

        <button type="submit" className={a.cta} disabled={busy || idCard.replace(/\D/g, "").length < 6}>{busy ? "กำลังตรวจสอบ..." : "ขอรหัส OTP →"}</button>
      </form>

      <div className={a.or}>เข้าสู่ระบบไม่ได้ หรือไม่มีอีเมล/มือถือในทะเบียน</div>
      <Link href="/online/request" className={a.ghost}><Icon name="register" size={18} />ขอ User</Link>
      <div className={a.secure}><Icon name="lock" size={13} />ขอ OTP ได้ 3 ครั้ง/ชั่วโมง · ตรวจสอบไม่สำเร็จ 5 ครั้ง ระบบล็อก 15 นาที</div>
    </AuthFrame>
  );
}
