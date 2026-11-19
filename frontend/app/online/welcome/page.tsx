"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg, fmt } from "@/lib/api";
import { Icon } from "@/components/brand/Icon";
import { Modal } from "@/components/Modal";
import { AuthFrame, LOGIN_STEPS } from "@/components/online/AuthFrame";
import { VoteMode, VoteModePicker } from "@/components/online/VoteMode";
import { Me, holderLogout, setNotice, useHolderApi } from "@/components/online/hooks";
import a from "@/components/online/auth.module.css";

const initial = (n?: string) => (n ? n.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").trim().charAt(0) || "ส" : "ส");

/** Flow page 3 - first visit of the year: accept PDPA and choose how to vote (saved once per meeting). */
export default function OnlineWelcome() {
  const router = useRouter();
  const { data: me, error: meErr } = useHolderApi<Me>("/api/online/me");
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<VoteMode | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [declining, setDeclining] = useState(false);

  // already registered this year (e.g. reopened the page): straight to the meeting room
  useEffect(() => { if (me?.registered !== false && me) router.replace("/online/waiting"); }, [me, router]);

  const submit = async () => {
    if (!consent) { setError("กรุณายอมรับนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)"); return; }
    if (!mode) { setError("กรุณาเลือกวิธีลงคะแนน"); return; }
    setBusy(true); setError("");
    try {
      await api("/api/online/consent", { method: "POST", body: { consent: true, vote_mode: mode }, session: "holder" });
      router.replace("/online/waiting");
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  const decline = () => {
    setNotice("ท่านไม่ได้ยอมรับ PDPA จึงยังเข้าร่วมประชุมออนไลน์ไม่ได้ หากเปลี่ยนใจสามารถเข้าสู่ระบบใหม่ได้ หรือลงทะเบียนที่หน้างานในวันประชุม");
    void holderLogout((p) => router.replace(p), "/online");
  };

  return (
    <AuthFrame title="ยืนยันข้อมูลก่อนเข้าประชุม" subtitle="ทำครั้งเดียวต่อการประชุมแต่ละปี" steps={LOGIN_STEPS} step={3}>
      {me ? (
        <div className={a.who}>
          <span aria-hidden="true">{initial(me.name)}</span>
          <div><b>{me.name}</b><small>User {me.account_id} · {fmt(me.shares)} หุ้น</small></div>
        </div>
      ) : <div className="muted">{meErr || "กำลังโหลด..."}</div>}

      <div className={a.sec}>1. นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)</div>
      <div className={a.pdpa} tabIndex={0} aria-label="รายละเอียด PDPA">
        <h4>การเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล</h4>
        <ol>
          <li>บริษัทฯ ใช้ชื่อ เลขทะเบียนผู้ถือหุ้น จำนวนหุ้น อีเมล เบอร์มือถือ และหมายเลข IP เพื่อยืนยันตัวตน ลงทะเบียน และนับองค์ประชุม</li>
          <li>ผลการลงคะแนนของท่านจะถูกบันทึกและนับรวมเป็นมติที่ประชุม โดยไม่เปิดเผยว่าผู้ถือหุ้นรายใดลงคะแนนอย่างไรต่อผู้ถือหุ้นรายอื่น</li>
          <li>ระบบบันทึกประวัติการใช้งาน (Audit Log) เพื่อความโปร่งใสและการตรวจสอบตามกฎหมาย</li>
          <li>ข้อมูลจะถูกเก็บเท่าที่จำเป็นตามระยะเวลาที่กฎหมายกำหนด และท่านสามารถใช้สิทธิตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล โดยติดต่อบริษัทฯ</li>
        </ol>
      </div>
      <label className={`${a.consent} ${consent ? a.on : ""}`}>
        <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(""); }} />
        <span>ข้าพเจ้าได้อ่านและ <b>ยินยอม</b> ให้บริษัทฯ เก็บรวบรวมและใช้ข้อมูลส่วนบุคคลเพื่อการประชุมผู้ถือหุ้น</span>
      </label>

      <div className={a.sec}>2. วิธีลงคะแนนในวันประชุม</div>
      <VoteModePicker value={mode || undefined} onChange={(v) => { setMode(v); setError(""); }} disabled={!consent} />
      <span className={a.hint}>{consent ? "เปลี่ยนจาก “เจ้าหน้าที่ลงแทน” เป็น “ลงเอง” ได้ภายหลัง ตราบใดที่ยังไม่ได้ลงคะแนน" : "ยอมรับ PDPA ก่อน จึงจะเลือกวิธีลงคะแนนได้"}</span>

      {error && <div className={a.err} role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>}
      <button type="button" className={a.cta} disabled={busy || !me || !consent || !mode} onClick={() => void submit()}>{busy ? "กำลังบันทึก..." : "ยืนยันและเข้าห้องประชุม →"}</button>
      <button type="button" className={a.decline} onClick={() => setDeclining(true)}>ไม่ยอมรับ และออกจากระบบ</button>

      {declining && (
        <Modal title="ไม่ยอมรับ PDPA?" onClose={() => setDeclining(false)}
          actions={<>
            <button type="button" className="btn" onClick={() => setDeclining(false)}>กลับไปอ่าน</button>
            <button type="button" className="btn btn-danger" onClick={decline}>ไม่ยอมรับ และออกจากระบบ</button>
          </>}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>หากไม่ยอมรับ ท่านจะ <b>ไม่สามารถเข้าร่วมประชุมและลงคะแนนผ่านระบบออนไลน์</b> ได้</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>ท่านยังเข้าร่วมประชุมได้โดยลงทะเบียนที่หน้างาน หรือมอบฉันทะตามหนังสือเชิญประชุม</p>
        </Modal>
      )}
    </AuthFrame>
  );
}
