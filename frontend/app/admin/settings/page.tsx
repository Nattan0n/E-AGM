"use client";
import { Icon, type IconName } from "@/components/brand/Icon";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { AdModal as Modal } from "@/components/admin/AdModal";
import type { Meeting } from "@/lib/types";
import { meetingTitle, AdminFrame, ClosedBanner, Live, PageHead, State, useToastAction } from "@/components/admin/common";

function MeetingForm({ m, onDone }: { m: Meeting; onDone: () => void }) {
  const { run, busy, node } = useToastAction();
  const [detail, setDetail] = useState(m.detail);
  const [date, setDate] = useState(m.date);
  const [quorum, setQuorum] = useState(String(m.quorum_pct));
  const [online, setOnline] = useState(m.online_enabled);
  const [advance, setAdvance] = useState(m.advance_entry);
  const closed = !!m.closed_at;
  const q = Number(quorum);
  const qOk = q > 0 && q <= 100;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!qOk) return;
    const ok = await run(() => api("/api/admin/meeting", { method: "PUT", body: { detail, date, quorum_pct: q, online_enabled: online, advance_entry: advance } }), "บันทึกการตั้งค่าแล้ว");
    if (ok) onDone();
  };

  return (
    <form className="adm-card adm-set" onSubmit={save}>
      <div className="adm-card-h"><span><Icon name="register" size={16} className="ico-inl" />ข้อมูลการประชุม ปี {m.year}</span></div>
      <div className="adm-card-b">
        <div className="field"><label className="label" htmlFor="md">ชื่อ / รายละเอียดการประชุม</label>
          <input id="md" className="input" disabled={closed} value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
        <div className="field"><label className="label" htmlFor="mdt">วันที่ประชุม</label>
          <input id="mdt" className="input" disabled={closed} value={date} onChange={(e) => setDate(e.target.value)} placeholder="เช่น 2026-04-25" /></div>
        <div className="field"><label className="label" htmlFor="mq">เกณฑ์องค์ประชุม (%)</label>
          <input id="mq" className="input" type="number" step="0.01" min="0.01" max="100" disabled={closed} value={quorum} onChange={(e) => setQuorum(e.target.value)} />
          {!qOk && <p className="error-text">ต้องอยู่ระหว่าง 0-100</p>}</div>
        <label className="adm-check">
          <input type="checkbox" disabled={closed} checked={online} onChange={(e) => setOnline(e.target.checked)} /> เปิดให้ลงทะเบียน/ลงคะแนนออนไลน์
        </label>
        <label className="adm-check">
          <input type="checkbox" disabled={closed} checked={advance} onChange={(e) => setAdvance(e.target.checked)} /> โหมดเตรียมงาน: ให้เจ้าหน้าที่คีย์คะแนนล่วงหน้าได้ทุกวาระ แม้วาระยังไม่เปิดโหวต
        </label>
        <button type="submit" className="btn btn-primary" disabled={closed || busy || !qOk}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
      </div>
      {node}
    </form>
  );
}

function CloseMeeting({ m, onDone }: { m: Meeting; onDone: () => void }) {
  const { run, busy, node } = useToastAction();
  const [confirmClose, setConfirmClose] = useState(false);
  const closed = !!m.closed_at;
  const close = async () => {
    const ok = await run(() => api("/api/admin/meeting/close", { method: "POST" }), "ปิดการประชุมแล้ว");
    setConfirmClose(false);
    if (ok) onDone();
  };
  return (
    <div className="adm-card adm-danger">
      <div className="adm-card-h"><Icon name="warn" size={16} className="ico-inl" />Danger Zone — ดำเนินการด้วยความระมัดระวัง</div>
      <div className="adm-card-b adm-danger-row">
        <div><b>ปิดการประชุม</b>
          <p className="muted">เมื่อปิดแล้วข้อมูลทั้งหมดจะเป็นแบบอ่านอย่างเดียว และไม่สามารถเปิดกลับได้ (ต้องปิดทุกวาระที่เปิดอยู่ก่อน)</p></div>
        <button className="btn btn-danger" disabled={closed || busy} onClick={() => setConfirmClose(true)}>{closed ? "ปิดการประชุมแล้ว" : "ปิดการประชุม"}</button>
      </div>
      {confirmClose && (
        <Modal title="ยืนยันการปิดการประชุม" onClose={() => !busy && setConfirmClose(false)}
          actions={<><button className="btn" disabled={busy} onClick={() => setConfirmClose(false)}>ยกเลิก</button>
            <button className="btn btn-danger" disabled={busy} onClick={close}>{busy ? "กำลังปิด..." : "ยืนยันปิดการประชุม"}</button></>}>
          <p>การประชุมปี <b>{m.year}</b> จะกลายเป็น<b>อ่านอย่างเดียว</b> และ<b>ไม่สามารถย้อนกลับได้</b> ต้องการดำเนินการต่อหรือไม่?</p>
        </Modal>
      )}
      {node}
    </div>
  );
}

function NewMeeting({ current, onDone }: { current: Meeting; onDone: () => void }) {
  const { run, busy, node } = useToastAction();
  const [year, setYear] = useState(String(Number(current.year) + 1));
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState("");
  const [quorum, setQuorum] = useState("33.33");
  const closed = !!current.closed_at;
  const q = Number(quorum);
  const valid = /^\d{4}$/.test(year) && q > 0 && q <= 100;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await run(() => api("/api/admin/meeting", { method: "POST", body: { year, detail, date, quorum_pct: q } }), `สร้างการประชุมปี ${year} แล้ว`);
    if (ok) onDone();
  };
  return (
    <form className="adm-card adm-set" onSubmit={create}>
      <div className="adm-card-h"><Icon name="calendar" size={16} className="ico-inl" />สร้างการประชุมปีใหม่</div>
      <div className="adm-card-b">
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{closed ? "ข้อมูลปีก่อนจะถูกเก็บเป็นประวัติแบบอ่านอย่างเดียว" : "ทำได้เมื่อปิดการประชุมปัจจุบันแล้วเท่านั้น"}</p>
      <div className="field"><label className="label" htmlFor="ny">ปี (4 หลัก)</label>
        <input id="ny" className="input" inputMode="numeric" maxLength={4} disabled={!closed} value={year} onChange={(e) => setYear(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor="nd">ชื่อ / รายละเอียด</label>
        <input id="nd" className="input" disabled={!closed} value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor="ndt">วันที่ประชุม</label>
        <input id="ndt" className="input" disabled={!closed} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor="nq">เกณฑ์องค์ประชุม (%)</label>
        <input id="nq" className="input" type="number" step="0.01" min="0.01" max="100" disabled={!closed} value={quorum} onChange={(e) => setQuorum(e.target.value)} /></div>
      <button type="submit" className="btn btn-primary" disabled={!closed || busy || !valid}>{busy ? "กำลังสร้าง..." : "สร้างการประชุม"}</button>
      </div>
      {node}
    </form>
  );
}

function Disabled({ icon, title, desc, bg }: { icon: IconName; title: string; desc: string; bg: string }) {
  return (
    <section className="adm-soon" aria-disabled="true">
      <span className="adm-ex-ic" style={{ background: bg }} aria-hidden><Icon name={icon} size={22} style={{ color: "#1e3a8a" }} /></span>
      <div><b>{title}</b><p className="muted">{desc}</p></div>
      <span className="adm-chip adm-chip-amber">กำลังพัฒนา</span>
      <button className="btn btn-sm" disabled aria-label={title}>ยังไม่เปิดใช้งาน</button>
    </section>
  );
}

function Body() {
  const { data, error, loading, reload } = useApi<Meeting>("/api/meeting");
  return (
    <>
      <PageHead title="ตั้งค่าการประชุม" sub={data ? meetingTitle(data) : undefined}
        actions={data && <Live>{data.closed_at ? "ปิดแล้ว" : "กำลังดำเนินการ"}</Live>} />
      <ClosedBanner meeting={data} />
      <State loading={loading && !data} error={data ? "" : error}>
        {data && (
          <div className="adm-cols">
            <div className="adm-col">
              <MeetingForm key={`${data.id}-${data.closed_at ?? ""}`} m={data} onDone={reload} />
              <NewMeeting key={`n-${data.id}-${data.closed_at ?? ""}`} current={data} onDone={reload} />
            </div>
            <div className="adm-col">
              <div className="adm-card adm-set">
                <div className="adm-card-h"><Icon name="download" size={16} className="ico-inl" />นำเข้า / ล้างข้อมูล</div>
                <div className="adm-card-b adm-soons">
                  <Disabled icon="download" bg="#ede9fe" title="นำเข้ารายชื่อผู้ถือหุ้น (Excel)" desc="นำเข้าข้อมูลผู้ถือหุ้นจากไฟล์ Excel" />
                  <Disabled icon="broom" bg="#fee2e2" title="ล้างข้อมูล (Clear Data)" desc="ล้างข้อมูลการลงทะเบียนและการลงคะแนน" />
                </div>
              </div>
              <CloseMeeting m={data} onDone={reload} />
            </div>
          </div>
        )}
      </State>
    </>
  );
}

export default function Page() { return <AdminFrame title="ตั้งค่า"><Body /></AdminFrame>; }
