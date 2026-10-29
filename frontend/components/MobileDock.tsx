"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, IconName } from "@/components/brand/Icon";
import styles from "./Shell.module.css";

export interface DockSlot { key: string; label: string; icon: IconName; href?: string }

const TOP = 44;      // room above the bar for the floating circle
const BAR_H = 65;
const NW = 70;       // half width of the notch
const DEPTH = 40;    // how far the notch cuts into the bar
const CIRCLE = 58;
const PAD = 25;      // minimum side inset of the slots
const PAD_MAX = 40;
const EDGE = 0;      // flat bar kept between the screen edge and the notch of an edge tab

// Push the slots in just enough that an edge tab's notch is as wide as every other one (only very narrow screens still clamp it).
const padFor = (w: number, n: number) => Math.min(PAD_MAX, Math.max(PAD, (NW + EDGE - w / (2 * n)) / (1 - 1 / n)));

// Each page mounts its own dock, so remember where the notch ended up (as a fraction of the width) and glide from there on the next page.
let lastRatio: number | null = null;
let lastCircleKey = ""; // the circle icon only pops when the slot / open state really changed, not on every page mount

const easeOutBack = (t: number) => { const c1 = 0.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function barPath(w: number, cx: number | null): string {
  const y = TOP;
  if (cx === null) return `M0,${y} L${w},${y} L${w},${y + BAR_H} L0,${y + BAR_H} Z`;
  // The notch keeps its shape (symmetrical, hugging the circle) everywhere, and just gets narrower where an edge tab leaves less room.
  const nw = Math.max(CIRCLE / 2, Math.min(NW, cx - EDGE, w - cx - EDGE));
  const a = cx - nw, b = cx + nw;
  return `M0,${y} L${a},${y} C${a + nw * 0.62},${y} ${cx - nw * 0.5},${y + DEPTH} ${cx},${y + DEPTH} C${cx + nw * 0.5},${y + DEPTH} ${b - nw * 0.62},${y} ${b},${y} L${w},${y} L${w},${y + BAR_H} L0,${y + BAR_H} Z`;
}

/**
 * Bottom bar with a curved notch that glides to the selected slot (the selected icon sits in a circle inside the notch).
 * `active` is the slot index, or -1 for a flat bar. Slot `menu` renders as a button.
 */
export function MobileDock({ slots, active, menuKey, open, onMenu, onNavigate, activeLabelIcon }: {
  slots: DockSlot[]; active: number; menuKey: string; open: boolean; onMenu: () => void; onNavigate: () => void;
  activeLabelIcon?: IconName;
}) {
  const navRef = useRef<HTMLElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const cur = useRef<number | null>(null);
  const raf = useRef(0);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!w) return;
    const pad = padFor(w, slots.length);
    const target = active < 0 ? null : pad + ((active + 0.5) * (w - 2 * pad)) / slots.length;
    const draw = (x: number | null) => {
      lastRatio = x === null ? null : x / w;
      pathRef.current?.setAttribute("d", barPath(w, x));
      if (circleRef.current) {
        circleRef.current.style.transform = `translateX(${(x ?? -200) - CIRCLE / 2}px)`;
        circleRef.current.style.opacity = x === null ? "0" : "1";
      }
    };
    cancelAnimationFrame(raf.current);
    const from = lastRatio !== null ? lastRatio * w : cur.current; // the notch's position on whichever page we came from
    if (from !== null && from !== target) draw(from); // paint the previous position first, then glide
    if (from === null || target === null) { cur.current = target; draw(target); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 520);
      const x = from + (target - from) * easeOutBack(p);
      cur.current = x;
      draw(x);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else { cur.current = target; draw(target); }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [active, w, slots.length]);

  const circleKey = `${active}-${open}`;
  const popIcon = circleKey !== lastCircleKey;
  useEffect(() => { lastCircleKey = circleKey; }, [circleKey]);
  const activeSlot = active >= 0 ? slots[active] : null;
  const circleIcon: IconName | null = activeSlot ? (activeSlot.key === menuKey ? (activeLabelIcon ?? activeSlot.icon) : activeSlot.icon) : null;

  return (
    <nav ref={navRef} className={styles.dock} aria-label="เมนูมือถือ">
      <svg className={styles.dockBg} width={w || "100%"} height={TOP + BAR_H} aria-hidden="true"><path ref={pathRef} fill="#fff" d={barPath(w || 390, null)} /></svg>
      <div ref={circleRef} className={`${styles.dockCircle} ${open ? styles.dockCircleOpen : ""}`} style={{ top: TOP + DEPTH - CIRCLE - 9, width: CIRCLE, height: CIRCLE, opacity: 0 }}>
        {circleIcon && (
          <span key={circleKey} className={`${styles.dockCircleIn} ${popIcon ? "" : styles.dockCircleStill}`}>
            {open ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg> : <Icon name={circleIcon} size={24} />}
          </span>
        )}
      </div>
      <div className={styles.dockRow} style={{ height: BAR_H, marginTop: TOP, paddingInline: padFor(w || 390, slots.length) }}>
        {slots.map((s, i) => {
          const on = i === active;
          const inner = (
            <>
              <span className={styles.dockIcon} style={{ visibility: on ? "hidden" : "visible" }}><Icon name={s.icon} size={22} /></span>
              <small className={on ? styles.dockLblOn : ""}>{s.label}</small>
            </>
          );
          return s.key === menuKey ? (
            <button key={s.key} type="button" className={`${styles.dockSlot} ${on ? styles.dockOn : ""}`} onClick={onMenu} aria-expanded={open} aria-label={open ? "ปิดเมนู" : "เมนูทั้งหมด"}>{inner}</button>
          ) : (
            <Link key={s.key} href={s.href!} className={`${styles.dockSlot} ${on ? styles.dockOn : ""}`} onClick={onNavigate}>{inner}</Link>
          );
        })}
      </div>
      <div className={styles.dockSafe} />
    </nav>
  );
}
