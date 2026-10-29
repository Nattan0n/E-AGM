"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, ReactNode, useEffect, useState } from "react";
import { MobileDock, DockSlot } from "./MobileDock";
import { clearSession, StaffSession } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSidebarCollapsed } from "@/lib/sidebar";
import { Icon, IconName } from "@/components/brand/Icon";
import { LogoMark } from "@/components/brand/Logo";
import type { Meeting } from "@/lib/types";
import styles from "./Shell.module.css";

export interface NavItem { href: string; label: string; icon: IconName; section?: string }

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "ค้นหา", icon: "search" },
  { href: "/staff/register", label: "ลงทะเบียน", icon: "register" },
  { href: "/staff/ballots", label: "พิมพ์บัตร", icon: "print" },
  { href: "/staff/vote", label: "ลงคะแนน", icon: "vote" },
  { href: "/staff/late", label: "มาสาย", icon: "clock" },
  { href: "/staff/novote", label: "ไม่มีสิทธิ์", icon: "ban" },
  { href: "/staff/summary", label: "สรุปผล", icon: "chart" },
];
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/agenda", label: "วาระ", icon: "list" },
  { href: "/admin/vote-control", label: "ควบคุมโหวต", icon: "sliders" },
  { href: "/admin/online-reg", label: "ออนไลน์", icon: "phone" },
  { href: "/admin/users", label: "ผู้ใช้", icon: "users" },
  { href: "/admin/audit", label: "Audit", icon: "shield" },
  { href: "/admin/export", label: "รายงาน", icon: "upload" },
  { href: "/admin/history", label: "ประวัติ", icon: "history" },
  { href: "/admin/settings", label: "ตั้งค่า", icon: "settings" },
];

// Kept across page changes (each page re-mounts the Shell) so the meeting name does not flash back to "E-AGM".
let meetingCache: Meeting | null = null;

const ROLE_LABEL = { admin: "Administrator", staff: "เจ้าหน้าที่ทะเบียน", viewer: "ผู้ชมผลการประชุม" } as const;

/** Positions (px from the centre button, y = upwards) for n circular menu items fanned out in one or two arcs. */
function fanLayout(n: number): { x: number; y: number }[] {
  const ring = (count: number, r: number, from: number, to: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = ((count === 1 ? 90 : from + ((to - from) * i) / (count - 1)) * Math.PI) / 180;
      return { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) };
    });
  if (n <= 6) return ring(n, 104, 30, 150);
  const inner = Math.min(5, Math.ceil(n / 2));
  return [...ring(inner, 96, 28, 152), ...ring(n - inner, 168, 24, 156)];
}

/**
 * Two layouts from one component (switched by CSS at 1024px, see lib/media.ts):
 *  - Web:    navy sidebar (brand, nav, user + logout) and a top bar with role badge + meeting name
 *  - Mobile: blue app bar with page title, bottom tab bar
 */
export function Shell({ session, nav, title, children }: { session: StaffSession; nav: NavItem[]; title: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: fetched } = useApi<Meeting>("/api/meeting");
  useEffect(() => { if (fetched) meetingCache = fetched; }, [fetched]);
  const meeting = fetched ?? meetingCache;
  // Admin can do everything staff can: show the on-site (staff) menu under the admin one.
  const items: NavItem[] = session.role === "admin" ? [...ADMIN_NAV, ...STAFF_NAV.map((n, i) => (i === 0 ? { ...n, section: "งานหน้างาน" } : n))] : nav;
  const [fanOpen, setFanOpen] = useState(false);
  const [fanMounted, setFanMounted] = useState(false); // stays mounted briefly after closing so the collapse animation can play
  useEffect(() => {
    if (fanOpen) { setFanMounted(true); return; }
    const t = setTimeout(() => setFanMounted(false), 320);
    return () => clearTimeout(t);
  }, [fanOpen]);
  // Next keeps previous pages mounted (hidden) with their state: close the menu on route change and whenever this page is hidden.
  useEffect(() => { setFanOpen(false); return () => setFanOpen(false); }, [path]);
  useEffect(() => {
    if (!fanOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFanOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fanOpen]);
  useEffect(() => {
    if (!fanOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fanOpen]);
  const pinHrefs = session.role === "admin" ? ["/admin", "/admin/vote-control", "/staff", "/staff/vote"] : ["/staff", "/staff/register", "/staff/vote", "/staff/summary"];
  const pinned = pinHrefs.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i);
  const menu = items.filter((i) => !pinHrefs.includes(i.href));
  const inMenu = menu.some((m) => (m.href === "/staff" || m.href === "/admin" ? path === m.href : path.startsWith(m.href)));
  const fan = fanLayout(menu.length);
  const MENU_KEY = "__menu";
  const dockSlots: DockSlot[] = [
    ...pinned.slice(0, 2).map((n) => ({ key: n.href, label: n.label, icon: n.icon, href: n.href })),
    { key: MENU_KEY, label: "เมนู", icon: "menu" as const },
    ...pinned.slice(2).map((n) => ({ key: n.href, label: n.label, icon: n.icon, href: n.href })),
  ];
  const pinnedActive = dockSlots.findIndex((d) => d.href && (d.href === "/staff" || d.href === "/admin" ? path === d.href : path.startsWith(d.href)));
  const dockActive = fanOpen ? 2 : pinnedActive >= 0 ? pinnedActive : inMenu ? 2 : -1;
  const active = (h: string) => (h === "/staff" || h === "/admin" ? path === h : path.startsWith(h));
  const logout = () => { clearSession("staff"); router.replace("/"); };
  const display = session.name || session.username;
  const initial = display.trim().charAt(0).toUpperCase();
  const { collapsed, toggle: toggleSidebar, animate, settled } = useSidebarCollapsed();
  const roleBadge = session.role === "admin" ? "Admin" : session.role === "viewer" ? "Viewer" : "Staff";

  return (
    <div className={`${styles.root} ${settled ? styles.settled : ""}`} data-collapsed={collapsed} data-anim={animate}>
      <aside className={styles.side}>
        <div className={styles.brand}>
          <LogoMark size={34} />
          <b className={styles.lbl}>E-AGM</b>
        </div>
        <nav aria-label="เมนูหลัก" className={styles.nav}>
          {items.map((n) => (
            <Fragment key={n.href}>
              {n.section && <div className={styles.navSec}><span className={styles.lbl}>{n.section}</span></div>}
              <Link href={n.href} className={active(n.href) ? styles.on : ""} title={n.label}>
                <Icon name={n.icon} size={19} /><span className={styles.lbl}>{n.label}</span>
              </Link>
            </Fragment>
          ))}
        </nav>
        <div className={styles.me}>
          <span className={styles.avatar}>{initial}</span>
          <div className={styles.meText}>
            <b>{display}</b>
            <small>{ROLE_LABEL[session.role]}</small>
          </div>
          <button className={styles.out} onClick={logout} aria-label="ออกจากระบบ" title="ออกจากระบบ"><Icon name="power" size={16} /></button>
        </div>
      </aside>

      <header className={styles.top}>
        <button type="button" className={styles.menuBtn} onClick={toggleSidebar} aria-label={collapsed ? "เปิดเมนูด้านข้าง" : "พับเมนูด้านข้าง"} aria-expanded={!collapsed} title={collapsed ? "เปิดเมนู" : "พับเมนู"}><Icon name="menu" size={20} /></button>
        <span className={styles.roleBadge}>{roleBadge}</span>
        <div className={styles.meet}>
          <b>{meeting ? `AGM ประจำปี ${meeting.year}` : "E-AGM"}</b>
          {meeting?.date && <small>{meeting.date}</small>}
        </div>
        <span className={styles.pageTitle}>{title}</span>
        <button className={styles.logoutM} onClick={logout}>ออก</button>
      </header>

      <main className={styles.main}>{children}</main>

      {(fanOpen || fanMounted) && <div className={`${styles.fanBack} ${fanOpen ? "" : styles.closing}`} onClick={() => setFanOpen(false)} aria-hidden="true" />}
      {(fanOpen || fanMounted) && menu.length <= 6 && (
        <div className={`${styles.fan} ${fanOpen ? "" : styles.closing}`} role="menu" aria-label="เมนูทั้งหมด">
          {menu.map((n, i) => (
            <Link key={n.href} href={n.href} onClick={() => setFanOpen(false)} role="menuitem" className={`${styles.fanItem} ${n.href.startsWith("/admin") ? styles.fanAdmin : styles.fanStaff} ${active(n.href) ? styles.fanOn : ""}`}
              style={{ "--x": fan[i].x, "--y": fan[i].y, "--i": i } as React.CSSProperties}>
              <span className={styles.fanCircle}><Icon name={n.icon} size={22} /></span>
              <span className={styles.fanLbl}>{n.label}</span>
            </Link>
          ))}
        </div>
      )}
      {(fanOpen || fanMounted) && menu.length > 6 && (
        <div className={`${styles.sheet} ${fanOpen ? "" : styles.closing}`} role="menu" aria-label="เมนูทั้งหมด">
          {[["แอดมิน", menu.filter((n) => n.href.startsWith("/admin"))], ["งานหน้างาน", menu.filter((n) => !n.href.startsWith("/admin"))]].map(([title, list]) => (
            (list as NavItem[]).length > 0 && (
              <div key={title as string} className={styles.sheetSec}>
                <div className={styles.sheetTitle}>{title as string}</div>
                <div className={styles.sheetGrid}>
                  {(list as NavItem[]).map((n, i) => (
                    <Link key={n.href} href={n.href} onClick={() => setFanOpen(false)} role="menuitem" className={`${styles.fanItem} ${styles.sheetItem} ${n.href.startsWith("/admin") ? styles.fanAdmin : styles.fanStaff} ${active(n.href) ? styles.fanOn : ""}`}
                      style={{ "--i": i } as React.CSSProperties}>
                      <span className={styles.fanCircle}><Icon name={n.icon} size={22} /></span>
                      <span className={styles.fanLbl}>{n.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}
      <MobileDock slots={dockSlots} active={dockActive} menuKey={MENU_KEY} open={fanOpen} onMenu={() => setFanOpen((v) => !v)} onNavigate={() => setFanOpen(false)} />
    </div>
  );
}
