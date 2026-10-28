"use client";
import { useSyncExternalStore } from "react";

/** Desktop ("Web") layout starts here; below it the mobile app layout is used. Keep in sync with CSS media queries. */
export const DESKTOP_MIN = 1024;

function subscribe(cb: () => void) {
  const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * true on desktop/laptop widths. The server snapshot is `false` (mobile-first), so the first paint on a
 * desktop briefly uses the mobile layout until hydration — keep both layouts safe to render.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`).matches,
    () => false,
  );
}
