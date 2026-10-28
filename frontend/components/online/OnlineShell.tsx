"use client";
import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { AuthSplit } from "@/components/brand/AuthSplit";
import { HolderDesktopShell } from "./HolderDesktopShell";
import { useIsDesktop } from "@/lib/media";
import { fmt } from "@/lib/api";
import { Me, MeCtx, ME_REFRESH, useHolderApi, useMe } from "./hooks";
import s from "./online.module.css";

export interface ShellProps {
  title: string;
  step?: number;
  back?: string;
  children: ReactNode;
  /** Right side of the mobile app bar (e.g. a logout button). */
  right?: ReactNode;
  /** Subtitle under the mobile app bar title. */
  subtitle?: string;
  /** Desktop content width: login card, reading column, or wide column. */
  width?: "card" | "col" | "wide" | "full";
  /** Sticky bottom action bar (both layouts). */
  footer?: ReactNode;
  /** Load holder profile/meeting (needs a holder session) and show the user chip. */
  auth?: boolean;
  /** Poll interval for the profile when auth is on. */
  pollMs?: number;
  /** Desktop: brand panel on the left, form on the right (same look as the staff login). Mobile keeps the app layout. */
  split?: boolean;
  /** Mobile: skip the app bar and footer; the page renders its own hero (desktop is unaffected). */
  bare?: boolean;
  /** Desktop: logout handler for the user chip. */
  onLogout?: () => void;
}

const initial = (n?: string) => (n ? n.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").trim().charAt(0) || "ส" : "ส");

// Kept across page changes so the sidebar/top bar do not flash empty while the profile reloads.
let meCache: Me | null = null;

function MeLoader({ pollMs, children }: { pollMs: number; children: ReactNode }) {
  const r = useHolderApi<Me>("/api/online/me", pollMs);
  useEffect(() => { if (r.data) meCache = r.data; }, [r.data]);
  const { reload } = r;
  useEffect(() => { window.addEventListener(ME_REFRESH, reload); return () => window.removeEventListener(ME_REFRESH, reload); }, [reload]);
  const data = r.data ?? meCache;
  return <MeCtx.Provider value={{ data, error: r.error, loading: r.loading && !data }}>{children}</MeCtx.Provider>;
}

function Frame({ title, step, back, children, right, subtitle, width = "col", footer, onLogout, auth, split, bare }: ShellProps) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const me = useMe()?.data ?? null;
  const meetingName = me?.meeting.detail || "ประชุมสามัญผู้ถือหุ้น";

  if (desktop && split) return <AuthSplit>{children}</AuthSplit>;
  if (!desktop && bare) return <div className={s.root}>{children}</div>;
  if (desktop && auth) {
    return (
      <HolderDesktopShell title={title} me={me} onLogout={onLogout}>
        <div className={`${s.dcontent} ${s[`dc_${width}`]}`}>
          {children}
          {footer && <div className={`${s.bar} ${s.noprint}`}><div className={s.barin}>{footer}</div></div>}
        </div>
      </HolderDesktopShell>
    );
  }

  return (
    <div className={s.root}>
      {desktop ? (
        <header className={`${s.dtop} ${s.noprint}`}>
          <div className={s.dtopin}>
            <LogoMark size={34} />
            <b className={s.dbrand}>E-AGM</b>
            {auth && <span className={s.dpill}>ผู้ถือหุ้น</span>}
            <span className={s.dmeet}>{meetingName}</span>
            {me?.meeting.date && <span className={s.ddate}>{me.meeting.date}</span>}
            <span className={s.spacer} />
            {me && (
              <div className={s.chip}>
                <div className={s.chiptxt}><b>{me.name}</b><span>{fmt(me.shares)} หุ้น · Online</span></div>
                <span className={s.avatar}>{initial(me.name)}</span>
                {onLogout && <button type="button" className={s.dlogout} onClick={onLogout}>ออกจากระบบ</button>}
              </div>
            )}
          </div>
        </header>
      ) : (
        <header className={`${s.app} ${s.noprint}`}>
          <div className={s.appin}>
            {back && (
              <button type="button" className={s.back} onClick={() => router.push(back)} aria-label="ย้อนกลับ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              </button>
            )}
            <div className={s.apptitle}>
              <h1>{title}</h1>
              {(subtitle ?? (me ? `${me.name} · ${fmt(me.shares)} หุ้น` : undefined)) && <span>{subtitle ?? `${me?.name} · ${fmt(me?.shares ?? 0)} หุ้น`}</span>}
            </div>
            {step ? <span className={s.pill}>ขั้นที่ {step}/4</span> : null}
            {right}
          </div>
          {step ? <div className={s.progress} aria-hidden="true"><div style={{ width: `${step * 25}%` }} /></div> : null}
        </header>
      )}
      <main className={`${s.main} ${desktop ? s[`w_${width}`] : s.w_mobile}`}>{children}</main>
      {footer && (
        <div className={`${s.bar} ${s.noprint}`}>
          <div className={`${s.barin} ${desktop ? s[`w_${width}`] : s.w_mobile}`}>{footer}</div>
        </div>
      )}
    </div>
  );
}

export function OnlineShell(props: ShellProps) {
  return props.auth
    ? <MeLoader pollMs={props.pollMs ?? 0}><Frame {...props} /></MeLoader>
    : <Frame {...props} />;
}
