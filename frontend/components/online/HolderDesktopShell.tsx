"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, IconName } from "@/components/brand/Icon";
import { LogoMark } from "@/components/brand/Logo";
import { fmt } from "@/lib/api";
import { useSidebarCollapsed } from "@/lib/sidebar";
import type { Me } from "./hooks";
import styles from "@/components/Shell.module.css";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/online/waiting", label: "ห้องประชุม", icon: "dashboard" },
  { href: "/online/vote", label: "ลงคะแนน", icon: "vote" },
  { href: "/online/results", label: "ผลมติ", icon: "chart" },
  { href: "/online/confirm", label: "ใบยืนยันผล", icon: "file" },
];

const initial = (n?: string) => (n ? n.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").trim().charAt(0) || "ส" : "ส");

/**
 * Web (desktop) frame for the logged-in shareholder pages: same navy sidebar + glass top bar as the
 * staff/admin app (components/Shell). Phones keep the app-style layout of OnlineShell.
 */
export function HolderDesktopShell({ title, me, onLogout, children }: { title: string; me: Me | null; onLogout?: () => void; children: ReactNode }) {
  const path = usePathname();
  const { collapsed, toggle: toggleSidebar, animate, settled } = useSidebarCollapsed();
  return (
    <div className={`${styles.root} ${settled ? styles.settled : ""}`} data-collapsed={collapsed} data-anim={animate}>
      <aside className={styles.side}>
        <div className={styles.brand}><LogoMark size={34} /><b className={styles.lbl}>E-AGM</b></div>
        <nav className={styles.nav} aria-label="เมนูผู้ถือหุ้น">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? styles.on : ""} title={n.label}>
              <Icon name={n.icon} size={19} /><span className={styles.lbl}>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.me}>
          <span className={styles.avatar}>{initial(me?.name)}</span>
          <div className={styles.meText}>
            <b>{me?.name ?? "ผู้ถือหุ้น"}</b>
            <small>{me ? `${fmt(me.shares)} หุ้น · Online` : "Online"}</small>
          </div>
          {onLogout && <button className={styles.out} onClick={onLogout} aria-label="ออกจากระบบ" title="ออกจากระบบ"><Icon name="power" size={16} /></button>}
        </div>
      </aside>

      <header className={styles.top}>
        <button type="button" className={styles.menuBtn} onClick={toggleSidebar} aria-label={collapsed ? "เปิดเมนูด้านข้าง" : "พับเมนูด้านข้าง"} aria-expanded={!collapsed} title={collapsed ? "เปิดเมนู" : "พับเมนู"}><Icon name="menu" size={20} /></button>
        <span className={styles.roleBadge}>ผู้ถือหุ้น</span>
        <div className={styles.meet}>
          <b>{me?.meeting.detail || "ประชุมสามัญผู้ถือหุ้น"}</b>
          {me?.meeting.date && <small>{me.meeting.date}</small>}
        </div>
        <span className={styles.pageTitle}>{title}</span>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
