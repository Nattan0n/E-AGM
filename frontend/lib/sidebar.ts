"use client";
import { useCallback, useEffect, useState } from "react";

const KEY = "eagm_sidebar_collapsed";

const apply = (collapsed: boolean) => {
  if (collapsed) document.documentElement.dataset.sidebar = "collapsed";
  else delete document.documentElement.dataset.sidebar;
};

// Module state survives client-side navigation (each page re-mounts its Shell).
// Effects never run on the server, so these stay false there and hydration matches.
let shellSeen = false;

/**
 * Desktop sidebar collapsed state, remembered per browser.
 * The CSS is driven by <html data-sidebar="collapsed">, which an inline script in app/layout.tsx sets before
 * the first paint - so a collapsed sidebar never flashes open while React hydrates or a page re-mounts.
 *  - `animate`: true only after the user toggled, so the width transition never plays on page changes
 *  - `settled`: true once a Shell has mounted before, so entrance animations only run on the first load
 */
export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void; animate: boolean; settled: boolean } {
  const [collapsed, setCollapsed] = useState(false); // only used for the button label / aria state
  const [animate, setAnimate] = useState(false);
  const [settled] = useState(shellSeen);
  useEffect(() => {
    shellSeen = true;
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);
  const toggle = useCallback(() => {
    setAnimate(true);
    const next = document.documentElement.dataset.sidebar !== "collapsed";
    apply(next);
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* ignore */ }
    setCollapsed(next);
  }, []);
  return { collapsed, toggle, animate, settled };
}
