"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { clearSession, StaffSession } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSidebarCollapsed } from "@/lib/sidebar";
import { Icon, IconName } from "@/components/brand/Icon";
import { LogoMark } from "@/components/brand/Logo";
import type { Meeting } from "@/lib/types";
import styles from "./Shell.module.css";

export interface NavItem { href: string; label: string; icon: IconName }

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "ค้นหา", icon: "search" },
  { href: "/staff/register", label: "ลงทะเบียน", icon: "register" },
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
  const active = (h: string) => (h === "/staff" || h === "/admin" ? path === h : path.startsWith(h));
  const logout = () => { clearSession("staff"); router.replace("/staff/login"); };
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
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={active(n.href) ? styles.on : ""} title={n.label}>
              <Icon name={n.icon} size={19} /><span className={styles.lbl}>{n.label}</span>
            </Link>
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

      <nav className={styles.tabs} aria-label="เมนูมือถือ">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? styles.on : ""}>
            <Icon name={n.icon} size={22} />
            <small>{n.label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}
