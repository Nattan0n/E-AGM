"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, getSession } from "@/lib/api";
import { useApi, useHolderGuard } from "@/lib/hooks";

/** Holder-authenticated polling fetch; redirects to /online when the API invalidates the session (401). */
export function useHolderApi<T>(path: string, pollMs = 0) {
  const ok = useHolderGuard();
  const router = useRouter();
  const r = useApi<T>(ok ? path : null, "holder", pollMs);
  useEffect(() => {
    if (ok && r.error && !getSession("holder")) { setNotice("เซสชันหมดอายุหรือถูกยกเลิก กรุณายืนยันตัวตนและ OTP ใหม่อีกครั้ง"); router.replace("/online"); }
  }, [ok, r.error, router]);
  return { ...r, ready: ok };
}

const NOTICE_KEY = "eagm_online_notice";
/** One-shot message shown on the register page after the user was sent back there (e.g. expired session). */
export function setNotice(msg: string) { try { sessionStorage.setItem(NOTICE_KEY, msg); } catch { /* ignore */ } }
export function takeNotice(): string {
  try { const m = sessionStorage.getItem(NOTICE_KEY) ?? ""; sessionStorage.removeItem(NOTICE_KEY); return m; } catch { return ""; }
}

/** Ends the holder session on the server (so the token stops working) and locally, then returns to the start. */
export async function holderLogout(go: (path: string) => void) {
  try { await api("/api/online/logout", { method: "POST", session: "holder" }); } catch { /* the local session is cleared either way */ }
  clearSession("holder");
  go("/");
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
