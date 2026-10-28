"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/api";
import { OnlineShell } from "@/components/online/OnlineShell";
import { RegisterResp, writePending } from "@/components/online/hooks";
import { LogoMark } from "@/components/brand/Logo";
import { useIsDesktop } from "@/lib/media";
import { Icon } from "@/components/brand/Icon";
import s from "@/components/online/online.module.css";
import { VoteMode, VoteModePicker } from "@/components/online/VoteMode";
import m from "./register.module.css";

// Dev-only prefill (holder TRU-000005 from the seed data) so the register form can be tested quickly; empty in production builds.
const DEV = process.env.NODE_ENV === "development"
  ? { account_id: "TRU-000005", id_card: "1000100039595", phone: "0810000655", email: "holder5@example.com" }
  : { account_id: "", id_card: "", phone: "", email: "" };

export default function OnlineRegister() {
  const router = useRouter();
  const [accountId, setAccountId] = useState(DEV.account_id);
  const [idCard, setIdCard] = useState(DEV.id_card);
  const [phone, setPhone] = useState(DEV.phone);
  const [email, setEmail] = useState(DEV.email);
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [voteMode, setVoteMode] = useState<VoteMode>("self");
  const [consent, setConsent] = useState(!!DEV.account_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!accountId.trim() || !idCard.trim()) { setError("กรุณากรอกข้อมูลให้ครบ"); return; }
    if (channel === "sms" && !phone.trim()) { setError("กรุณากรอกเบอร์โทรศัพท์"); return; }
    if (channel === "email" && !email.trim()) { setError("กรุณากรอกอีเมล"); return; }
    setBusy(true);
    const body = { account_id: accountId.trim().toUpperCase(), id_card: idCard.trim(), phone: phone.trim(), email: email.trim(), channel, vote_mode: voteMode, consent };
    try {
      const r = await api<RegisterResp>("/api/online/register", { method: "POST", body, session: null });
      writePending({
        account_id: body.account_id, masked_to: r.masked_to, channel, expires_at: Date.now() + r.expires_in * 1000,
        dev_otp: r.dev_otp, id_card: body.id_card, phone: body.phone, email: body.email, vote_mode: voteMode, resends: [Date.now()],
      });
      router.push("/online/otp");
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  const desktop = useIsDesktop();
  const submitBtn = (
    <button type="submit" form="regform" className={`btn btn-primary ${s.cta}`} disabled={!consent || busy}>{busy ? "กำลังส่ง OTP..." : "ขอรับรหัส OTP →"}</button>
  );
  const secure = <div className={`${s.hint} ${s.center}`}>ข้อมูลของท่านจะถูกเข้ารหัสและมีความปลอดภัย</div>;

  if (!desktop) {
    return (
      <OnlineShell title="ลงทะเบียนเข้าร่วมประชุม" step={1} width="card" bare>
        <header className={m.hero}>
          <div className={m.heroTop}>
            <button type="button" className={m.back} onClick={() => router.push("/")} aria-label="กลับหน้าแรก">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            </button>
            <span className={m.step}>ขั้นที่ 1/4</span>
          </div>
          <div className={m.heroBody}>
            <LogoMark size={56} />
            <h1>ลงทะเบียนเข้าร่วมประชุม</h1>
            <p>บริษัท ไทยรุ่งยูเนี่ยนคาร์ จำกัด (มหาชน)</p>
          </div>
          <div className={m.dots} aria-hidden="true"><i className={m.on} /><i /><i /><i /></div>
        </header>

        <form onSubmit={submit} noValidate className={m.card}>
          <div className={m.sec}>ข้อมูลผู้ถือหุ้น</div>
          <div className={m.field}>
            <label className={m.label} htmlFor="acc">เลขทะเบียนผู้ถือหุ้น <span className={m.req}>*</span></label>
            <div className={m.wrap}>
              <Icon name="register" size={18} />
              <input id="acc" className={m.input} value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="เช่น TRU-000001" maxLength={12} autoCapitalize="characters" autoComplete="off" />
            </div>
            <span className={m.hint}>ระบุในหนังสือเชิญประชุม หรือตรวจสอบจากทะเบียนผู้ถือหุ้น</span>
          </div>
          <div className={m.field}>
            <label className={m.label} htmlFor="idc">เลขประจำตัวประชาชน / Passport <span className={m.req}>*</span></label>
            <div className={m.wrap}>
              <Icon name="user" size={18} />
              <input id="idc" className={m.input} value={idCard} onChange={(e) => setIdCard(e.target.value)} placeholder="13 หลัก (ไม่ต้องใส่ขีด)" inputMode="numeric" maxLength={20} autoComplete="off" />
            </div>
          </div>
          <div className={m.field}>
            <label className={m.label} htmlFor="ph">เบอร์โทรศัพท์</label>
            <div className={m.wrap}>
              <Icon name="phone" size={18} />
              <input id="ph" className={m.input} type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812345678" maxLength={15} />
            </div>
          </div>
          <div className={m.field}>
            <label className={m.label} htmlFor="em">อีเมล</label>
            <div className={m.wrap}>
              <Icon name="mail" size={18} />
              <input id="em" className={m.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
            </div>
            <span className={m.hint}>ใช้รับ OTP กรณีไม่มีสัญญาณมือถือ</span>
          </div>

          <div className={m.sec}>ช่องทางรับรหัส OTP</div>
          <div className={m.field}>
            <div className={m.seg} role="radiogroup" aria-label="ช่องทางรับ OTP">
              <button type="button" role="radio" aria-checked={channel === "sms"} className={channel === "sms" ? m.on : ""} onClick={() => setChannel("sms")}><Icon name="phone" size={17} />SMS</button>
              <button type="button" role="radio" aria-checked={channel === "email"} className={channel === "email" ? m.on : ""} onClick={() => setChannel("email")}><Icon name="mail" size={17} />อีเมล</button>
            </div>
            <span className={m.hint}>{channel === "sms" ? "OTP จะส่งไปยังเบอร์โทรศัพท์ที่ระบุ" : "OTP จะส่งไปยังอีเมลที่ระบุ"}</span>
          </div>

          <div className={m.sec}>วิธีลงคะแนนในวันประชุม</div>
          <VoteModePicker value={voteMode} onChange={setVoteMode} />

          <label className={m.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>ข้าพเจ้ายินยอมให้บริษัทฯ เก็บรวบรวมและใช้ข้อมูลส่วนบุคคลตามนโยบายความเป็นส่วนตัว (PDPA) เพื่อวัตถุประสงค์ในการเข้าร่วมประชุมผู้ถือหุ้น</span>
          </label>

          {error && <div className={m.err} role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>}
          <button type="submit" className={m.cta} disabled={!consent || busy}>{busy ? "กำลังส่ง OTP..." : "ขอรับรหัส OTP →"}</button>
          <div className={m.secure}><Icon name="lock" size={13} />ข้อมูลของท่านจะถูกเข้ารหัสและมีความปลอดภัย</div>
        </form>
        <div className={m.foot}>© Thai Rung Union Car Public Company Limited</div>
      </OnlineShell>
    );
  }

  return (
    <OnlineShell title="ลงทะเบียนเข้าร่วมประชุม" step={1} width="card" split footer={desktop ? undefined : <>{submitBtn}{secure}</>}>
      <form id="regform" onSubmit={submit} noValidate className={`${s.regform} ${desktop ? s.insplit : ""}`}>
        {desktop && (
          <div className={s.shead}>
            <h2>ลงทะเบียนเข้าร่วมประชุม</h2>
            <p>กรอกข้อมูลให้ตรงกับทะเบียนผู้ถือหุ้น เพื่อรับรหัส OTP ยืนยันตัวตน</p>
          </div>
        )}
        <div className={s.dhead}>
          <LogoMark size={52} tone="solid" />
          <h2 className={s.dtitle}>E-AGM System</h2>
          <div className={s.dco}>บริษัท ไทยรุ่งยูเนี่ยนคาร์ จำกัด (มหาชน)</div>
          <div className={s.dco}>Thai Rung Union Car Public Company Limited</div>
          <span className={s.mbadge}>ประชุมสามัญผู้ถือหุ้น · ผ่านระบบออนไลน์</span>
        </div>
        <div className={s.info}><strong>ประชุมสามัญผู้ถือหุ้น</strong>ลงทะเบียนและลงคะแนนผ่านระบบออนไลน์</div>
        <div>
          <div className={s.sec}>ข้อมูลผู้ถือหุ้น</div>
          <div className={`${s.cardc} ${s.fields}`}>
            <div className="field">
              <label className="label" htmlFor="acc">เลขทะเบียนผู้ถือหุ้น <span className={s.req}>*</span></label>
              <input id="acc" className={`input ${s.in}`} value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="เช่น TRU-000001" maxLength={12} autoCapitalize="characters" autoComplete="off" />
              <div className={s.hint}>ระบุในหนังสือเชิญประชุม หรือตรวจสอบจากทะเบียนผู้ถือหุ้น</div>
            </div>
            <div className="field">
              <label className="label" htmlFor="idc">เลขประจำตัวประชาชน / Passport <span className={s.req}>*</span></label>
              <input id="idc" className={`input ${s.in}`} value={idCard} onChange={(e) => setIdCard(e.target.value)} placeholder="13 หลัก (ไม่ต้องใส่ขีด)" inputMode="numeric" maxLength={20} autoComplete="off" />
            </div>
            <div className="field">
              <label className="label" htmlFor="ph">เบอร์โทรศัพท์</label>
              <input id="ph" className={`input ${s.in}`} type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812345678" maxLength={15} />
            </div>
            <div className="field">
              <label className="label" htmlFor="em">อีเมล</label>
              <input id="em" className={`input ${s.in}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
              <div className={s.hint}>ใช้รับ OTP กรณีไม่มีสัญญาณมือถือ</div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="label" id="chl">ช่องทางรับ OTP</span>
              <div className={s.channels} role="radiogroup" aria-labelledby="chl">
                <button type="button" role="radio" aria-checked={channel === "sms"} className={`${s.chan} ${channel === "sms" ? s.on : ""}`} onClick={() => setChannel("sms")}>SMS ไปยังเบอร์โทร</button>
                <button type="button" role="radio" aria-checked={channel === "email"} className={`${s.chan} ${channel === "email" ? s.on : ""}`} onClick={() => setChannel("email")}>Email ที่กรอกไว้</button>
              </div>
              <div className={s.hint}>{channel === "sms" ? "OTP จะส่งไปยังเบอร์โทรศัพท์ที่ระบุ" : "OTP จะส่งไปยังอีเมลที่ระบุ"}</div>
            </div>
          </div>
        </div>
        <div>
          <span className="label" style={{ display: "block", marginBottom: 8 }}>วิธีลงคะแนนในวันประชุม</span>
          <VoteModePicker value={voteMode} onChange={setVoteMode} />
        </div>
        <div>
          <div className={s.sec}>การยินยอมข้อมูลส่วนบุคคล</div>
          <label className={s.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>ข้าพเจ้ายินยอมให้บริษัทฯ เก็บรวบรวมและใช้ข้อมูลส่วนบุคคลตามนโยบายความเป็นส่วนตัว (PDPA) เพื่อวัตถุประสงค์ในการเข้าร่วมประชุมผู้ถือหุ้น</span>
          </label>
        </div>
        {error && <div className="error-text" role="alert">{error}</div>}
        {desktop && <>{submitBtn}{secure}</>}
        <div className={s.channelsdesk}>
          <div className={s.sec} style={{ textAlign: "center" }}>ช่องทางการเข้าร่วมประชุม</div>
          <div className={s.tiles}>
            <div className={s.tile}><i style={{ background: "#1e3a8a" }} /><b>Onsite</b><span>เข้าร่วม ณ สถานที่</span></div>
            <div className={`${s.tile} ${s.tileOn}`}><i style={{ background: "#2563eb" }} /><b>Online</b><span>ท่านกำลังใช้ช่องทางนี้</span></div>
            <div className={s.tile}><i style={{ background: "#f59e0b" }} /><b>มอบฉันทะ</b><span>ผ่านผู้รับมอบอำนาจ</span></div>
          </div>
          <div className={s.support}>หากมีปัญหาการเข้าสู่ระบบ กรุณาติดต่อเจ้าหน้าที่ ณ จุดลงทะเบียน</div>
        </div>
      </form>
    </OnlineShell>
  );
}
