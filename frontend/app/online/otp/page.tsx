"use client";
import { Icon } from "@/components/brand/Icon";
import { ClipboardEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg, setSession } from "@/lib/api";
import { OnlineShell } from "@/components/online/OnlineShell";
import { Pending, RegisterResp, clearPending, readPending, writePending } from "@/components/online/hooks";
import { useIsDesktop } from "@/lib/media";
import s from "@/components/online/online.module.css";

const COOLDOWN_MS = 60_000;
const HOUR = 3_600_000;
const EMPTY = ["", "", "", "", "", ""];

export default function OnlineOtp() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [digits, setDigits] = useState<string[]>(EMPTY);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const p = readPending();
    if (!p) { router.replace("/online"); return; }
    setPending(p);
  }, [router]);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remain = pending && now ? Math.max(0, Math.ceil((pending.expires_at - now) / 1000)) : 0;
  const recent = (pending?.resends ?? []).filter((t) => now - t < HOUR);
  const lastSent = recent.length ? Math.max(...recent) : 0;
  const cooldown = Math.max(0, Math.ceil((lastSent + COOLDOWN_MS - now) / 1000));
  const limitReached = recent.length >= 3;

  const verify = useCallback(async (code: string) => {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ token: string }>("/api/online/verify-otp", { method: "POST", body: { account_id: pending.account_id, otp: code }, session: null });
      setSession("holder", { token: r.token, account_id: pending.account_id });
      clearPending();
      setDone(true);
      setTimeout(() => router.push("/online/waiting"), 1500);
    } catch (e) {
      setError(errMsg(e));
      setDigits(EMPTY);
      setBusy(false);
      setTimeout(() => refs.current[0]?.focus(), 0);
    }
  }, [pending, busy, router]);

  const setAt = (i: number, v: string) => {
    const d = v.replace(/\D/g, "");
    if (!d) { setDigits((p) => p.map((x, k) => (k === i ? "" : x))); return; }
    const next = [...digits];
    let k = i;
    for (const ch of d) { if (k > 5) break; next[k++] = ch; }
    setDigits(next);
    refs.current[Math.min(k, 5)]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
      setDigits((p) => p.map((x, k) => (k === i - 1 ? "" : x)));
    }
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!d) return;
    const next = [...EMPTY];
    [...d].forEach((c, k) => { next[k] = c; });
    setDigits(next);
    refs.current[Math.min(d.length, 5)]?.focus();
    if (d.length === 6) void verify(d);
  };

  const resend = async () => {
    if (!pending || busy || cooldown > 0 || limitReached) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await api<RegisterResp>("/api/online/register", {
        method: "POST", session: null,
        body: { account_id: pending.account_id, id_card: pending.id_card, phone: pending.phone, email: pending.email, channel: pending.channel, vote_mode: pending.vote_mode ?? "self", consent: true },
      });
      const t = Date.now();
      const p: Pending = { ...pending, masked_to: r.masked_to, expires_at: t + r.expires_in * 1000, dev_otp: r.dev_otp, resends: [...recent, t] };
      writePending(p); setPending(p); setNow(t);
      setDigits(EMPTY);
      setInfo("ส่งรหัส OTP ใหม่แล้ว");
    } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  };

  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");
  const code = digits.join("");

  const desktop = useIsDesktop();
  const verifyBtn = (
    <button type="button" className={`btn btn-primary ${s.cta}`} disabled={busy || code.length !== 6 || remain === 0} onClick={() => void verify(code)}>{busy ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}</button>
  );
  const lock = <div className={`${s.hint} ${s.center}`}><Icon name="lock" size={13} className="ico-inl" />ข้อมูลเข้ารหัสระหว่างการส่ง</div>;

  return (
    <OnlineShell title="ยืนยันรหัส OTP" step={2} back="/online" width="card" split footer={desktop ? undefined : <>{verifyBtn}{lock}</>}>
      <div className={`${s.cardc} ${s.otpcard} ${desktop ? s.insplit : ""}`}>
        {desktop && <button type="button" className={s.backlink} onClick={() => router.push("/online")}>← กลับสู่หน้าเข้าสู่ระบบ</button>}
        <div className={s.shield} aria-hidden="true">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v5.5c0 4.6-3.2 8.2-8 9.5-4.8-1.3-8-4.9-8-9.5V6l8-3z" /><path d="M9 12l2.2 2.2L15.5 10" /></svg>
        </div>
        <div>
          <h2 className={s.otph}>กรอกรหัส OTP</h2>
          <div className={s.otpsub}>ระบบได้ส่งรหัส 6 หลักไปที่ ({pending?.channel === "email" ? "อีเมล" : "เบอร์โทรศัพท์"})</div>
          <div className={s.masked}>{pending?.masked_to ?? "..."}</div>
        </div>
        {pending?.dev_otp && <div className={s.dev}>DEV: OTP = {pending.dev_otp}</div>}
        <div className={s.otpbox} role="group" aria-label="รหัส OTP">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} placeholder="–"
              aria-label={`หลักที่ ${i + 1}`} className={`${d ? s.filled : ""} ${error ? s.err : ""}`} maxLength={6} disabled={busy || remain === 0}
              onChange={(e) => setAt(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={onPaste} onFocus={(e) => e.target.select()} autoFocus={i === 0} />
          ))}
        </div>
        {desktop && verifyBtn}
        <div>
          {remain > 0
            ? <div className={s.timerrow}><span className={s.timer}>{mm}:{ss}</span><span className="muted">รหัสจะหมดอายุใน</span></div>
            : <div className="error-text">รหัส OTP หมดอายุ กรุณาขอรหัสใหม่</div>}
        </div>
        {error && <div className="error-text" role="alert">{error}</div>}
        {info && <div className={s.okmsg} role="status">{info}</div>}
        <div className={s.resend}>
          ไม่ได้รับรหัส?{" "}
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy || cooldown > 0 || limitReached} onClick={() => void resend()}>
            {limitReached ? "ขอรหัสครบ 3 ครั้งต่อชั่วโมงแล้ว" : cooldown > 0 ? `ส่งอีกครั้งใน ${cooldown} วินาที` : "ส่งรหัสอีกครั้ง"}
          </button>
        </div>
        <div className={s.warn}><b>ข้อควรระวัง:</b> อย่าเปิดเผยรหัส OTP ให้ผู้อื่น เจ้าหน้าที่จะไม่ขอรหัส OTP ทางโทรศัพท์หรือ SMS</div>
      </div>
      {done && (
        <div className={s.entering} role="status" aria-live="polite">
          <div className={s.enterbox}>
            <span className={s.enterring}><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path className={s.entercheck} d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <b>ยืนยันตัวตนสำเร็จ</b>
            <span>กำลังพาท่านเข้าสู่ห้องประชุม...</span>
            <i className={s.enterbar}><u /></i>
          </div>
        </div>
      )}
    </OnlineShell>
  );
}
