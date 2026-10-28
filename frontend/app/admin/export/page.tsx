"use client";
import { Icon } from "@/components/brand/Icon";
import { useState } from "react";
import { download, errMsg } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Meeting } from "@/lib/types";
import { AdminFrame, PageHead, State, useToastAction } from "@/components/admin/common";

const SOON = [
  { icon: "file", title: "รายงานสรุปผลการประชุม (PDF)", desc: "สรุปผลทุกวาระพร้อมองค์ประชุม สำหรับเก็บเป็นเอกสาร", c: "amber", fmts: ["PDF"] },
  { icon: "users", title: "รายชื่อผู้เข้าร่วม (Excel)", desc: "รายชื่อผู้ถือหุ้นที่ลงทะเบียน Onsite / Online", c: "purple", fmts: ["Excel"] },
  { icon: "shield", title: "Audit Log (Excel)", desc: "บันทึกการใช้งานระบบทั้งหมด", c: "red", fmts: ["Excel"] },
];

function Body() {
  const { data, error, loading } = useApi<Meeting[]>("/api/admin/meetings");
  const { show, node } = useToastAction();
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const y = year || data?.[0]?.year || "";

  const doExport = async () => {
    setBusy(true);
    try { await download(`/api/admin/export/summary.csv?year=${encodeURIComponent(y)}`, `summary_${y}.csv`); show("ดาวน์โหลดแล้ว"); }
    catch (e) { show(errMsg(e), true); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="ส่งออกรายงาน" sub="ดาวน์โหลดรายงานการประชุมในรูปแบบต่าง ๆ" />
      <State loading={loading} error={error} empty={data?.length === 0} emptyText="ยังไม่มีข้อมูลการประชุม">
        <div className="ad-exgrid">
          <section className="ad-card ad-ex top-blue" aria-labelledby="rc-csv">
            <span className="ad-ex-ic" style={{ background: "#dbeafe" }} aria-hidden><Icon name="chart" size={22} style={{ color: "#1d4ed8" }} /></span>
            <div><b id="rc-csv">ผลการลงคะแนนรายวาระ</b>
              <p className="muted">เห็นด้วย / ไม่เห็นด้วย / งดออกเสียง / บัตรเสีย และผลของแต่ละวาระ</p></div>
            <div className="ad-pills"><span className="ad-chip ad-chip-blue">CSV</span>{y && <span className="ad-chip">ปี {y}</span>}</div>
            <div className="ad-ex-foot">
              <label className="label" htmlFor="yr">ปีการประชุม</label>
              <select id="yr" className="input" value={y} onChange={(e) => setYear(e.target.value)}>
                {data?.map((m) => <option key={m.year} value={m.year}>{m.year}{m.closed_at ? " (ปิดแล้ว)" : ""}</option>)}
              </select>
              <button className="btn btn-primary btn-block" disabled={busy || !y} onClick={doExport}>{busy ? "กำลังดาวน์โหลด..." : <><Icon name="download" size={15} className="ico-inl" />ดาวน์โหลด CSV</>}</button>
            </div>
          </section>
          {SOON.map((s) => (
            <section key={s.title} className={`ad-card ad-ex soon top-${s.c}`} aria-disabled="true">
              <span className="ad-ex-ic" aria-hidden><Icon name={s.icon} size={22} style={{ color: "#1e3a8a" }} /></span>
              <div><b>{s.title}</b><p className="muted">{s.desc}</p></div>
              <div className="ad-pills">{s.fmts.map((f) => <span key={f} className="ad-chip">{f}</span>)}<span className="ad-chip ad-chip-amber">เร็ว ๆ นี้</span></div>
              <div className="ad-ex-foot"><button className="btn btn-block" disabled>เร็ว ๆ นี้</button></div>
            </section>
          ))}
        </div>
      </State>
      {node}
    </>
  );
}

export default function Page() { return <AdminFrame title="รายงาน"><Body /></AdminFrame>; }
