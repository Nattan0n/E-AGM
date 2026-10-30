"use client";
import { Icon } from "@/components/brand/Icon";
import { Select } from "@/components/Select";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Meeting, Summary } from "@/lib/types";
import { meetingTitle, AdminFrame, PageHead, RESULT_LABEL, State, VOTE_TYPE_LABEL } from "@/components/admin/common";
import styles from "./report.module.css";

/** Printable meeting report: use the browser's "Save as PDF" in the print dialog. */
function Body() {
  const sp = useSearchParams();
  const list = useApi<Meeting[]>("/api/admin/meetings");
  const year = sp.get("year") || list.data?.[0]?.year || "";
  const sum = useApi<Summary>(year ? `/api/admin/meetings/${encodeURIComponent(year)}/summary` : null);
  useEffect(() => {
    document.body.classList.add("print-report");
    return () => document.body.classList.remove("print-report");
  }, []);
  const m = sum.data?.meeting, st = sum.data?.stats;
  // columns that need figures the backend may not send yet: shown only when present
  const hasRight = !!sum.data?.terms.some((t) => t.novote_shares !== undefined);
  const now = new Date().toLocaleString("th-TH");

  return (
    <>
      <div className="noprint">
        <PageHead title="รายงานสรุปผลการประชุม" sub="กด “พิมพ์ / บันทึกเป็น PDF” แล้วเลือกปลายทาง Save as PDF"
          actions={<button className="btn btn-primary" disabled={!sum.data} onClick={() => window.print()}><Icon name="print" size={15} className="ico-inl" />พิมพ์ / บันทึกเป็น PDF</button>} />
        {(list.data?.length ?? 0) > 1 && (
          <div className="field" style={{ maxWidth: 260 }}>
            <label className="label" htmlFor="ry">ปีการประชุม</label>
            <Select id="ry" className="input" value={year} onChange={(e) => { window.location.search = `?year=${encodeURIComponent(e.target.value)}`; }}>
              {list.data?.map((x) => <option key={x.year} value={x.year}>{x.year}{x.closed_at ? " (ปิดแล้ว)" : ""}</option>)}
            </Select>
          </div>
        )}
      </div>
      <State loading={(list.loading || sum.loading) && !sum.data} error={sum.data ? "" : (sum.error || list.error)} empty={!year} emptyText="ยังไม่มีข้อมูลการประชุม">
        {m && st && sum.data && (
          <article className={styles.sheet}>
            <h1>รายงานสรุปผลการประชุม — {meetingTitle(m)}</h1>
            <p className={styles.sub}>{m.date} · {m.closed_at ? "ประชุมปิดแล้ว" : "การประชุมยังดำเนินการอยู่ (ผลอาจเปลี่ยนแปลง)"}</p>
            <div className={styles.kpis}>
              <div className={styles.kpi}><b>{fmt(st.onsite_count + st.online_count)}</b><span>ผู้เข้าร่วม (Onsite {fmt(st.onsite_count)} · Online {fmt(st.online_count)})</span></div>
              <div className={styles.kpi}><b>{fmt(st.onsite_shares + st.online_shares)}</b><span>หุ้นที่เข้าร่วม จาก {fmt(st.total_shares)}</span></div>
              <div className={styles.kpi}><b>{st.quorum_pct.toFixed(2)}%</b><span>องค์ประชุม (เกณฑ์ {st.quorum_required_pct}%) — {st.quorum_reached ? "ครบองค์ประชุม" : "ไม่ครบองค์ประชุม"}</span></div>
              <div className={styles.kpi}><b>{sum.data.terms.length}</b><span>วาระทั้งหมด</span></div>
            </div>
            {st.self_count !== undefined && (
              <table className={`${styles.tbl} ${styles.att}`} style={{ marginBottom: 18, maxWidth: 520 }}>
                <thead><tr><th>การเข้าร่วม</th><th>ราย</th><th>หุ้น</th></tr></thead>
                <tbody>
                  <tr><td>มาด้วยตนเอง</td><td>{fmt(st.self_count)}</td><td>{fmt(st.self_shares ?? 0)}</td></tr>
                  <tr><td>มอบฉันทะ</td><td>{fmt(st.proxy_count ?? 0)}</td><td>{fmt(st.proxy_shares ?? 0)}</td></tr>
                  {(st.group_count ?? 0) > 0 && <tr><td>กลุ่ม / นิติบุคคล</td><td>{fmt(st.group_count ?? 0)}</td><td>{fmt(st.group_shares ?? 0)}</td></tr>}
                  <tr><td>ออนไลน์</td><td>{fmt(st.online_count)}</td><td>{fmt(st.online_shares)}</td></tr>
                  <tr><td><b>รวม</b></td><td><b>{fmt(st.onsite_count + st.online_count)}</b></td><td><b>{fmt(st.onsite_shares + st.online_shares)}</b></td></tr>
                </tbody>
              </table>
            )}
            <table className={styles.tbl}>
              <thead><tr><th>วาระ</th><th>เรื่อง</th><th>เห็นด้วย</th><th>ไม่เห็นด้วย</th><th>งดออกเสียง</th><th>บัตรเสีย</th>{hasRight && <><th>มีสิทธิ์ออกเสียง (หุ้น)</th><th>ไม่มีสิทธิ์ (หุ้น)</th></>}<th>มติ</th></tr></thead>
              <tbody>
                {sum.data.terms.map((t) => (
                  <tr key={t.id}>
                    <td>{t.term_id}</td>
                    <td>{t.name}<small>{VOTE_TYPE_LABEL[t.vote_type]}</small></td>
                    {t.vote_type === "info"
                      ? <td colSpan={4} style={{ textAlign: "center" }}>— รับทราบ ไม่มีการลงคะแนน —</td>
                      : <>
                        <td>{t.agree_pct.toFixed(2)}%<small>{fmt(t.total.agree)}</small></td>
                        <td>{t.disagree_pct.toFixed(2)}%<small>{fmt(t.total.disagree)}</small></td>
                        <td>{t.abstain_pct.toFixed(2)}%<small>{fmt(t.total.abstain)}</small></td>
                        <td>{t.spoiled_pct.toFixed(2)}%<small>{fmt(t.total.spoiled)}</small></td>
                      </>}
                    {hasRight && (t.vote_type === "info" || t.status === "pending" ? <><td>-</td><td>-</td></> : <><td>{fmt(t.eligible)}</td><td>{fmt(t.novote_shares ?? 0)}</td></>)}
                    <td className={t.result === "pass" ? styles.pass : t.result === "fail" ? styles.fail : ""}>{RESULT_LABEL[t.result]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.foot}><span>ผู้ถือหุ้นที่ไม่ลงคะแนนนับเป็น “เห็นด้วย” ตามเงื่อนไขของระบบ</span><span>พิมพ์เมื่อ {now}</span></p>
            <div className={styles.sign}><div>ประธานที่ประชุม</div><div>ผู้ตรวจนับคะแนน</div></div>
          </article>
        )}
      </State>
    </>
  );
}

export default function Page() {
  return <AdminFrame title="รายงานสรุปผล"><Suspense fallback={null}><Body /></Suspense></AdminFrame>;
}
