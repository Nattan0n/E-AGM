"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getSession, StaffSession } from "./api";

/** Redirects to /staff/login when no staff session exists; `roles` limits access (others go to their home). */
// Effects never run on the server, so this stays false for SSR / first hydration (markup matches) and is
// true for every later client-side page change, where the session can be read synchronously.
let clientReady = false;

const allowed = (cur: StaffSession | null, roles?: StaffSession["role"][]) => (cur && (!roles || roles.includes(cur.role)) ? cur : null);

export function useStaffGuard(roles?: StaffSession["role"][]): StaffSession | null {
  const router = useRouter();
  const [s, setS] = useState<StaffSession | null>(() => (clientReady ? allowed(getSession<StaffSession>("staff"), roles) : null));
  useEffect(() => {
    clientReady = true;
    const cur = getSession<StaffSession>("staff");
    if (!cur) { router.replace("/staff/login"); return; }
    if (roles && !roles.includes(cur.role)) { router.replace(cur.role === "admin" ? "/admin" : "/staff"); return; }
    setS(cur);
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

/** Holder (online) pages: redirects to /online (register) when there is no holder session. */
export function useHolderGuard(): boolean {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!getSession("holder")) router.replace("/online");
    else setOk(true);
  }, [router]);
  return ok;
}

/** Fetch-on-mount helper with reload + optional polling. Pass null to skip fetching. */
export function useApi<T>(path: string | null, session: "staff" | "holder" = "staff", pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    try { setData(await api<T>(path, { session })); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setLoading(false); }
  }, [path, session]);
  useEffect(() => {
    load();
    if (!pollMs) return;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return { data, error, loading, reload: load };
}

export function useToast() {
  const [t, setT] = useState<{ msg: string; err: boolean } | null>(null);
  const show = useCallback((msg: string, err = false) => {
    setT({ msg, err });
    setTimeout(() => setT(null), 3000);
  }, []);
  const node = t ? <div className={`toast${t.err ? " err" : ""}`} role="status">{t.msg}</div> : null;
  return { show, node };
}
