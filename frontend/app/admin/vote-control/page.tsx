"use client";
import { Icon } from "@/components/brand/Icon";
import { useState } from "react";
import { api, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { AdModal as Modal } from "@/components/admin/AdModal";
import type { Summary, TermResult } from "@/lib/types";
import { AdminFrame, ClosedBanner, Live, PageHead, ResultBar, ResultChip, State, Switch, useToastAction, VOTE_TYPE_LABEL } from "@/components/admin/common";

function Body() {
  const { data, error, loading, reload } = useApi<Summary>("/api/summary", "staff", 3000);
  const { run, busy, node } = useToastAction();
  const [closing, setClosing] = useState<TermResult | null>(null);
  const [ack, setAck] = useState(false);
  const closed = !!data?.meeting.closed_at;
  const opened = data?.terms.filter((t) => t.status === "open") ?? [];

  const setStatus = async (t: TermResult, status: "open" | "closed") => {
    const ok = await run(() => api(`/api/admin/agendas/${t.id}/status`, { method: "PATCH", body: { status } }),
      status === "open" ? `เปิดโหวตวาระ ${t.term_id} แล้ว` : `ปิดโหวตวาระ ${t.term_id} แล้ว`);
    if (status === "closed") { setClosing(null); setAck(false); }
    if (ok) reload();
  };
  const openClose = (t: TermResult) => { setAck(false); setClosing(t); };
  const cancelClose = () => { if (!busy) { setClosing(null); setAck(false); } };

  return (
    <>
      <PageHead title="เปิด/ปิดการลงคะแนน" sub="เปิดได้ครั้งละ 1 กลุ่มวาระ (เช่น 5, 5.1, 5.2) · อัปเดตสดทุก 3 วินาที" actions={<Live>สด</Live>} />
      <ClosedBanner meeting={data?.meeting} />
      {data && (
        <div className="ad-card ad-card-b" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          <span aria-hidden style={{ flexShrink: 0, color: data.meeting.room_open ? "#16a34a" : "#94a3b8" }}><Icon name="building" size={30} /></span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b>ห้องประชุมออนไลน์: {data.meeting.room_open ? "เปิดแล้ว" : "ยังไม่เปิด (ผู้ถือหุ้นอยู่ในห้องรอ)"}</b>
            <p className="muted" style={{ marginTop: 2 }}>{data.meeting.room_open ? "ผู้ถือหุ้นที่ลงทะเบียนแล้วเห็นวาระการประชุมและลงคะแนนได้เมื่อวาระเปิดโหวต" : "ผู้ถือหุ้นที่ลงทะเบียนล่วงหน้าจะเห็นเฉพาะหน้ารอ ยังไม่เห็นวาระ — เปิดเมื่อถึงเวลาเริ่มประชุม"}</p>
          </div>
          <Switch on={data.meeting.room_open} disabled={busy || closed} label={data.meeting.room_open ? "ปิดห้องประชุมออนไลน์" : "เปิดห้องประชุมออนไลน์"}
            onChange={async () => { if (await run(() => api("/api/admin/meeting/room", { method: "PATCH", body: { open: !data.meeting.room_open } }), data.meeting.room_open ? "ปิดห้องประชุมแล้ว" : "เปิดห้องประชุมแล้ว")) reload(); }} />
        </div>
      )}
      <State loading={loading && !data} error={data ? "" : error} empty={data?.terms.length === 0} emptyText="ยังไม่มีวาระ">
        <div className="ad-vc">
          <div className="ad-vc-open">
            {opened.length === 0 ? (
              <div className="ad-card ad-card-b ad-vc-idle"><span aria-hidden><Icon name="vote" size={36} /></span><b>ไม่มีวาระที่เปิดลงคะแนนอยู่</b><p className="muted">เลือกวาระจากรายการแล้วกดสวิตช์เพื่อเปิดโหวต</p></div>
            ) : opened.map((t) => {
              const left = Math.max(0, t.eligible - t.voted_count);
              return (
                <div key={t.id} className="ad-card ad-vc-now">
                  <span className="ad-live"><i aria-hidden />กำลังลงคะแนนอยู่</span>
                  <p className="ad-vc-lbl">วาระที่ {t.term_id} — {VOTE_TYPE_LABEL[t.vote_type]}</p>
                  <h2>{t.name}</h2>
                  <div className="ad-tiles">
                    <div className="g"><b>{t.agree_pct.toFixed(1)}%</b><span>เห็นด้วย</span></div>
                    <div className="r"><b>{t.disagree_pct.toFixed(1)}%</b><span>ไม่เห็นด้วย</span></div>
                    <div className="y"><b>{t.abstain_pct.toFixed(1)}%</b><span>งดออกเสียง</span></div>
                  </div>
                  <ResultBar t={t} />
                  <div className="ad-vc-stats">
                    <span>ลงคะแนนแล้ว <b>{fmt(t.voted_count)}</b> ราย</span>
                    <span>เหลือ <b>{fmt(left)}</b> ราย</span>
                    <span>หุ้นเห็นด้วย <b>{fmt(t.total.agree)}</b></span>
                  </div>
                  <button className="ad-closebtn" disabled={busy || closed} onClick={() => openClose(t)}>■ ปิดการลงคะแนน วาระที่ {t.term_id}</button>
                  <p className="ad-vc-note">การปิดจะบันทึกผลคะแนนทันที และไม่สามารถเปลี่ยนแปลงได้</p>
                </div>
              );
            })}
          </div>

          <div className="ad-card">
            <div className="ad-card-h">สถานะทุกวาระ</div>
            <ul className="ad-vlist">
              {data?.terms.map((t) => (
                <li key={t.id} className={`ad-vrow${t.status === "open" ? " live" : ""}`}>
                  <span className="ad-num">{t.term_id}</span>
                  <div className="ad-vrow-m">
                    <b>{t.name}</b>
                    <small>{t.status === "pending" ? "รอดำเนินการ" : <><ResultChip t={t} /> <span className="muted">{fmt(t.voted_count)}/{fmt(t.eligible)} ราย</span></>}</small>
                  </div>
                  <div className="ad-vrow-s">
                    {t.status === "closed" && <span className="ad-vstate"><Icon name="check" size={13} className="ico-inl" />ปิดแล้ว</span>}
                    {t.status === "open" && <span className="ad-vstate red"><span className="ico-dot" aria-hidden />LIVE</span>}
                    {t.status === "pending" && <span className="ad-vstate muted">ยังไม่เปิด</span>}
                    <Switch on={t.status === "open"} disabled={busy || closed || t.status === "closed"}
                      label={t.status === "pending" ? `เปิดโหวตวาระ ${t.term_id}` : t.status === "open" ? `ปิดโหวตวาระ ${t.term_id}` : "ปิดแล้ว - เปิดซ้ำไม่ได้"}
                      onChange={() => (t.status === "pending" ? setStatus(t, "open") : openClose(t))} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </State>

      {closing && (
        <Modal title={`ปิดโหวตวาระ ${closing.term_id}`} onClose={cancelClose}
          actions={<>
            <button className="btn" disabled={busy} onClick={cancelClose}>ยกเลิก</button>
            <button className="btn btn-danger" disabled={!ack || busy} onClick={() => setStatus(closing, "closed")}>{busy ? "กำลังปิด..." : "ยืนยันปิดโหวต"}</button>
          </>}>
          <p style={{ marginBottom: 12 }}>{closing.name}</p>
          <label className="ad-ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 4 }} />
            <span>ผู้ที่ยังไม่ได้ลงคะแนนจะถูกนับเป็น เห็นด้วย อัตโนมัติ</span>
          </label>
        </Modal>
      )}
      {node}
    </>
  );
}

export default function Page() { return <AdminFrame title="ควบคุมโหวต"><Body /></AdminFrame>; }
