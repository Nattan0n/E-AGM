"use client";
import { Icon } from "@/components/brand/Icon";
import { Select } from "@/components/Select";
import { useState } from "react";
import { download, errMsg } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Meeting } from "@/lib/types";
import Link from "next/link";
import { AdminFrame, PageHead, State, useToastAction } from "@/components/admin/common";


function Body() {
  const { data, error, loading } = useApi<Meeting[]>("/api/admin/meetings");
  const { show, node } = useToastAction();
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const y = year || data?.[0]?.year || "";

  const [which, setWhich] = useState("");
  const doExport = async (kind: "summary" | "attendees" | "audit") => {
    setBusy(true); setWhich(kind);
    try {
      const q = kind === "audit" ? "" : `?year=${encodeURIComponent(y)}`;
      await download(`/api/admin/export/${kind}.csv${q}`, kind === "audit" ? "audit.csv" : `${kind}_${y}.csv`);
      show("ดาวน์โหลดแล้ว");
    }
    catch (e) { show(errMsg(e), true); }
    finally { setBusy(false); setWhich(""); }
  };

  return (
    <>
      <PageHead title="ส่งออกรายงาน" sub="ดาวน์โหลดรายงานการประชุมในรูปแบบต่าง ๆ" />
      <State loading={loading} error={error} empty={data?.length === 0} emptyText="ยังไม่มีข้อมูลการประชุม">
        <div className="adm-exgrid">
          <section className="adm-card adm-ex top-blue" aria-labelledby="rc-csv">
            <span className="adm-ex-ic" style={{ background: "#dbeafe" }} aria-hidden><Icon name="chart" size={22} style={{ color: "#1d4ed8" }} /></span>
            <div><b id="rc-csv">ผลการลงคะแนนรายวาระ</b>
              <p className="muted">เห็นด้วย / ไม่เห็นด้วย / งดออกเสียง / บัตรเสีย และผลของแต่ละวาระ</p></div>
            <div className="adm-pills"><span className="adm-chip adm-chip-blue">CSV</span>{y && <span className="adm-chip">ปี {y}</span>}</div>
            <div className="adm-ex-foot">
              <label className="label" htmlFor="yr">ปีการประชุม</label>
              <Select id="yr" className="input" value={y} onChange={(e) => setYear(e.target.value)}>
                {data?.map((m) => <option key={m.year} value={m.year}>{m.year}{m.closed_at ? " (ปิดแล้ว)" : ""}</option>)}
              </Select>
              <button className="btn btn-primary btn-block" disabled={busy || !y} onClick={() => doExport("summary")}>{busy && which === "summary" ? "กำลังดาวน์โหลด..." : <><Icon name="download" size={15} className="ico-inl" />ดาวน์โหลด CSV</>}</button>
            </div>
          </section>
          <section className="adm-card adm-ex top-amber" aria-labelledby="rc-pdf">
            <span className="adm-ex-ic" style={{ background: "#fef3c7" }} aria-hidden><Icon name="file" size={22} style={{ color: "#b45309" }} /></span>
            <div><b id="rc-pdf">รายงานสรุปผลการประชุม (PDF)</b>
              <p className="muted">สรุปองค์ประชุมและผลทุกวาระ พร้อมช่องลงนาม — เปิดหน้ารายงานแล้วเลือก Save as PDF</p></div>
            <div className="adm-pills"><span className="adm-chip adm-chip-amber">PDF</span>{y && <span className="adm-chip">ปี {y}</span>}</div>
            <div className="adm-ex-foot">
              <Link className="btn btn-primary btn-block" href={`/admin/report?year=${encodeURIComponent(y)}`}><Icon name="print" size={15} className="ico-inl" />เปิดรายงาน / พิมพ์</Link>
            </div>
          </section>
          <section className="adm-card adm-ex top-purple" aria-labelledby="rc-att">
            <span className="adm-ex-ic" style={{ background: "#ede9fe" }} aria-hidden><Icon name="users" size={22} style={{ color: "#6d28d9" }} /></span>
            <div><b id="rc-att">รายชื่อผู้เข้าร่วม (Excel)</b>
              <p className="muted">ผู้ถือหุ้นที่ลงทะเบียน Onsite และ Online พร้อมจำนวนหุ้นและเวลา</p></div>
            <div className="adm-pills"><span className="adm-chip adm-chip-blue">CSV / Excel</span>{y && <span className="adm-chip">ปี {y}</span>}</div>
            <div className="adm-ex-foot">
              <button className="btn btn-primary btn-block" disabled={busy || !y} onClick={() => doExport("attendees")}>{busy && which === "attendees" ? "กำลังดาวน์โหลด..." : <><Icon name="download" size={15} className="ico-inl" />ดาวน์โหลด</>}</button>
            </div>
          </section>
          <section className="adm-card adm-ex top-red" aria-labelledby="rc-aud">
            <span className="adm-ex-ic" style={{ background: "#fee2e2" }} aria-hidden><Icon name="shield" size={22} style={{ color: "#b91c1c" }} /></span>
            <div><b id="rc-aud">Audit Log (Excel)</b>
              <p className="muted">บันทึกการใช้งานระบบล่าสุด 20,000 รายการ — ใครทำอะไร เมื่อไร จาก IP ใด</p></div>
            <div className="adm-pills"><span className="adm-chip adm-chip-blue">CSV / Excel</span></div>
            <div className="adm-ex-foot">
              <button className="btn btn-primary btn-block" disabled={busy} onClick={() => doExport("audit")}>{busy && which === "audit" ? "กำลังดาวน์โหลด..." : <><Icon name="download" size={15} className="ico-inl" />ดาวน์โหลด</>}</button>
            </div>
          </section>
        </div>
      </State>
      {node}
    </>
  );
}

export default function Page() { return <AdminFrame title="รายงาน"><Body /></AdminFrame>; }
