"use client";
import { ClipboardEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg, setSession } from "@/lib/api";
import { Icon } from "@/components/brand/Icon";
import { AuthFrame, LOGIN_STEPS } from "@/components/online/AuthFrame";
import { LoginResp, Pending, SentTo, clearPending, maskIdCard, readPending, writePending } from "@/components/online/hooks";
import s from "@/components/online/online.module.css";
import a from "@/components/online/auth.module.css";

const COOLDOWN_MS = 60_000;
const HOUR = 3_600_000;
const EMPTY = ["", "", "", "", "", ""];

/** Flow page 2 (second half) - 6-digit OTP, 10 minutes, 5 tries per code, new code up to 3 times an hour. */
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
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await api<{ token: string; needs_consent?: boolean }>("/api/online/verify-otp", { method: "POST", body: { account_id: pending.account_id, otp: code }, session: null });
      setSession("holder", { token: r.token, account_id: pending.account_id });
      clearPending();
      setDone(true);
      setTimeout(() => router.push(r.needs_consent ? "/online/welcome" : "/online/waiting"), 1300);
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

  // a new code, on the same channel or (switchTo) the other one on file
  const resend = async (switchTo?: SentTo) => {
    if (!pending || busy || cooldown > 0 || limitReached) return;
    const channel = switchTo?.channel ?? pending.channel;
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await api<LoginResp>("/api/online/login", { method: "POST", body: { id_card: pending.id_card, account_id: pending.account_id, ...(channel ? { channel } : {}) }, session: null });
      const t = Date.now();
      const alt = switchTo ? pending.channels[0] : pending.alt; // after a switch the old channel becomes the alternative
      const p: Pending = { ...pending, channels: r.channels ?? pending.channels, channel: r.channels?.[0]?.channel ?? channel, alt, expires_at: t + (r.expires_in ?? 600) * 1000, dev_otp: r.dev_otp, resends: [...recent, t] };
      writePending(p); setPending(p); setNow(t);
      setDigits(EMPTY);
      setInfo("ส่งรหัส OTP ใหม่แล้ว รหัสเดิมใช้ไม่ได้");
    } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  };

  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");
  const code = digits.join("");

  return (
    <AuthFrame title="ยืนยันรหัส OTP" subtitle={pending ? `เลขบัตร ${maskIdCard(pending.id_card ?? "")}` : undefined} steps={LOGIN_STEPS} step={2} back="/online" backLabel="เปลี่ยนเลขบัตร">
      <div className={a.otpHead}>
        <span className={a.shield} aria-hidden="true"><Icon name="shield" size={30} /></span>
        <span className={a.hint} style={{ fontSize: 13 }}>ระบบส่งรหัส 6 หลักไปที่ช่องทางที่ท่านเลือก</span>
      </div>
      <div className={a.sentList}>
        {(pending?.channels ?? []).map((c) => (
          <div key={c.channel} className={a.sentItem}><Icon name={c.channel === "email" ? "mail" : "phone"} size={17} />{c.channel === "email" ? "อีเมล" : "SMS"}<b>{c.masked}</b></div>
        ))}
      </div>
      {pending?.dev_otp && <div className={a.dev}>DEV: OTP = {pending.dev_otp}</div>}

      <div className={a.otpbox} role="group" aria-label="รหัส OTP">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} placeholder="–"
            aria-label={`หลักที่ ${i + 1}`} className={`${d ? a.filled : ""} ${error ? a.bad : ""}`} maxLength={6} disabled={busy || remain === 0}
            onChange={(e) => setAt(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={onPaste} onFocus={(e) => e.target.select()} autoFocus={i === 0} />
        ))}
      </div>

      {remain > 0
        ? <div className={a.timer}>รหัสหมดอายุใน <b>{mm}:{ss}</b></div>
        : <div className={a.err} role="alert"><Icon name="clock" size={16} /><span>รหัส OTP หมดอายุแล้ว กรุณากดขอรหัสใหม่</span></div>}
      {error && <div className={a.err} role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>}
      {info && <div className={a.ok} role="status">{info}</div>}

      <button type="button" className={a.cta} disabled={busy || code.length !== 6 || remain === 0} onClick={() => void verify(code)}>{busy ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}</button>
      <div className={a.resend}>
        ไม่ได้รับรหัส?{" "}
        <button type="button" disabled={busy || cooldown > 0 || limitReached} onClick={() => void resend()}>
          {limitReached ? "ขอครบ 3 ครั้งในชั่วโมงนี้แล้ว" : cooldown > 0 ? `ขอใหม่ได้ใน ${cooldown} วินาที` : "ขอรหัสใหม่"}
        </button>
      </div>
      {pending?.alt && (
        <div className={a.resend}>
          ช่องทางนี้ไม่สะดวก?{" "}
          <button type="button" disabled={busy || cooldown > 0 || limitReached} onClick={() => void resend(pending.alt)}>
            ส่งทาง{pending.alt.channel === "email" ? "อีเมล" : " SMS"} ({pending.alt.masked}) แทน
          </button>
        </div>
      )}
      <div className={a.meta}><span>กรอกผิดได้ไม่เกิน 5 ครั้งต่อรหัส</span><span>ขอแล้ว {recent.length}/3 ครั้ง (1 ชม.)</span></div>
      <div className={`${a.note} ${a.amber}`}><Icon name="warn" size={17} /><span>อย่าเปิดเผยรหัส OTP ให้ผู้อื่น เจ้าหน้าที่จะไม่ขอรหัส OTP จากท่าน</span></div>

      {done && (
        <div className={s.entering} role="status" aria-live="polite">
          <div className={s.enterbox}>
            <span className={s.enterring}><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path className={s.entercheck} d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <b>ยืนยันตัวตนสำเร็จ</b>
            <span>กำลังพาท่านเข้าสู่ระบบ...</span>
            <i className={s.enterbar}><u /></i>
          </div>
        </div>
      )}
    </AuthFrame>
  );
}
