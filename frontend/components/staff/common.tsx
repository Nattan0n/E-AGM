"use client";
import { Icon } from "@/components/brand/Icon";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg, fmt, StaffSession } from "@/lib/api";
import { MOCK } from "@/lib/mock";
import { useApi, useStaffGuard } from "@/lib/hooks";
import { usePageTitle } from "@/components/Shell";
import type { HolderItem, Meeting } from "@/lib/types";
import styles from "./staff.module.css";

export { styles };

export interface Ctx {
  session: StaffSession;
  /** false for viewer role or when the meeting is closed */
  canWrite: boolean;
  closed: boolean;
  toast: (msg: string, err?: boolean) => void;
}

/** Guard + page title + meeting-closed banner + toast host for every staff page. */
export function StaffPage({ title, sub, children }: { title: string; sub?: string; children: (c: Ctx) => ReactNode }) {
  const session = useStaffGuard();
  usePageTitle(title);
  const { data: meeting } = useApi<Meeting>(session ? "/api/meeting" : null);
  const [t, setT] = useState<{ msg: string; err: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string, err = false) => {
    setT({ msg, err });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), err ? 7000 : 3500);
  }, []);
  if (!session) return null;
  const closed = !!meeting?.closed_at;
  const canWrite = session.role !== "viewer" && !closed;
  return (
    <>
      <div className={styles.stack}>
        <div className={styles.pageHead}>
          <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
        </div>
        {closed && <div className={styles.banner} role="alert">การประชุมปิดแล้ว — ระบบอยู่ในโหมดอ่านอย่างเดียว</div>}
        {session.role === "viewer" && <div className={styles.banner}>บัญชี Viewer — ดูข้อมูลได้อย่างเดียว</div>}
        {children({ session, canWrite, closed, toast })}
      </div>
      {t && <div className={`${styles.toast} ${t.err ? styles.toastErr : ""}`} role={t.err ? "alert" : "status"}>{t.msg}</div>}
    </>
  );
}

/** Summary bar on phones / KPI cards on desktop. */
export function Metrics({ items, cols }: { items: { v: ReactNode; l: string; c?: "cBlue" | "cGreen" | "cCyan" | "cAmber"; n?: ReactNode }[]; cols?: "two" | "three" }) {
  return (
    <div className={`${styles.metrics} ${cols ? styles[cols] : ""} lava-m`}>
      {items.map((m, i) => (
        <div key={i} className={styles.metric}>
          <div className={`${styles.mv} ${m.c ? styles[m.c] : ""}`}>{m.v}</div>
          <div className={styles.ml}>{m.l}</div>
          {m.n && <div className={styles.mn}>{m.n}</div>}
        </div>
      ))}
    </div>
  );
}

export function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}

export function StatusBadge({ status }: { status: HolderItem["status"] }) {
  if (status === "onsite") return <span className={`${styles.tag} ${styles.tGreen}`}>Onsite <Icon name="check" size={11} className="ico-inl" /></span>;
  if (status === "online") return <span className={`${styles.tag} ${styles.tCyan}`}>ลงทะเบียน Online <Icon name="check" size={11} className="ico-inl" /></span>;
  return <span className={styles.tag}>ยังไม่ลงทะเบียน</span>;
}

export const initials = (n: string) => {
  const s = n.trim().replace(/^(นาย|นางสาว|นาง|บริษัท|บจก\.?|Mr\.?|Mrs\.?|Ms\.?)\s*/, "");
  return ([...s].slice(0, 2).join("") || "?").toUpperCase();
};

export function Avatar({ name, size }: { name: string; size?: "sm" | "lg" }) {
  return <span className={`${styles.avatar} ${size ? styles[size] : ""}`} aria-hidden>{initials(name)}</span>;
}

/** Debounced holder search (min 2 chars, 300ms). Calls onPick when a result is chosen. */
export function HolderPicker({ onPick, label = "ค้นหาผู้ถือหุ้น", placeholder = "เลขทะเบียน / ชื่อ / เลขบัตร", filter, actionLabel, disabled }: {
  onPick: (h: HolderItem) => void; label?: string; placeholder?: string; filter?: (h: HolderItem) => boolean; actionLabel?: string; disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<HolderItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const term = q.trim();
  useEffect(() => {
    const id = ++seq.current;
    if ([...term].length < 2 && !MOCK) return; // demo mode lists sample holders without typing
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api<HolderItem[]>(`/api/holders/search?q=${encodeURIComponent(term)}`);
        if (id === seq.current) { setRows(r); setErr(""); }
      } catch (e) { if (id === seq.current) { setRows([]); setErr(errMsg(e)); } }
      finally { if (id === seq.current) setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [term]);
  const shown = filter ? rows.filter(filter) : rows;
  const active = [...term].length >= 2 || MOCK;
  return (
    <div>
      <label className={styles.lbl} htmlFor="hp-q">{label}</label>
      <div className={styles.sbox}>
        <SearchIcon />
        <input id="hp-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" disabled={disabled}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || disabled) return;
            const exact = shown.find((h) => h.account_id === term || h.masked_id === term);
            const pick = exact ?? (shown.length === 1 ? shown[0] : null);
            if (pick) { e.preventDefault(); onPick(pick); setQ(""); setRows([]); }
          }} />
      </div>
      {active && (
        <div style={{ marginTop: 10 }} aria-live="polite">
          {MOCK && [...term].length < 2 && <p className={styles.muted}>รายชื่อตัวอย่าง (โหมดทดลอง) — เลือกได้เลย หรือพิมพ์ค้นหา</p>}
          {busy && <p className={styles.muted}>กำลังค้นหา...</p>}
          {err && <p className={styles.errText}>{err}</p>}
          {!busy && !err && shown.length === 0 && <p className={styles.muted}>ไม่พบข้อมูล</p>}
          {shown.length > 0 && (
            <div className={styles.list}>
              {shown.map((h) => (
                <button key={h.account_id} type="button" className={styles.item} disabled={disabled} onClick={() => { onPick(h); setQ(""); setRows([]); }}>
                  <Avatar name={h.name} size="sm" />
                  <span className={styles.grow}>
                    <div className={styles.name}>{h.name}</div>
                    <div className={styles.meta}>{h.account_id} · {h.masked_id}</div>
                  </span>
                  <span className={styles.right}>
                    <span className={styles.shares}>{fmt(h.shares)} หุ้น</span>
                    {actionLabel ? <span className={`${styles.tag} ${styles.tBlue}`}>{actionLabel}</span> : <StatusBadge status={h.status} />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HolderCard({ h, children }: { h: HolderItem; children?: ReactNode }) {
  return (
    <div className={styles.pick}>
      <Avatar name={h.name} size="lg" />
      <div className={styles.grow}>
        <div className={styles.name}>{h.name}</div>
        <div className={styles.meta}>{h.account_id} · {h.masked_id}</div>
        <div className={styles.shares}>{fmt(h.shares)} หุ้น</div>
        <div className={styles.row} style={{ marginTop: 4, gap: 6 }}>
          <StatusBadge status={h.status} />
          {h.reg_type === "proxy" && <span className={`${styles.tag} ${styles.tAmber}`}>มอบฉันทะ</span>}
          {h.late && <span className={`${styles.tag} ${styles.tAmber}`}>มาสาย</span>}
        </div>
      </div>
      {children && <div style={{ alignSelf: "flex-start" }}>{children}</div>}
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on desktop. */
export function StModal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(box.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])") ?? []);
    (focusables().pop() ?? box.current)?.focus(); // last button = the primary action
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); prev?.focus?.(); };
  }, []);
  return (
    <div className={styles.back2} onClick={onClose}>
      <div ref={box} tabIndex={-1} className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grab} />
        <h3>{title}</h3>
        <div className={styles.sheetBody}>{children}</div>
        <div className={styles.sheetActions}>{actions}</div>
      </div>
    </div>
  );
}

/** Loads one holder by exact account id (no search cut-off). */
export async function fetchHolder(acc: string): Promise<HolderItem | null> {
  const r = await api<HolderItem[]>(`/api/holders/${encodeURIComponent(acc)}`);
  return r[0] ?? null;
}
