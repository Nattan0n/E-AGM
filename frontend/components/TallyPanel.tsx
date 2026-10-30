import { fmt } from "@/lib/api";
import type { Tally } from "@/lib/types";

export interface TallyData {
  eligible_holders?: number; eligible?: number; novote_holders?: number; novote_shares?: number;
  total: Tally; agree_pct: number; disagree_pct: number; abstain_pct: number; spoiled_pct: number;
}

/** Running count of one agenda, laid out like the old Eregist vote screen: who may vote, then shares and % per choice. */
export function TallyPanel({ t }: { t: TallyData }) {
  const cols = [
    { label: "เห็นด้วย", n: t.total.agree, p: t.agree_pct, cls: "g" },
    { label: "ไม่เห็นด้วย", n: t.total.disagree, p: t.disagree_pct, cls: "r" },
    { label: "งดออกเสียง", n: t.total.abstain, p: t.abstain_pct, cls: "y" },
    { label: "บัตรเสีย", n: t.total.spoiled, p: t.spoiled_pct, cls: "n" },
  ];
  return (
    <div className="tally">
      <div className="tally-top">
        <div><span>ผู้ถือหุ้นที่มีสิทธิ์ออกเสียง</span><b>{t.eligible_holders === undefined ? "-" : fmt(t.eligible_holders)} ราย</b></div>
        <div><span>จำนวนหุ้นที่มีสิทธิ์ออกเสียง</span><b>{t.eligible === undefined ? "-" : fmt(t.eligible)} หุ้น</b></div>
        {t.novote_shares !== undefined && <>
          <div><span>ผู้ถือหุ้นที่ไม่มีสิทธิ์ออกเสียง</span><b className="r">{fmt(t.novote_holders ?? 0)} ราย</b></div>
          <div><span>จำนวนหุ้นที่ไม่มีสิทธิ์ออกเสียง</span><b className="r">{fmt(t.novote_shares)} หุ้น</b></div>
        </>}
      </div>
      <div className="tally-grid">
        {cols.map((c) => (
          <div key={c.label} className={c.cls}><span>{c.label}</span><b>{fmt(c.n)}</b><small>หุ้น</small><em>{c.p.toFixed(2)}%</em></div>
        ))}
      </div>
    </div>
  );
}
