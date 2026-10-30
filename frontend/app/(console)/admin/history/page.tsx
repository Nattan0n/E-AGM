"use client";
import { Icon } from "@/components/brand/Icon";
import { useState } from "react";
import { download, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Meeting, Summary } from "@/lib/types";
import { useIsDesktop } from "@/lib/media";
import { meetingTitle, AdminFrame, PageHead, ResultBar, RESULT_BADGE, RESULT_LABEL, State, useToastAction, VOTE_TYPE_LABEL } from "@/components/admin/common";

function Body() {
  const list = useApi<Meeting[]>("/api/admin/meetings");
  const desktop = useIsDesktop();
  const [year, setYear] = useState("");
  const y = year || list.data?.[0]?.year || "";
  const sum = useApi<Summary>(y ? `/api/admin/meetings/${encodeURIComponent(y)}/summary` : null);
  const { show, node } = useToastAction();
  const [busy, setBusy] = useState(false);
  const m = sum.data?.meeting;
  const st = sum.data?.stats;

  const exp = async () => {
    setBusy(true);
    try { await download(`/api/admin/export/summary.csv?year=${encodeURIComponent(y)}`, `summary_${y}.csv`); show("ดาวน์โหลดแล้ว"); }
    catch (e) { show(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ", true); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="ประวัติการประชุม" sub="ดูย้อนหลัง - ปีที่ปิดแล้วเป็นแบบอ่านอย่างเดียว"
        actions={<span className="adm-chip adm-chip-lock"><Icon name="lock" size={12} className="ico-inl" />Read-only</span>} />
      <State loading={list.loading} error={list.error} empty={list.data?.length === 0} emptyText="ยังไม่มีประวัติการประชุม">
        <div className="adm-hist">
          {desktop ? (
            <div className="adm-card adm-hist-list">
              <div className="adm-card-h">การประชุมทั้งหมด</div>
              <ul>
                {list.data?.map((x) => (
                  <li key={x.year}>
                    <button className={x.year === y ? "on" : ""} aria-pressed={x.year === y} onClick={() => setYear(x.year)}>
                      <span><b>{meetingTitle(x)}</b><small>{x.date}</small></span>
                      <span className={`adm-chip ${x.closed_at ? "adm-chip-blue" : "adm-chip-green"}`}>{x.closed_at ? "ปิดแล้ว" : "ปัจจุบัน"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="adm-card adm-card-b">
              <label className="label" htmlFor="hy">เลือกปีการประชุม</label>
              <select id="hy" className="input" value={y} onChange={(e) => setYear(e.target.value)}>
                {list.data?.map((x) => <option key={x.year} value={x.year}>{x.year}{x.closed_at ? " (ปิดแล้ว)" : " (ปัจจุบัน)"}</option>)}
              </select>
            </div>
          )}

          <div className="adm-hist-detail">
            <State loading={sum.loading && !sum.data} error={sum.data ? "" : sum.error}>
              {m && st && sum.data && (
                <>
                  <div className="adm-card adm-hist-head">
                    <div className="adm-hist-title">
                      <div><h2>{meetingTitle(m)}</h2><p className="muted"><Icon name="calendar" size={13} className="ico-inl" />{m.date}</p></div>
                      <div className="adm-head-actions">
                        <span className={m.closed_at ? "adm-chip adm-chip-lock" : "adm-chip adm-chip-green"}>{m.closed_at ? <><Icon name="lock" size={12} className="ico-inl" />ปิดแล้ว (อ่านอย่างเดียว)</> : "กำลังดำเนินการ"}</span>
                        <button className="btn btn-sm" disabled={busy || !y} onClick={exp}>{busy ? "กำลังดาวน์โหลด..." : <><Icon name="download" size={15} className="ico-inl" />ส่งออก CSV</>}</button>
                      </div>
                    </div>
                    <div className="adm-strip adm-strip-flat">
                      <div><b className="c-blue">{fmt(st.onsite_count + st.online_count)}</b><span>ผู้เข้าร่วม (ราย)</span></div>
                      <div><b className="c-purple">{st.quorum_pct.toFixed(1)}%</b><span>องค์ประชุม (เกณฑ์ {st.quorum_required_pct}%)</span></div>
                      <div><b className="c-green">{sum.data.terms.length}</b><span>วาระทั้งหมด</span></div>
                      <div><b className="c-cyan">{fmt(st.online_count)}</b><span>Online</span></div>
                    </div>
                  </div>
                  <div className="adm-card adm-tablecard">
                    <div className="adm-card-h">ผลการลงคะแนนแยกรายวาระ <span className="adm-chip">{sum.data.terms.length} วาระ</span></div>
                    {sum.data.terms.length === 0 ? <div className="adm-card-b muted">ไม่มีวาระในปีนี้</div> : desktop ? (
                      <table className="adm-table">
                        <thead><tr><th>วาระ</th><th>เรื่อง</th><th>เห็นด้วย</th><th>ไม่เห็นด้วย</th><th>งดออกเสียง</th><th>บัตรเสีย</th><th>มติ</th></tr></thead>
                        <tbody>
                          {sum.data.terms.map((t) => (
                            <tr key={t.id}>
                              <td><b>{t.term_id}</b></td>
                              <td><b>{t.name}</b><div className="muted" style={{ fontSize: 11 }}>{VOTE_TYPE_LABEL[t.vote_type]}</div></td>
                              <td><b className="c-green">{t.agree_pct.toFixed(1)}%</b><div className="muted" style={{ fontSize: 11 }}>{fmt(t.total.agree)}</div></td>
                              <td><b className="c-red">{t.disagree_pct.toFixed(1)}%</b><div className="muted" style={{ fontSize: 11 }}>{fmt(t.total.disagree)}</div></td>
                              <td>{t.abstain_pct.toFixed(1)}%<div className="muted" style={{ fontSize: 11 }}>{fmt(t.total.abstain)}</div></td>
                              <td>{t.spoiled_pct.toFixed(1)}%<div className="muted" style={{ fontSize: 11 }}>{fmt(t.total.spoiled)}</div></td>
                              <td><span className={RESULT_BADGE[t.result]}>{RESULT_LABEL[t.result]}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <ul className="adm-list flat">
                        {sum.data.terms.map((t) => (
                          <li key={t.id} className="adm-hrow">
                            <div className="adm-hrow-h"><span className="muted">วาระที่ {t.term_id} · {VOTE_TYPE_LABEL[t.vote_type]}</span><span className={RESULT_BADGE[t.result]}>{RESULT_LABEL[t.result]}</span></div>
                            <b>{t.name}</b>
                            <ResultBar t={t} />
                            <div className="adm-hrow-n"><span className="c-green">เห็นด้วย {t.agree_pct.toFixed(1)}%</span><span className="c-red">ไม่ {t.disagree_pct.toFixed(1)}%</span><span>งด {t.abstain_pct.toFixed(1)}%</span><span>เสีย {t.spoiled_pct.toFixed(1)}%</span></div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </State>
          </div>
        </div>
      </State>
      {node}
    </>
  );
}

export default function Page() { return <AdminFrame title="ประวัติ"><Body /></AdminFrame>; }
