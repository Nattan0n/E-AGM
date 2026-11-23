"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import styles from "./GradientBg.module.css";

/** Pages that sit on the dark brand gradient (hero style). Everything else gets the light, quiet variant. */
const HERO_ALWAYS = ["/"];
/** Dark on desktop only; on phones the form sits on a plain light page so labels stay readable. */
/** Keep in sync with the pages that render AuthSplit / AuthFrame (white brand text on the left needs the dark backdrop). */
const HERO_DESKTOP = ["/staff/login", "/online", "/online/otp", "/online/request", "/online/welcome"];

/**
 * Animated morphing-gradient backdrop (adapted from the gradients-bg project, recoloured to the
 * E-AGM navy / blue / cyan palette). Fixed behind all content; pointer-events none.
 *  - dark  : landing + login/register pages
 *  - light : staff / admin / in-flow online pages, subtle so white cards stay readable
 * The mouse-following blob is desktop-only; its frame loop sleeps while the mouse is still.
 */
export function GradientBg() {
  const path = usePathname();
  const variant = HERO_ALWAYS.includes(path) ? "dark" : HERO_DESKTOP.includes(path) ? "darkDesktop" : "light";
  const inter = useRef<HTMLDivElement>(null);

  // The blurred, blended backdrop is re-painted every frame while it moves. Freeze it while the user is tapping around
  // (menu open/close, page switches) so those transitions get the whole frame budget; it resumes right after.
  useEffect(() => {
    const root = document.documentElement;
    let t = 0;
    const hold = () => { root.dataset.busy = "1"; clearTimeout(t); t = window.setTimeout(() => { delete root.dataset.busy; }, 1000); };
    const down = (e: Event) => { if ((e.target as Element | null)?.closest?.("a, button, [role=menuitem]")) hold(); };
    document.addEventListener("pointerdown", down, { capture: true, passive: true });
    return () => { document.removeEventListener("pointerdown", down, true); clearTimeout(t); delete root.dataset.busy; };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.busy = "1";
    const t = window.setTimeout(() => { delete root.dataset.busy; }, 1100);
    return () => clearTimeout(t);
  }, [path]);

  useEffect(() => {
    const el = inter.current;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || !fine || reduce) return;
    let cx = 0, cy = 0, tx = 0, ty = 0, raf = 0;
    const move = (e: MouseEvent) => { tx = e.clientX; ty = e.clientY; };
    const tick = () => {
      cx += (tx - cx) / 20;
      cy += (ty - cy) / 20;
      el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
      // settled on the pointer: stop looping until the mouse moves again
      raf = Math.abs(tx - cx) < 0.5 && Math.abs(ty - cy) < 0.5 ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); };
    const onVis = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      wake();
    };
    window.addEventListener("mousemove", wake, { passive: true });
    window.addEventListener("mousemove", move);
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousemove", wake);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className={`${styles.bg} ${styles[variant]}`} aria-hidden="true">
      <div className={styles.container}>
        <div className={styles.g1} />
        <div className={styles.g2} />
        <div className={styles.g3} />
        <div className={styles.g4} />
        <div className={styles.g5} />
        <div className={styles.interactive} ref={inter} />
      </div>
    </div>
  );
}
