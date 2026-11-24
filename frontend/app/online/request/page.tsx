"use client";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, errMsg } from "@/lib/api";
import { Icon } from "@/components/brand/Icon";
import { AuthFrame, REQUEST_STEPS } from "@/components/online/AuthFrame";
import { Channel, SentTo, sentToText } from "@/components/online/hooks";
import a from "@/components/online/auth.module.css";

type StartResp = { result: "ready"; channels: SentTo[] } | { result: "contact" | "not_found"; ticket: string };
interface ContactResp { sent: boolean; channel: Channel; masked_to: string; expires_in: number; dev_otp?: string }

type Stage =
  | { k: "id" }
  | { k: "ready"; channels: SentTo[] }
  | { k: "form"; kind: "contact" | "not_found"; ticket: string }
  | { k: "otp"; kind: "contact" | "not_found"; ticket: string; masked: string; channel: Channel; expires: number; dev?: string }
  | { k: "submitted"; kind: "contact" | "not_found" | ""; reference: string; ticket: string; result?: ReqStatus };

type ReqStatus = { status: "pending" | "approved" | "rejected"; reference: string; reason?: string };
/** The last request sent from this browser, so the holder can come back and check it (the ticket is the only key). */
const SAVED = "eagm_user_request";
const loadSaved = (): { ticket: string; reference: string } | null => { try { const v = JSON.parse(localStorage.getItem(SAVED) ?? "null"); return v?.ticket ? v : null; } catch { return null; } };
const storeSaved = (v: { ticket: string; reference: string } | null) => { try { if (v) localStorage.setItem(SAVED, JSON.stringify(v)); else localStorage.removeItem(SAVED); } catch { /* private mode */ } };

const MAX_FILES = 3;
const MAX_SIZE = 3 << 20;
const ACCEPT = ["application/pdf", "image/jpeg", "image/png"];
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/**
 * Flow page 1 - request a User (the User is the Account ID).
 * ID card -> found with contact: User sent | found without contact: add contact + OTP -> OMD | not found: documents + OTP -> OMD.
 */
export default function RequestUser() {
  const [stage, setStage] = useState<Stage>({ k: "id" });
  const [idCard, setIdCard] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saved, setSaved] = useState<{ ticket: string; reference: string } | null>(null);
  useEffect(() => { const t = setTimeout(() => setSaved(loadSaved()), 0); return () => clearTimeout(t); }, []);

  const checkStatus = async (ticket: string, reference: string) => {
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await api<ReqStatus>("/api/online/user-request/status", { method: "POST", body: { ticket }, session: null });
      setStage((s) => ({ k: "submitted", kind: s.k === "submitted" ? s.kind : "", reference: r.reference, ticket, result: r }));
      if (r.status === "pending") setInfo("คำขอยังอยู่ระหว่างตรวจสอบ");
    } catch (err) {
      if ((err as { status?: number }).status === 404) { storeSaved(null); setSaved(null); setStage({ k: "id" }); setError(`ไม่พบคำขอ ${reference} แล้ว กรุณาส่งคำขอใหม่`); }
      else setError(errMsg(err));
    }
    setBusy(false);
  };

  const fail = (e: unknown) => { setError(errMsg(e)); setBusy(false); };

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (idCard.replace(/\D/g, "").length < 6) { setError("กรุณากรอกเลขประจำตัวประชาชน / Passport ให้ถูกต้อง"); return; }
    setBusy(true);
    try {
      const r = await api<StartResp>("/api/online/user-request", { method: "POST", body: { id_card: idCard.trim() }, session: null });
      if (r.result === "ready") setStage({ k: "ready", channels: r.channels });
      else setStage({ k: "form", kind: r.result, ticket: r.ticket });
      setBusy(false);
    } catch (err) { fail(err); }
  };

  const sendContact = async (ticket: string, kind: "contact" | "not_found", withFiles: boolean) => {
    const fd = new FormData();
    fd.set("ticket", ticket);
    fd.set("phone", phone.trim());
    fd.set("email", email.trim());
    fd.set("channel", channel);
    if (kind === "not_found") fd.set("full_name", name.trim());
    if (note.trim()) fd.set("note", note.trim());
    if (withFiles) files.forEach((f) => fd.append("files", f));
    const r = await api<ContactResp>("/api/online/user-request/contact", { method: "POST", body: fd, session: null });
    setStage({ k: "otp", kind, ticket, masked: r.masked_to, channel: r.channel, expires: Date.now() + r.expires_in * 1000, dev: r.dev_otp });
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (stage.k !== "form") return;
    setError("");
    if (!phone.trim() && !email.trim()) { setError("กรุณากรอกอีเมลหรือเบอร์มือถืออย่างน้อย 1 ช่องทาง"); return; }
    if (channel === "sms" && !phone.trim()) { setError("เลือกรับ OTP ทาง SMS แต่ยังไม่ได้กรอกเบอร์มือถือ"); return; }
    if (channel === "email" && !email.trim()) { setError("เลือกรับ OTP ทางอีเมล แต่ยังไม่ได้กรอกอีเมล"); return; }
    if (stage.kind === "not_found") {
      if (!name.trim()) { setError("กรุณากรอกชื่อ-นามสกุลตามเอกสาร"); return; }
      if (files.length === 0) { setError("กรุณาแนบเอกสารประกอบอย่างน้อย 1 ไฟล์"); return; }
    }
    setBusy(true);
    try { await sendContact(stage.ticket, stage.kind, true); setOtp(""); setBusy(false); } catch (err) { fail(err); }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (stage.k !== "otp") return;
    if (otp.length !== 6) { setError("กรุณากรอกรหัส OTP 6 หลัก"); return; }
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await api<{ reference: string }>("/api/online/user-request/verify", { method: "POST", body: { ticket: stage.ticket, otp }, session: null });
      setStage({ k: "submitted", kind: stage.kind, reference: r.reference, ticket: stage.ticket });
      storeSaved({ ticket: stage.ticket, reference: r.reference });
      setBusy(false);
    } catch (err) { setOtp(""); fail(err); }
  };
  const resend = async () => {
    if (stage.k !== "otp") return;
    setBusy(true); setError(""); setInfo("");
    try { await sendContact(stage.ticket, stage.kind, false); setOtp(""); setInfo("ส่งรหัส OTP ใหม่แล้ว"); setBusy(false); } catch (err) { fail(err); }
  };

  const addFiles = (e: ChangeEvent<HTMLInputElement>) => {
    setError("");
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const bad = picked.find((f) => !ACCEPT.includes(f.type) || f.size > MAX_SIZE);
    if (bad) { setError(`ไฟล์ ${bad.name} ต้องเป็น PDF, JPG หรือ PNG และไม่เกิน 3 MB`); return; }
    const next = [...files, ...picked].slice(0, MAX_FILES);
    if (files.length + picked.length > MAX_FILES) setError(`แนบได้ไม่เกิน ${MAX_FILES} ไฟล์`);
    setFiles(next);
  };

  const err = error && <div className={a.err} role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>;
  const backToId = () => { setStage({ k: "id" }); setError(""); setInfo(""); };

  // ---------- 1. ID card ----------
  if (stage.k === "id") {
    return (
      <AuthFrame title="ขอ User เข้าประชุม" subtitle="กรอกเลขบัตรเพื่อตรวจสอบกับทะเบียนผู้ถือหุ้น ณ วันปิดสมุดทะเบียน" steps={REQUEST_STEPS} step={1} back="/online" backLabel="กลับหน้าเข้าสู่ระบบ">
        <form onSubmit={start} noValidate style={{ display: "contents" }}>
          <div className={a.field}>
            <label className={a.label} htmlFor="idc">เลขประจำตัวประชาชน / Passport / เลขนิติบุคคล <span className={a.req}>*</span></label>
            <div className={a.wrap}><Icon name="user" size={18} />
              <input id="idc" className={a.input} value={idCard} onChange={(e) => setIdCard(e.target.value)} placeholder="13 หลัก (ไม่ต้องใส่ขีด)" inputMode="numeric" maxLength={20} autoComplete="off" autoFocus />
            </div>
          </div>
          <div className={a.note}><Icon name="mail" size={17} /><span>ใช้กรณีเข้าสู่ระบบด้วยเลขบัตรไม่ได้ เช่น ทะเบียนไม่มีอีเมล/เบอร์มือถือของท่าน หรือไม่พบชื่อในทะเบียน</span></div>
          {err}
          <button type="submit" className={a.cta} disabled={busy}>{busy ? "กำลังตรวจสอบ..." : "ตรวจสอบและขอ User →"}</button>
        </form>
        {saved && (
          <button type="button" className={a.ghost} disabled={busy} onClick={() => checkStatus(saved.ticket, saved.reference)}>ตรวจสถานะคำขอ {saved.reference}</button>
        )}
        <div className={a.linkrow}>มี User แล้ว? <Link href="/online" className={a.link}>เข้าสู่ระบบ</Link></div>
      </AuthFrame>
    );
  }

  // ---------- found with a contact: the ID card already works ----------
  if (stage.k === "ready") {
    return (
      <AuthFrame title="ท่านเข้าสู่ระบบได้แล้ว" back={backToId}>
        <div className={a.done}>
          <span className={a.doneIcon} aria-hidden="true"><Icon name="check" size={36} /></span>
          <h3>ไม่ต้องขอ User เพิ่ม</h3>
          <p>เลขบัตรของท่านอยู่ในทะเบียนและมีช่องทางติดต่อแล้ว ใช้ <b>เลขบัตรนี้</b> เข้าสู่ระบบได้เลย รหัส OTP จะส่งไปที่ <b>{sentToText(stage.channels)}</b></p>
        </div>
        <div className={a.note}><Icon name="warn" size={17} /><span>ถ้าช่องทางนี้ไม่ใช่ของท่านแล้ว กรุณาติดต่อเจ้าหน้าที่นักลงทุนสัมพันธ์ หรือลงทะเบียนที่หน้างานในวันประชุม</span></div>
        <Link href="/online" className={a.cta}>ไปหน้าเข้าสู่ระบบ →</Link>
      </AuthFrame>
    );
  }

  // ---------- submitted: waiting for OMD ----------
  if (stage.k === "submitted" && stage.result?.status === "approved") {
    return (
      <AuthFrame title="คำขอได้รับอนุมัติ" steps={REQUEST_STEPS} step={4}>
        <div className={a.done}>
          <span className={a.doneIcon} aria-hidden="true"><Icon name="check" size={36} /></span>
          <h3>เข้าสู่ระบบได้แล้ว</h3>
          <p>คำขอ <b>{stage.reference}</b> ได้รับอนุมัติ ใช้ <b>เลขบัตรประชาชน / Passport</b> ของท่านเป็น User รหัส OTP จะส่งไปที่ช่องทางที่ท่านยืนยันไว้</p>
        </div>
        <Link href="/online" className={a.cta} onClick={() => storeSaved(null)}>ไปหน้าเข้าสู่ระบบ →</Link>
      </AuthFrame>
    );
  }
  if (stage.k === "submitted" && stage.result?.status === "rejected") {
    return (
      <AuthFrame title="คำขอไม่ได้รับอนุมัติ" steps={REQUEST_STEPS} step={4}>
        <div className={a.done}>
          <span className={`${a.doneIcon} ${a.wait}`} aria-hidden="true"><Icon name="x" size={34} /></span>
          <h3>ไม่อนุมัติคำขอ {stage.reference}</h3>
          {stage.result.reason && <p>เหตุผล: <b>{stage.result.reason}</b></p>}
        </div>
        <div className={`${a.note} ${a.amber}`}><Icon name="warn" size={17} /><span>ท่านยังลงทะเบียนเข้าประชุมที่หน้างานในวันประชุมได้ หรือติดต่อฝ่ายผู้ถือหุ้น (OMD) หากมีข้อสงสัย</span></div>
        <button type="button" className={a.ghost} onClick={() => { storeSaved(null); setSaved(null); backToId(); }}>ส่งคำขอใหม่</button>
      </AuthFrame>
    );
  }
  if (stage.k === "submitted") {
    return (
      <AuthFrame title="ส่งคำขอเรียบร้อย" steps={REQUEST_STEPS} step={4}>
        <div className={a.done}>
          <span className={`${a.doneIcon} ${a.wait}`} aria-hidden="true"><Icon name="clock" size={34} /></span>
          <h3>รอเจ้าหน้าที่ตรวจสอบ</h3>
          <p>เจ้าหน้าที่ (OMD) จะตรวจสอบคำขอของท่าน และอาจโทรกลับไปยังเบอร์ที่ยืนยันไว้</p>
          <span className={a.ref}>{stage.reference}</span>
        </div>
        <ol className={a.timeline}>
          <li className={a.tOk}><i>✓</i><span>ยืนยันช่องทางติดต่อด้วย OTP แล้ว</span></li>
          <li><i>2</i><span>OMD ตรวจสอบ{stage.kind === "not_found" ? "เอกสารกับนายทะเบียนหลักทรัพย์" : stage.kind === "contact" ? "ข้อมูลกับทะเบียนผู้ถือหุ้น" : "คำขอของท่าน"}</span></li>
          <li><i>3</i><span>อนุมัติ: ได้รับแจ้งทางอีเมล / มือถือที่ยืนยันไว้ แล้วเข้าสู่ระบบด้วยเลขบัตรได้ทันที</span></li>
        </ol>
        <div className={`${a.note} ${a.amber}`}><Icon name="warn" size={17} /><span>หากไม่อนุมัติ ระบบจะแจ้งเหตุผลให้ทราบ และท่านยังลงทะเบียนที่หน้างานในวันประชุมได้</span></div>
        {info && <div className={a.note} role="status"><Icon name="clock" size={17} /><span>{info}</span></div>}
        {err}
        <button type="button" className={a.cta} disabled={busy} onClick={() => checkStatus(stage.ticket, stage.reference)}>{busy ? "กำลังตรวจสอบ..." : "ตรวจสถานะคำขอ"}</button>
        <Link href="/online" className={a.ghost}>กลับหน้าเข้าสู่ระบบ</Link>
      </AuthFrame>
    );
  }

  // ---------- OTP for the contact ----------
  if (stage.k === "otp") {
    return (
      <AuthFrame title="ยืนยันช่องทางติดต่อ" subtitle="กรอกรหัส OTP เพื่อยืนยันว่าช่องทางนี้เป็นของท่าน" steps={REQUEST_STEPS} step={3}
        back={() => { setStage({ k: "form", kind: stage.kind, ticket: stage.ticket }); setError(""); setInfo(""); }} backLabel="แก้ไขข้อมูล">
        <form onSubmit={verify} noValidate style={{ display: "contents" }}>
          <div className={a.sentList}><div className={a.sentItem}><Icon name={stage.channel === "email" ? "mail" : "phone"} size={17} />ส่งรหัสไปที่<b>{stage.masked}</b></div></div>
          {stage.dev && <div className={a.dev}>DEV: OTP = {stage.dev}</div>}
          <div className={a.field}>
            <label className={a.label} htmlFor="otp">รหัส OTP 6 หลัก</label>
            <div className={a.wrap}><Icon name="lock" size={18} />
              <input id="otp" className={`${a.input} ${a.big}`} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" autoFocus />
            </div>
            <span className={a.hint}>รหัสมีอายุ 10 นาที กรอกผิดได้ไม่เกิน 5 ครั้ง</span>
          </div>
          {err}
          {info && <div className={a.ok} role="status">{info}</div>}
          <button type="submit" className={a.cta} disabled={busy || otp.length !== 6}>{busy ? "กำลังตรวจสอบ..." : "ยืนยันและส่งคำขอ"}</button>
        </form>
        <div className={a.resend}>ไม่ได้รับรหัส? <button type="button" disabled={busy} onClick={() => void resend()}>ขอรหัสใหม่</button></div>
      </AuthFrame>
    );
  }

  // ---------- contact form (found without contact / not found) ----------
  const notFound = stage.kind === "not_found";
  return (
    <AuthFrame title={notFound ? "ขอลงทะเบียนผู้ถือหุ้น" : "เพิ่มช่องทางรับ User"} steps={REQUEST_STEPS} step={2} back={backToId} wide={notFound}
      subtitle={notFound ? "ไม่พบเลขบัตรนี้ในทะเบียน ณ วันปิดสมุด กรุณาแนบเอกสารให้เจ้าหน้าที่ตรวจสอบ" : "พบชื่อของท่านในทะเบียน แต่ยังไม่มีอีเมล / เบอร์มือถือสำหรับส่ง User"}>
      <form onSubmit={submitForm} noValidate style={{ display: "contents" }}>
        <div className={`${a.cols} ${notFound ? a.colsWide : ""}`}>
          {notFound && (
            <div className={`${a.note} ${a.amber} ${a.span}`}><Icon name="warn" size={17} /><span>ปกติผู้ที่ไม่มีชื่อ ณ วันปิดสมุดทะเบียนจะไม่มีสิทธิ์เข้าประชุม เจ้าหน้าที่จะตรวจสอบกับนายทะเบียนก่อน หากเพิ่งรับโอนหุ้นหรือเปลี่ยนชื่อ กรุณาแนบหลักฐาน</span></div>
          )}
          <div className={a.col}>
            {notFound && (
            <div className={a.field}>
              <label className={a.label} htmlFor="nm">ชื่อ-นามสกุล / ชื่อนิติบุคคล (ตามเอกสาร) <span className={a.req}>*</span></label>
              <div className={a.wrap}><Icon name="user" size={18} /><input id="nm" className={a.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="name" /></div>
            </div>
            )}
        <div className={a.sec}>ช่องทางติดต่อ</div>
        <div className={a.grid2}>
          <div className={a.field}>
            <label className={a.label} htmlFor="ph">เบอร์มือถือ</label>
            <div className={a.wrap}><Icon name="phone" size={18} /><input id="ph" className={a.input} type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812345678" maxLength={15} autoComplete="tel" /></div>
          </div>
          <div className={a.field}>
            <label className={a.label} htmlFor="em">อีเมล</label>
            <div className={a.wrap}><Icon name="mail" size={18} /><input id="em" className={a.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" maxLength={100} autoComplete="email" /></div>
          </div>
        </div>
        <div className={a.field}>
          <span className={a.label}>รับรหัส OTP ทาง</span>
          <div className={a.seg} role="radiogroup" aria-label="ช่องทางรับ OTP">
            <button type="button" role="radio" aria-checked={channel === "sms"} className={channel === "sms" ? a.on : ""} onClick={() => setChannel("sms")}><Icon name="phone" size={17} />SMS</button>
            <button type="button" role="radio" aria-checked={channel === "email"} className={channel === "email" ? a.on : ""} onClick={() => setChannel("email")}><Icon name="mail" size={17} />อีเมล</button>
          </div>
          <span className={a.hint}>เมื่ออนุมัติ เจ้าหน้าที่จะแจ้งไปยังช่องทางที่ยืนยันแล้ว และใช้รับ OTP ตอนเข้าสู่ระบบ</span>
        </div>

          </div>
          <div className={a.col}>
        {notFound && (
          <>
            <div className={a.sec}>เอกสารประกอบ</div>
            <ul className={a.checklist}>
              <li>บุคคลธรรมดา: สำเนาบัตรประชาชน (ไทย) หรือหนังสือเดินทาง (ต่างชาติ)</li>
              <li>นิติบุคคล: หนังสือรับรองบริษัท + สำเนาบัตรผู้มีอำนาจลงนาม</li>
              <li>หลักฐานการถือหุ้น เช่น ใบหุ้น หรือหนังสือยืนยันจากโบรกเกอร์ (ถ้ามี)</li>
            </ul>
            {files.length < MAX_FILES && (
              <label className={a.upload}>
                <Icon name="upload" size={24} />
                <span><b>เลือกไฟล์</b> PDF, JPG, PNG · ไม่เกิน 3 MB · สูงสุด {MAX_FILES} ไฟล์</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple onChange={addFiles} />
              </label>
            )}
            {files.length > 0 && (
              <div className={a.files}>
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className={a.file}>
                    <Icon name="file" size={17} /><span>{f.name}</span><small>{kb(f.size)}</small>
                    <button type="button" aria-label={`ลบ ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))}><Icon name="x" size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className={a.field}>
          <label className={a.label} htmlFor="nt">หมายเหตุถึงเจ้าหน้าที่ <span className={a.opt}>(ถ้ามี)</span></label>
          <textarea id="nt" className={a.area} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="เช่น เวลาที่สะดวกให้ติดต่อกลับ" />
        </div>
          </div>
        </div>
        <div className={a.note}><Icon name="lock" size={17} /><span>ข้อมูลและเอกสารใช้เพื่อยืนยันสิทธิ์เข้าประชุมเท่านั้น และได้รับการคุ้มครองตาม PDPA</span></div>
        {err}
        <button type="submit" className={a.cta} disabled={busy}>{busy ? "กำลังส่ง..." : "ส่งรหัส OTP เพื่อยืนยัน →"}</button>
      </form>
    </AuthFrame>
  );
}
