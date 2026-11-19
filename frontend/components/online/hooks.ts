"use client";
import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, getSession } from "@/lib/api";
import { useApi, useHolderGuard } from "@/lib/hooks";
import type { Meeting, Stats } from "@/lib/types";

/** Holder-authenticated polling fetch; redirects to /online when the API invalidates the session (401),
 *  and to the first-visit page when PDPA has not been accepted yet (403 needs_consent). */
export function useHolderApi<T>(path: string, pollMs = 0) {
  const ok = useHolderGuard();
  const router = useRouter();
  const r = useApi<T>(ok ? path : null, "holder", pollMs);
  useEffect(() => {
    if (!ok || !r.error) return;
    if (r.error === "needs_consent") { router.replace("/online/welcome"); return; }
    if (!getSession("holder")) { setNotice("เซสชันหมดอายุหรือถูกยกเลิก กรุณาเข้าสู่ระบบด้วย User และ OTP อีกครั้ง"); router.replace("/online"); }
  }, [ok, r.error, router]);
  return { ...r, ready: ok };
}

const NOTICE_KEY = "eagm_online_notice";
/** One-shot message shown on the login page after the user was sent back there (e.g. expired session). */
export function setNotice(msg: string) { try { sessionStorage.setItem(NOTICE_KEY, msg); } catch { /* ignore */ } }
export function takeNotice(): string {
  try { const m = sessionStorage.getItem(NOTICE_KEY) ?? ""; sessionStorage.removeItem(NOTICE_KEY); return m; } catch { return ""; }
}

/** Ends the holder session on the server (so the token stops working) and locally, then returns to the login. */
export async function holderLogout(go: (path: string) => void, to = "/") {
  try { await api("/api/online/logout", { method: "POST", session: "holder" }); } catch { /* the local session is cleared either way */ }
  clearSession("holder");
  go(to);
}

export type Channel = "sms" | "email";
export interface SentTo { channel: Channel; masked: string }
/** One account under the ID card (when it holds several, the holder picks one). */
export interface AccountChoice { account_id: string; shares: number; active: boolean }
/** POST /api/online/login {id_card, account_id?} - either the OTP was sent, or the accounts to choose from. */
export interface LoginResp { sent?: boolean; channels?: SentTo[]; expires_in?: number; account_id?: string; dev_otp?: string; choose?: AccountChoice[] }

/** Login waiting for its OTP (between /online and /online/otp). */
export interface Pending { id_card: string; account_id: string; channels: SentTo[]; expires_at: number; dev_otp?: string; resends?: number[] }

/** "x-xxxx-xxxxx-12-3" style: only the last 4 digits of the ID card are shown. */
export const maskIdCard = (v: string) => { const d = v.replace(/\D/g, ""); return d.length <= 4 ? d : "•".repeat(d.length - 4) + d.slice(-4); };
export const PENDING_KEY = "eagm_online_pending";
export function readPending(): Pending | null {
  try { const r = sessionStorage.getItem(PENDING_KEY); return r ? (JSON.parse(r) as Pending) : null; } catch { return null; }
}
export function writePending(p: Pending) { try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
export function clearPending() { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } }

export interface Me {
  account_id: string; name: string; shares: number; meeting: Meeting; stats: Stats; vote_mode: "self" | "staff";
  /** PDPA accepted + vote method chosen for this meeting (false = first visit of the year). Absent on older backends. */
  registered?: boolean;
  contacts?: SentTo[];
}
export interface MeState { data: Me | null; error: string; loading: boolean }
export const MeCtx = createContext<MeState | null>(null);
/** Holder profile + meeting loaded once by <OnlineShell auth>; null outside an authenticated shell. */
export const useMe = () => useContext(MeCtx);

/** Ask the shell to reload the holder profile right away (e.g. after the vote mode changed). */
export const ME_REFRESH = "eagm-me-refresh";
export const refreshMe = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(ME_REFRESH)); };

/** Masked list for display: "08XXXX1234 และ h***@mail.com". */
export const sentToText = (c: SentTo[]) => c.map((x) => x.masked).join(" และ ");
