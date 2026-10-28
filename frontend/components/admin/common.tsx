"use client";
import { Icon } from "@/components/brand/Icon";
import { ReactNode, useCallback, useState } from "react";
import { Shell, ADMIN_NAV } from "@/components/Shell";
import { errMsg } from "@/lib/api";
import { useApi, useStaffGuard, useToast } from "@/lib/hooks";
import type { AgendaStatus, Meeting, TermResult, VoteType } from "@/lib/types";

export const VOTE_TYPE_LABEL: Record<VoteType, string> = {
  ordinary: "ปกติ (>½)", special: "พิเศษ (¾)", unanimous: "เอกฉันท์", info: "รับทราบ",
};
export const STATUS_LABEL: Record<AgendaStatus, string> = { pending: "รอเปิด", open: "เปิดโหวต", closed: "ปิดแล้ว" };
export const STATUS_BADGE: Record<AgendaStatus, string> = { pending: "badge", open: "badge badge-green", closed: "badge badge-blue" };
export const RESULT_LABEL: Record<TermResult["result"], string> = {
  pending: "รอลงคะแนน", in_progress: "กำลังลงคะแนน", pass: "ผ่าน", fail: "ไม่ผ่าน", info: "รับทราบ",
};
export const RESULT_BADGE: Record<TermResult["result"], string> = {
  pending: "badge", in_progress: "badge badge-amber", pass: "badge badge-green", fail: "badge badge-red", info: "badge badge-cyan",
};
export const COLORS = { agree: "#22c55e", disagree: "#ef4444", abstain: "#f59e0b", spoiled: "#94a3b8" } as const;

/** Admin-only page frame: guard + Shell. Children mount only once the session is known. */
export function AdminFrame({ title, children }: { title: string; children: ReactNode }) {
  const s = useStaffGuard(["admin"]);
  if (!s) return null;
  return <Shell session={s} nav={ADMIN_NAV} title={title}>{children}</Shell>;
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="adm-head">
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <p className="adm-sub">{sub}</p>}
      </div>
      {actions && <div className="adm-head-actions">{actions}</div>}
    </div>
  );
}

export function Live({ children = "อัปเดตสด" }: { children?: ReactNode }) {
  return <span className="adm-live"><i aria-hidden />{children}</span>;
}

/** Combined status/result chip for an agenda term. */
export function ResultChip({ t }: { t: Pick<TermResult, "status" | "result"> }) {
  if (t.status === "pending") return <span className="adm-chip">รอดำเนินการ</span>;
  if (t.status === "open") return <span className="adm-chip adm-chip-blue"><span className="ico-dot" aria-hidden />กำลังลงคะแนน</span>;
  const cls = { pass: "adm-chip-green", fail: "adm-chip-red", info: "adm-chip-cyan", pending: "", in_progress: "adm-chip-amber" }[t.result];
  return <span className={`adm-chip ${cls}`}>{t.result === "pass" ? <Icon name="check" size={12} className="ico-inl" /> : null}{RESULT_LABEL[t.result]}</span>;
}

const AV = ["#7c3aed", "#2563eb", "#0891b2", "#16a34a", "#d97706", "#db2777", "#4f46e5"];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const n = (name || "?").trim();
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 997;
  const c1 = AV[h % AV.length], c2 = AV[(h + 3) % AV.length];
  return <span className="adm-avatar" aria-hidden style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{n.charAt(0).toUpperCase()}</span>;
}

export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled} className={`adm-switch${on ? " on" : ""}`} onClick={onChange}><i /></button>;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <nav aria-label="แบ่งหน้า" className="adm-pager">
      <button className="adm-pbtn" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="ก่อนหน้า">‹</button>
      <span className="muted" style={{ fontSize: 13 }}>หน้า {page + 1} / {pages}</span>
      <button className="adm-pbtn" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="ถัดไป">›</button>
    </nav>
  );
}

export function ClosedBanner({ meeting }: { meeting: Meeting | null | undefined }) {
  if (!meeting?.closed_at) return null;
  return (
    <div className="adm-banner" role="alert">
      <Icon name="lock" size={14} className="ico-inl" />การประชุมปี {meeting.year} ปิดแล้ว - ข้อมูลเป็นแบบอ่านอย่างเดียว ไม่สามารถแก้ไขได้
    </div>
  );
}

/** Current meeting (for read-only banner / disabling writes). */
export function useMeeting() {
  const r = useApi<Meeting>("/api/meeting");
  return { meeting: r.data, closed: !!r.data?.closed_at, reload: r.reload };
}

export function useToastAction() {
  const { show, node } = useToast();
  const [busy, setBusy] = useState(false);
  /** Runs a mutation: busy flag, success/error toast. Returns true on success. */
  const run = useCallback(async (fn: () => Promise<unknown>, okMsg: string): Promise<boolean> => {
    setBusy(true);
    try { await fn(); show(okMsg); return true; }
    catch (e) { show(errMsg(e), true); return false; }
    finally { setBusy(false); }
  }, [show]);
  return { run, busy, show, node };
}

export function State({ loading, error, empty, emptyText = "ไม่มีข้อมูล", children }: { loading: boolean; error: string; empty?: boolean; emptyText?: string; children: ReactNode }) {
  if (loading) return <div className="skeleton-rows" role="status" aria-label="กำลังโหลด"><div className="skeleton" style={{ height: 84 }} /><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 120 }} /></div>;
  if (error) return <p className="error-text" role="alert">{error}</p>;
  if (empty) return <div className="adm-empty">{emptyText}</div>;
  return <>{children}</>;
}

export function ResultBar({ t }: { t: TermResult }) {
  const segs = [
    ["agree", t.agree_pct], ["disagree", t.disagree_pct], ["abstain", t.abstain_pct], ["spoiled", t.spoiled_pct],
  ] as const;
  return (
    <div className="bar" role="img" aria-label={`เห็นด้วย ${t.agree_pct.toFixed(1)}% ไม่เห็นด้วย ${t.disagree_pct.toFixed(1)}% งดออกเสียง ${t.abstain_pct.toFixed(1)}% บัตรเสีย ${t.spoiled_pct.toFixed(1)}%`}>
      {segs.map(([k, p]) => <span key={k} style={{ width: `${p}%`, background: COLORS[k] }} />)}
    </div>
  );
}

export const grid = (min: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12 });

/** "ประชุมสามัญ ประจำปี 2568" already contains the year; only append when missing. */
export const meetingTitle = (m: Pick<Meeting, "detail" | "year">) => {
  const d = m.detail || "การประชุมผู้ถือหุ้น";
  return d.includes(m.year) ? d : `${d} ${m.year}`;
};
