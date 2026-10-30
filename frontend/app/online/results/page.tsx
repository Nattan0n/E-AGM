"use client";
import { Icon } from "@/components/brand/Icon";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/api";
import { useIsDesktop } from "@/lib/media";
import type { HolderResultRow, HolderResults, Tally } from "@/lib/types";
import { TallyPanel } from "@/components/TallyPanel";
import { OnlineShell } from "@/components/online/OnlineShell";
import { holderLogout, useHolderApi } from "@/components/online/hooks";
import s from "@/components/online/online.module.css";

const KEYS = [
  { k: "agree", p: "agree_pct", label: "เห็นด้วย", color: "#16a34a", bar: "#22c55e" },
  { k: "disagree", p: "disagree_pct", label: "ไม่เห็นด้วย", color: "#dc2626", bar: "#ef4444" },
  { k: "abstain", p: "abstain_pct", label: "งดออกเสียง", color: "#d97706", bar: "#f59e0b" },
  { k: "spoiled", p: "spoiled_pct", label: "บัตรเสีย", color: "#64748b", bar: "#94a3b8" },
] as const satisfies readonly { k: keyof Tally; p: keyof HolderResultRow; label: string; color: string; bar: string }[];

const sum = (t: Tally) => t.agree + t.disagree + t.abstain + t.spoiled;

function ResultCard({ r }: { r: HolderResultRow }) {
  const tot = sum(r.total);
  return (
    <section className={`${s.cardc} ${s.resCard}`}>
      <div className={s.resHead}><span className={s.num}>{r.term_id}</span><b>{r.name}</b></div>
      {r.vote_type === "info" ? <p className={s.resInfo}>วาระเพื่อทราบ — ไม่มีการลงคะแนน</p> : (
        <>
          <div className={s.resBar} aria-hidden>
            {KEYS.map((x) => <span key={x.k} style={{ width: `${tot ? (r.total[x.k] / tot) * 100 : 0}%`, background: x.bar }} />)}
          </div>
          <div className={s.resGrid}>
            {KEYS.map((x) => (
              <div key={x.k}><small>{x.label}</small><b style={{ color: x.color }}>{fmt(r.total[x.k])}</b><em>{r[x.p].toFixed(2)}%</em></div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function OnlineResults() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { data, error, loading } = useHolderApi<HolderResults>("/api/online/results", 10000);
  const logout = () => { void holderLogout((p) => router.replace(p)); };

  return (
    <OnlineShell title="ผลมติรายวาระ" subtitle="ยอดคะแนนรวมของวาระที่เปิดและปิดลงคะแนนแล้ว" auth back="/online/waiting" width="col" onLogout={logout}>
      {desktop
        ? <div className="page-head"><div><h1>ผลมติรายวาระ</h1><p className="muted">แสดงยอดรวมของวาระที่เปิดและปิดลงคะแนนแล้ว · ไม่แสดงว่าผู้ถือหุ้นรายใดลงคะแนนอย่างไร</p></div></div>
        : <p className="muted" style={{ fontSize: 13 }}>ไม่แสดงว่าผู้ถือหุ้นรายใดลงคะแนนอย่างไร</p>}
      {loading && !data && <div className="muted">กำลังโหลด...</div>}
      {error && !data && <div className="error-text" role="alert">{error}</div>}
      {data && !data.published && (
        <section className={`${s.cardc} ${s.statebox} ${s.lobby}`}>
          <span className={s.lobbyIcon} aria-hidden="true"><Icon name="clock" size={34} /></span>
          <h3>ยังไม่เผยแพร่ผลมติ</h3>
          <p>ผลมติรายวาระจะแสดงที่หน้านี้เมื่อผู้ดูแลระบบเผยแพร่ หลังประธานที่ประชุมประกาศผลแล้ว</p>
        </section>
      )}
      {data?.published && data.terms.length === 0 && <div className="muted">ยังไม่มีวาระที่ปิดลงคะแนน</div>}
      {data?.published && data.terms.map((r) => <ResultCard key={r.term_id} r={r} />)}
    </OnlineShell>
  );
}
