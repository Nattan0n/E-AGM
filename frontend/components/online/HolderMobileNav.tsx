"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { MobileDock, DockSlot } from "@/components/MobileDock";
import { NAV } from "./HolderDesktopShell";
import type { Me } from "./hooks";
import styles from "@/components/Shell.module.css";

const MENU_KEY = "__menu";
const initial = (n?: string) => (n ? n.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").trim().charAt(0) || "ส" : "ส");

/**
 * Mobile frame for the logged-in shareholder pages: the same curved bottom dock as the staff/admin app,
 * with the centre "เมนู" button opening the account card (name + logout).
 */
export function HolderMobileNav({ me, onLogout }: { me: Me | null; onLogout?: () => void }) {
  const path = usePathname();
  const [nextPath, setNextPath] = useState<string | null>(null);
  useEffect(() => { setNextPath(null); }, [path]);
  const cur = nextPath ?? path;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // stays mounted briefly after closing so the collapse animation can play
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => { setOpen(false); return () => { setOpen(false); setMounted(false); }; }, [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open]);

  const slots: DockSlot[] = [
    ...NAV.slice(0, 2).map((n) => ({ key: n.href, label: n.label, icon: n.icon, href: n.href })),
    { key: MENU_KEY, label: "เมนู", icon: "menu" as const },
    ...NAV.slice(2).map((n) => ({ key: n.href, label: n.label, icon: n.icon, href: n.href })),
  ];
  const found = slots.findIndex((d) => d.href && cur.startsWith(d.href));
  const active = open ? 2 : found;
  const name = me?.name ?? "ผู้ถือหุ้น";

  return (
    <>
      {(open || mounted) && <div className={`${styles.fanBack} ${open ? "" : styles.closing}`} onClick={() => setOpen(false)} aria-hidden="true" />}
      {(open || mounted) && (
        <div className={`${styles.acct} ${open ? "" : styles.closing}`}>
          <span className={styles.acctAvatar}>{initial(me?.name)}</span>
          <div className={styles.acctText}><b>{name}</b><small>ผู้ถือหุ้น · Online</small></div>
          {onLogout && <button type="button" className={styles.acctOut} onClick={onLogout}><Icon name="power" size={16} />ออกจากระบบ</button>}
        </div>
      )}
      <MobileDock slots={slots} active={active} menuKey={MENU_KEY} open={open} onMenu={() => setOpen((v) => !v)} onNavigate={(href) => { setOpen(false); setNextPath(href); }} />
    </>
  );
}
