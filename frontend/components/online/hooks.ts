"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/api";
import { useApi, useHolderGuard } from "@/lib/hooks";

/** Holder-authenticated polling fetch; redirects to /online when the API invalidates the session (401). */
export function useHolderApi<T>(path: string, pollMs = 0) {
  const ok = useHolderGuard();
  const router = useRouter();
  const r = useApi<T>(ok ? path : null, "holder", pollMs);
  useEffect(() => {
    if (ok && r.error && !getSession("holder")) router.replace("/online");
  }, [ok, r.error, router]);
  return { ...r, ready: ok };
}

export interface Pending {
  account_id: string; masked_to: string; channel: "sms" | "email"; expires_at: number; dev_otp?: string;
  id_card: string; phone: string; email: string; vote_mode?: "self" | "staff";
  resends?: number[];
}
export const PENDING_KEY = "eagm_online_pending";
export function readPending(): Pending | null {
  try { const r = sessionStorage.getItem(PENDING_KEY); return r ? (JSON.parse(r) as Pending) : null; } catch { return null; }
}
export function writePending(p: Pending) { try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
export function clearPending() { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } }

export interface RegisterResp { sent: boolean; channel: "sms" | "email"; expires_in: number; masked_to: string; dev_otp?: string }

import { createContext, useContext } from "react";
import type { Meeting, Stats } from "@/lib/types";

export interface Me { account_id: string; name: string; shares: number; meeting: Meeting; stats: Stats; vote_mode: "self" | "staff" }
export interface MeState { data: Me | null; error: string; loading: boolean }
export const MeCtx = createContext<MeState | null>(null);
/** Holder profile + meeting loaded once by <OnlineShell auth>; null outside an authenticated shell. */
export const useMe = () => useContext(MeCtx);

/** Ask the shell to reload the holder profile right away (e.g. after the vote mode changed). */
export const ME_REFRESH = "eagm-me-refresh";
export const refreshMe = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(ME_REFRESH)); };
