"use client";
import type { ReactNode } from "react";
import { Icon } from "@/components/brand/Icon";
import { useState } from "react";
import { fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/media";
import type { Summary, Tally, TermResult } from "@/lib/types";
import { StaffPage, styles } from "@/components/staff/common";

export default function SummaryPage() {
  return <StaffPage title="สรุปผลการประชุม" sub="อัปเดตอัตโนมัติทุก 10 วินาที">{() => <SummaryView />}</StaffPage>;
}

const RESULT: Record<TermResult["result"], { label: ReactNode; cls: string }> = {
  pass: { label: <><Icon name="check" size={13} className="ico-inl" />ผ่าน</>, cls: styles.tGreen },
  fail: { label: "ไม่ผ่าน", cls: styles.tRed },
  in_progress: { label: "กำลังลงคะแนน", cls: styles.tAmber },
  pending: { label: "รอเปิดโหวต", cls: "" },
  info: { label: "เพื่อทราบ", cls: styles.tBlue },
};
const KEYS: { k: keyof Tally; label: string; cls: string; bar: string }[] = [
  { k: "agree", label: "เห็นด้วย", cls: styles.tcGreen, bar: "#22c55e" },
  { k: "disagree", label: "ไม่เห็นด้วย", cls: styles.tcRed, bar: "#ef4444" },
  { k: "abstain", label: "งดออกเสียง", cls: styles.tcAmber, bar: "#f59e0b" },
  { k: "spoiled", label: "บัตรเสีย", cls: styles.tcGrey, bar: "#94a3b8" },
];

const sum = (t: Tally) => t.agree + t.disagree + t.abstain + t.spoiled;

function SummaryView() {
  const { data, loading, error } = useApi<Summary>("/api/summary", "staff", 10000);
  const desktop = useIsDesktop();
  const [both, setBoth] = useState(false);
  if (loading) return <p className={styles.empty}>กำลังโหลด...</p>;
  if (error && !data) return <p className={styles.errText}>{error}</p>;
  if (!data) return null;
  const { stats, terms } = data;
  const pct = Math.min(100, stats.quorum_pct);
  const attended = stats.onsite_shares + stats.online_shares;
  const share = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(1)}%` : "0.0%");
  const p = (t: Tally, k: keyof Tally) => { const tot = sum(t); return tot ? ((t[k] / tot) * 100).toFixed(1) : "0.0"; };
  const stackBar = (t: Tally) => (
    <div className={styles.stackBar} aria-hidden>
      {KEYS.map((k) => <span key={k.k} style={{ width: `${sum(t) ? (t[k.k] / sum(t)) * 100 : 0}%`, background: k.bar }} />)}
    </div>
  );
  const sub = (t: TermResult) => (!both || t.vote_type === "info" ? null : `Onsite ${fmt(sum(t.onsite))} · Online ${fmt(sum(t.online))} · รวม ${fmt(sum(t.total))}`);

  return (
    <>
      <div className={styles.kpiGrid + (desktop ? "" : "")} style={desktop ? { gridTemplateColumns: "repeat(4, 1fr)", gap: 16 } : undefined}>
        <div className={styles.kpiTop}><div className={`${styles.kv} ${styles.cBlue2}`}>{fmt(stats.holders)}</div><div className={styles.kl}>ผู้ถือหุ้นทั้งหมด</div><div className={styles.kn} style={{ color: "var(--ink-muted)" }}>{fmt(stats.total_shares)} หุ้น</div></div>
        <div className={styles.kpiTop} style={{ borderTopColor: "#22c55e" }}><div className={`${styles.kv} ${styles.tcGreen}`}>{fmt(stats.onsite_count)}</div><div className={styles.kl}>ลงทะเบียนแล้ว (Onsite)</div><div className={`${styles.kn} ${styles.tcGreen}`}>{share(stats.onsite_count, stats.holders)} ของผู้ถือหุ้น</div></div>
        <div className={styles.kpiTop} style={{ borderTopColor: "#06b6d4" }}><div className={`${styles.kv}`} style={{ color: "#0891b2" }}>{fmt(stats.online_count)}</div><div className={styles.kl}>ลงทะเบียน Online</div><div className={styles.kn} style={{ color: "#0891b2" }}>{share(stats.online_count, stats.holders)} ของผู้ถือหุ้น</div></div>
        <div className={styles.kpiTop} style={{ borderTopColor: "#f59e0b" }}><div className={`${styles.kv} ${styles.tcAmber}`}>{fmt(stats.late_count)}</div><div className={styles.kl}>ผู้มาสาย</div><div className={styles.kn} style={{ color: "var(--ink-muted)" }}>{fmt(stats.late_shares)} หุ้น</div></div>
      </div>

      <div className={`${styles.card} ${styles.qHero}`}>
        <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>องค์ประชุม (Quorum)</div>
            <div className={styles.muted}>เกณฑ์ขั้นต่ำ {stats.quorum_required_pct}% ของจำนวนหุ้นทั้งหมด</div>
          </div>
          <div className={styles.qNum}>{stats.quorum_pct.toFixed(1)}%</div>
        </div>
        <div className={styles.qBar} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="องค์ประชุม"><span style={{ width: `${pct}%` }} /></div>
        <div className={styles.qFacts}>
          <div>หุ้นที่เข้าร่วม<b>{fmt(attended)} หุ้น</b><span className={stats.quorum_reached ? styles.tcGreen : styles.tcAmber}>{stats.quorum_reached ? <><Icon name="check" size={13} className="ico-inl" />ผ่านเกณฑ์องค์ประชุม</> : "ยังไม่ครบองค์ประชุม"}</span></div>
          <div>หุ้นทั้งหมด<b>{fmt(stats.total_shares)} หุ้น</b></div>
          <div>Onsite<b>{fmt(stats.onsite_shares)} หุ้น ({share(stats.onsite_shares, stats.total_shares)})</b></div>
          <div>Online<b>{fmt(stats.online_shares)} หุ้น ({share(stats.online_shares, stats.total_shares)})</b></div>
        </div>
      </div>

      <div className={styles.seg} role="tablist" style={{ maxWidth: 420 }}>
        {[false, true].map((b) => (
          <button key={String(b)} role="tab" aria-selected={both === b} className={`${styles.segBtn} ${both === b ? styles.segOn : ""}`} onClick={() => setBoth(b)}>
            {b ? "Onsite + Online" : "Onsite เท่านั้น"}
          </button>
        ))}
      </div>

      {terms.length === 0 && <p className={styles.empty}>ยังไม่มีวาระ</p>}

      {terms.length > 0 && desktop && (
        <div className={styles.tableCard}>
          <div className={styles.tableHead} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <b style={{ fontSize: 15 }}>ผลการลงคะแนนแต่ละวาระ</b>
            <span className={styles.muted}>{both ? "แสดงผลผู้ถือหุ้น Onsite + Online" : "แสดงผลเฉพาะผู้ถือหุ้น Onsite"} · ร้อยละภายในกลุ่มที่เลือก · ผู้ที่ไม่ลงคะแนนนับเป็นเห็นด้วย</span>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.tbl}>
              <thead><tr><th>#</th><th>วาระการประชุม</th>{KEYS.map((k) => <th key={k.k} className={styles.num}>{k.label}</th>)}<th style={{ minWidth: 120 }}>สัดส่วน</th><th>สถานะ</th></tr></thead>
              <tbody>
                {terms.map((t) => {
                  const info = t.vote_type === "info";
                  const r = RESULT[t.result];
                  const rowT = both ? t.total : t.onsite;
                  return (
                    <tr key={t.term_id}>
                      <td>{t.term_id}</td>
                      <td style={{ minWidth: 220 }}><b>{t.name}</b>{sub(t) && <div className={styles.meta}>{sub(t)}</div>}</td>
                      {KEYS.map((k) => (
                        <td key={k.k} className={`${styles.num} ${k.cls}`} style={{ fontWeight: 600 }}>
                          {info ? "-" : <>{fmt(rowT[k.k])}<div className={styles.meta} style={{ fontWeight: 400 }}>{p(rowT, k.k)}%</div></>}
                        </td>
                      ))}
                      <td>{info ? null : stackBar(rowT)}</td>
                      <td><span className={`${styles.tag} ${r.cls}`}>{r.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {terms.length > 0 && !desktop && (
        <>
          <div style={{ fontWeight: 600, fontSize: 14 }}>ผลการลงคะแนนรายวาระ ({both ? "Onsite + Online" : "Onsite"})</div>
          {terms.map((t) => {
            const info = t.vote_type === "info";
            const r = RESULT[t.result];
            const rowT = both ? t.total : t.onsite;
            return (
              <div key={t.term_id} className={styles.tCard}>
                <div className={styles.tHead}>
                  <b><span style={{ color: "var(--primary)" }}>{t.term_id}.</span> {t.name}</b>
                  <span className={`${styles.tag} ${r.cls}`}>{r.label}</span>
                </div>
                {!info && (
                  <>
                    <div className={styles.cnt4}>
                      {KEYS.map((k) => (
                        <div key={k.k}><small>{k.label}</small><b className={k.cls}>{fmt(rowT[k.k])}</b><em>{p(rowT, k.k)}%</em></div>
                      ))}
                    </div>
                    {stackBar(rowT)}
                    {sub(t) && <div className={styles.meta}>{sub(t)}</div>}
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
