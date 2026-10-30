// Thin fetch wrapper for the Go API. Tokens live in sessionStorage (cleared when the tab closes).
import { MOCK, mockApi } from "./mock";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type Session = "staff" | "holder";
const KEY: Record<Session, string> = { staff: "eagm_staff", holder: "eagm_holder" };

export interface StaffSession { token: string; role: "admin" | "staff" | "viewer"; name: string; username: string }

export function getSession<T = { token: string }>(kind: Session): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY[kind]);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function setSession(kind: Session, value: object) { sessionStorage.setItem(KEY[kind], JSON.stringify(value)); }
export function clearSession(kind: Session) { sessionStorage.removeItem(KEY[kind]); }

/** Backend errors that are written in English, shown to people in Thai. Codes such as already_voted are handled by the pages. */
const ERR_TH: Record<string, string> = {
  "meeting is closed (read-only)": "การประชุมปิดแล้ว อยู่ในโหมดอ่านอย่างเดียว",
  "invalid credentials": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  "agenda is not open for voting": "วาระนี้ยังไม่เปิดให้ลงคะแนน",
  "agenda not found": "ไม่พบวาระ",
  "agenda already closed": "วาระนี้ปิดแล้ว",
  "this agenda is for acknowledgement only": "วาระนี้เป็นการรับทราบ ไม่มีการลงคะแนน",
  "holder is not registered onsite": "ผู้ถือหุ้นรายนี้ยังไม่ได้ลงทะเบียนที่หน้างาน",
  "holder has no voting right on this agenda": "ผู้ถือหุ้นรายนี้ไม่มีสิทธิ์ลงคะแนนในวาระนี้",
  "holder has already voted - cannot cancel registration": "ผู้ถือหุ้นลงคะแนนแล้ว ไม่สามารถยกเลิกการลงทะเบียนได้",
  "member has already voted": "สมาชิกรายนี้ลงคะแนนแล้ว",
  "register the holder first": "กรุณาลงทะเบียนผู้ถือหุ้นก่อน",
  "late arrival already recorded": "บันทึกการมาสายของผู้ถือหุ้นรายนี้แล้ว",
  "already excluded from this agenda": "ผู้ถือหุ้นรายนี้ถูกตัดสิทธิ์ในวาระนี้แล้ว",
  "holder already registered": "ผู้ถือหุ้นรายนี้ลงทะเบียนแล้ว",
  "username already exists": "มีชื่อผู้ใช้นี้อยู่แล้ว",
  "password must be at least 8 characters": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
  "account_id, term_id and a valid choice (or split) are required": "ข้อมูลไม่ครบ กรุณาเลือกผู้ถือหุ้น วาระ และผลการลงคะแนน",
  "term_id and a valid choice are required": "กรุณาเลือกวาระและผลการลงคะแนน",
  "account_id and 6-digit otp required": "กรุณากรอกรหัส OTP 6 หลัก",
  "q must be at least 2 characters": "พิมพ์อย่างน้อย 2 ตัวอักษร",
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: { errors?: { row: number; msg: string }[] }) { super(message); }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; session?: Session | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const kind = opts.session === undefined ? "staff" : opts.session;
  if (kind) {
    const s = getSession(kind);
    if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  }
  if (MOCK) {
    try { return (await mockApi(path, opts.method ?? "GET", opts.body as Record<string, unknown> | undefined)) as T; }
    catch (e) { throw new ApiError((e as { __mockStatus?: number }).__mockStatus ?? 400, errMsg(e)); }
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: opts.method ?? "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }
  if (res.status === 401 && kind) {
    // expired / invalid session: drop it so the page guard redirects to login
    clearSession(kind);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const raw = (data as { message?: string } | undefined)?.message;
    const msg = (raw && ERR_TH[raw]) || raw || `เกิดข้อผิดพลาด (${res.status})`;
    throw new ApiError(res.status, msg, data as ApiError["data"]);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "เกิดข้อผิดพลาด");

/** Authenticated download (e.g. CSV export) - a plain link cannot send the Authorization header. */
export async function download(path: string, filename: string) {
  if (MOCK) {
    const csv = "﻿วาระ,เห็นด้วย,ไม่เห็นด้วย,งดออกเสียง\n(ข้อมูลตัวอย่างจากโหมดทดลอง)\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    return;
  }
  const s = getSession<StaffSession>("staff");
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${s?.token ?? ""}` } });
  if (!res.ok) throw new ApiError(res.status, "ดาวน์โหลดไม่สำเร็จ");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const CHOICE_LABEL: Record<string, string> = { agree: "เห็นด้วย", disagree: "ไม่เห็นด้วย", abstain: "งดออกเสียง", spoiled: "บัตรเสีย", split: "แบ่งคะแนน" };
export const fmt = (n: number) => n.toLocaleString("th-TH");
