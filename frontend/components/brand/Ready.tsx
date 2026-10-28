"use client";
import { useEffect } from "react";

/**
 * Pages pick their layout (desktop vs mobile) in JS after hydration, so the server HTML is always the mobile one.
 * #app-root stays transparent (see globals.css) until this has run, so a desktop refresh never flashes the phone layout.
 */
export function Ready() {
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => { document.documentElement.dataset.ready = "1"; }); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);
  return null;
}
