"use client";
import { Icon } from "@/components/brand/Icon";
import { FormEvent, useState } from "react";
import { api, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { AdModal as Modal } from "@/components/admin/AdModal";
import { useIsDesktop } from "@/lib/media";
import type { Agenda, Summary, VoteType } from "@/lib/types";
import { AdminFrame, ClosedBanner, PageHead, ResultChip, State, STATUS_BADGE, STATUS_LABEL, useMeeting, useToastAction, VOTE_TYPE_LABEL } from "@/components/admin/common";

interface Form { id?: number; term_id: string; name: string; name_en: string; vote_type: VoteType }
const EMPTY: Form = { term_id: "", name: "", name_en: "", vote_type: "ordinary" };

function Body() {
  const { data, error, loading, reload } = useApi<Agenda[]>("/api/agendas");
  const sum = useApi<Summary>("/api/summary", "staff", 10000);
  const desktop = useIsDesktop();
  const { meeting, closed } = useMeeting();
  const res = (id: number) => sum.data?.terms.find((t) => t.id === id);
  const cnt = (st: string) => data?.filter((a) => a.status === st).length ?? 0;
  const { run, busy, node } = useToastAction();
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Agenda | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const body = { term_id: form.term_id.trim(), name: form.name.trim(), name_en: form.name_en.trim(), vote_type: form.vote_type };
    const ok = await run(
      () => form.id ? api(`/api/admin/agendas/${form.id}`, { method: "PUT", body }) : api("/api/admin/agendas", { method: "POST", body }),
      form.id ? "บันทึกวาระแล้ว" : "เพิ่มวาระแล้ว");
    if (ok) { setForm(null); reload(); }
  };
  const remove = async () => {
    if (!del) return;
    const ok = await run(() => api(`/api/admin/agendas/${del.id}`, { method: "DELETE" }), "ลบวาระแล้ว");
    setDel(null);
    if (ok) reload();
  };

  return (
    <>
      <PageHead title="จัดการวาระการประชุม" sub={`${data?.length ?? 0} วาระ`}
        actions={<button className="btn btn-primary" disabled={closed} onClick={() => setForm(EMPTY)}>+ เพิ่มวาระ</button>} />
      <ClosedBanner meeting={meeting} />
      {!desktop && data && (
        <div className="ad-strip">
          <div><b className="c-blue">{data.length}</b><span>วาระทั้งหมด</span></div>
          <div><b className="c-green">{cnt("closed")}</b><span>เสร็จแล้ว</span></div>
          <div><b className="c-amber">{cnt("open")}</b><span>กำลังดำเนิน</span></div>
          <div><b className="c-gray">{cnt("pending")}</b><span>รอเปิด</span></div>
        </div>
      )}
      <State loading={loading} error={error} empty={data?.length === 0} emptyText="ยังไม่มีวาระ">
        {desktop ? (
          <div className="ad-card ad-tablecard">
            <table className="ad-table">
              <thead><tr><th style={{ width: 56 }}>#</th><th>ชื่อวาระ</th><th>ประเภท</th><th>สถานะ</th><th>ผู้ลงคะแนน</th><th>เห็นด้วย%</th><th style={{ textAlign: "right" }}>จัดการ</th></tr></thead>
              <tbody>
                {data?.map((a) => {
                  const locked = closed || a.status !== "pending";
                  const r = res(a.id);
                  const started = a.status !== "pending";
                  return (
                    <tr key={a.id} className={a.status === "open" ? "live" : ""}>
                      <td><b>{a.term_id}</b></td>
                      <td><b>{a.name}</b>{a.name_en && <div className="muted" style={{ fontSize: 11 }}>{a.name_en}</div>}</td>
                      <td><span className="ad-chip ad-chip-cyan">{VOTE_TYPE_LABEL[a.vote_type]}</span></td>
                      <td>{r ? <ResultChip t={r} /> : <span className={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</span>}</td>
                      <td>{started && r ? <b className="c-blue">{fmt(r.voted_count)} ราย</b> : <span className="muted">—</span>}</td>
                      <td>{started && r ? <b className="c-green">{r.agree_pct.toFixed(1)}%</b> : <span className="muted">—</span>}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="ad-act" disabled={locked} title={a.status !== "pending" ? "แก้ไขได้เฉพาะวาระที่รอเปิด" : undefined}
                          onClick={() => setForm({ id: a.id, term_id: a.term_id, name: a.name, name_en: a.name_en, vote_type: a.vote_type })}>แก้ไข</button>{" "}
                        <button className="ad-act danger" disabled={locked} onClick={() => setDel(a)}>ลบ</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="ad-list">
            {data?.map((a) => {
              const locked = closed || a.status !== "pending";
              const r = res(a.id);
              return (
                <li key={a.id} className={`ad-arow${a.status === "open" ? " live" : ""}${a.status === "pending" ? " dim" : ""}`}>
                  <span className="ad-num">{a.term_id}</span>
                  <div className="ad-arow-main">
                    <div className="ad-arow-t"><b>{a.name}</b>{r ? <ResultChip t={r} /> : <span className={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</span>}</div>
                    {a.name_en && <p className="muted" style={{ fontSize: 12 }}>{a.name_en}</p>}
                    <div className="ad-pills">
                      <span className="ad-chip">{VOTE_TYPE_LABEL[a.vote_type]}</span>
                      {r && a.status !== "pending" && <span className="ad-chip ad-chip-blue">{fmt(r.voted_count)} ผู้ลงคะแนน</span>}
                    </div>
                  </div>
                  <div className="ad-arow-act">
                    <button className="ad-icobtn" aria-label={`แก้ไขวาระ ${a.term_id}`} disabled={locked} onClick={() => setForm({ id: a.id, term_id: a.term_id, name: a.name, name_en: a.name_en, vote_type: a.vote_type })}><Icon name="edit" size={17} /></button>
                    <button className="ad-icobtn danger" aria-label={`ลบวาระ ${a.term_id}`} disabled={locked} onClick={() => setDel(a)}><Icon name="trash" size={17} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </State>

      {form && (
        <Modal title={form.id ? "แก้ไขวาระ" : "เพิ่มวาระ"} onClose={() => !busy && setForm(null)}>
          <form onSubmit={save}>
            <div className="field"><label className="label" htmlFor="tid">เลขที่วาระ</label>
              <input id="tid" className="input" required value={form.term_id} disabled={!!form.id} placeholder="เช่น 5.1" onChange={(e) => setForm({ ...form, term_id: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="nm">ชื่อวาระ (ไทย)</label>
              <input id="nm" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="ne">ชื่อวาระ (อังกฤษ)</label>
              <input id="ne" className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="vt">ประเภทมติ</label>
              <select id="vt" className="input" value={form.vote_type} onChange={(e) => setForm({ ...form, vote_type: e.target.value as VoteType })}>
                {(Object.keys(VOTE_TYPE_LABEL) as VoteType[]).map((k) => <option key={k} value={k}>{VOTE_TYPE_LABEL[k]}</option>)}
              </select></div>
            <div className="modal-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => setForm(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
            </div>
          </form>
        </Modal>
      )}
      {del && (
        <Modal title="ยืนยันการลบวาระ" onClose={() => !busy && setDel(null)}
          actions={<><button className="btn" disabled={busy} onClick={() => setDel(null)}>ยกเลิก</button>
            <button className="btn btn-danger" disabled={busy} onClick={remove}>{busy ? "กำลังลบ..." : "ลบวาระ"}</button></>}>
          <p>ต้องการลบวาระ <b>{del.term_id} {del.name}</b> หรือไม่? การลบไม่สามารถย้อนกลับได้</p>
        </Modal>
      )}
      {node}
    </>
  );
}

export default function Page() { return <AdminFrame title="จัดการวาระ"><Body /></AdminFrame>; }
