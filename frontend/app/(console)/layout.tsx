"use client";
import type { ReactNode } from "react";
import { Shell, STAFF_NAV } from "@/components/Shell";
import { useStaffGuard } from "@/lib/hooks";

/** One Shell (sidebar + mobile dock) for every /admin and /staff page, so it stays mounted while only the page content changes. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = useStaffGuard();
  if (!session) return null;
  return <Shell session={session} nav={STAFF_NAV}>{children}</Shell>;
}
