"use client";
import { Icon } from "@/components/brand/Icon";
import { Select } from "@/components/Select";
import { FormEvent, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { AuditRow } from "@/lib/types";
import { useIsDesktop } from "@/lib/media";
import { AdminFrame, PageHead, Pager, State } from "@/components/admin/common";

// every action the backend writes, with what it means in Thai (the dropdown lists them all)
const ACTIONS: Record<string, string> = {
  login: "เข้าสู่ระบบ", login_fail: "เข้าสู่ระบบไม่สำเร็จ", login_locked: "ถูกล็อกชั่วคราว (กรอกผิดหลายครั้ง)", logout: "ออกจากระบบ",
  otp_request: "ขอรหัส OTP", otp_fail: "กรอก OTP ผิด", register_fail: "ยืนยันตัวตนออนไลน์ไม่ผ่าน", register_locked: "ถูกล็อกการลงทะเบียนออนไลน์",
  vote: "ผู้ถือหุ้นลงคะแนนออนไลน์", vote_mode: "เปลี่ยนวิธีลงคะแนน", vote_onsite: "เจ้าหน้าที่ลงคะแนนแทน", vote_clear: "ล้างคะแนน",
  register_onsite: "ลงทะเบียนหน้างาน", register_cancel: "ยกเลิกการลงทะเบียน", register_group: "ลงทะเบียนกลุ่ม", convert_to_onsite: "เปลี่ยนเป็น Onsite",
  group_member_add: "เพิ่มสมาชิกกลุ่ม", group_member_remove: "ลบสมาชิกกลุ่ม", late_arrival: "บันทึกผู้มาสาย", novote_add: "กำหนดไม่มีสิทธิ์ออกเสียง", novote_remove: "คืนสิทธิ์ออกเสียง",
  agenda_create: "สร้างวาระ", agenda_update: "แก้ไขวาระ", agenda_delete: "ลบวาระ", agenda_open: "เปิดโหวตวาระ", agenda_closed: "ปิดโหวตวาระ",
  user_create: "เพิ่มผู้ใช้", user_update: "แก้ไขผู้ใช้", holder_create: "เพิ่มผู้ถือหุ้น", holder_update: "แก้ไขผู้ถือหุ้น", holder_import: "นำเข้าทะเบียนผู้ถือหุ้น",
  meeting_create: "สร้างการประชุม", meeting_update: "แก้ไขการประชุม", meeting_close: "ปิดการประชุม", room_open: "เปิดห้องประชุมออนไลน์", room_close: "ปิดห้องประชุมออนไลน์",
  export_summary: "ส่งออกสรุปผล", export_attendees: "ส่งออกรายชื่อผู้เข้าประชุม", export_audit: "ส่งออก Audit",
};
const LIMIT = 50;

function prettyDetail(d: string): string {
  if (!d) return "";
  try { return JSON.stringify(JSON.parse(d), null, 2); } catch { return d; }
}

function cat(a: string): string {
  if (a.startsWith("vote") || a.startsWith("novote")) return "adm-chip-blue";
  if (a.startsWith("register") || a.startsWith("convert") || a.startsWith("group") || a === "late_arrival") return "adm-chip-green";
  if (a.startsWith("agenda") || a.startsWith("user") || a.startsWith("meeting")) return "adm-chip-purple";
  if (a === "otp_fail") return "adm-chip-red";
  if (a === "login" || a.startsWith("otp")) return "adm-chip-cyan";
  return "adm-chip-amber";
}
/** Who did it: the staff/admin name the backend stores in the detail ("by"), or the username on a login. Holder actions have none (see acc_id). */
function actor(d: string): string {
  try { const o = JSON.parse(d); return o && typeof o === "object" ? String(o.by ?? o.username ?? "") : ""; } catch { return ""; }
}
function oneLine(d: string): string {
  try { const o = JSON.parse(d); return typeof o === "object" && o ? Object.entries(o).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : String(d); } catch { return d; }
}

function Body() {
  const desktop = useIsDesktop();
  const [action, setAction] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT) });
  if (action) params.set("action", action);
  if (q) params.set("q", q);
  const { data, error, loading, reload } = useApi<{ total: number; items: AuditRow[] }>(`/api/admin/audit?${params}`);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const submit = (e: FormEvent) => { e.preventDefault(); setPage(0); setQ(qInput.trim()); };

  return (
    <>
      <PageHead title="Audit Log" sub={`บันทึกกิจกรรมทั้งหมดในระบบ · ${total.toLocaleString("th-TH")} รายการ`} actions={<button className="btn" onClick={reload}>⟳ รีเฟรช</button>} />
      <form className="adm-filter" onSubmit={submit}>
        <label className="adm-fl">การกระทำ
          <Select id="act" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
            <option value="">ทั้งหมด</option>
            {Object.entries(ACTIONS).map(([a, th]) => <option key={a} value={a}>{`${a} — ${th}`}</option>)}
          </Select></label>
        <div className="adm-search"><span aria-hidden className="ico-box"><Icon name="search" size={18} /></span><input id="aq" aria-label="ค้นหา เลขบัญชี รายละเอียด" placeholder="ค้นหา เลขบัญชี / รายละเอียด" value={qInput} onChange={(e) => setQInput(e.target.value)} /></div>
        <button type="submit" className="btn btn-primary">ค้นหา</button>
        <span className="adm-count muted">{total.toLocaleString("th-TH")} รายการ</span>
      </form>
      <State loading={loading && !data} error={data ? "" : error} empty={data?.items.length === 0} emptyText="ไม่พบรายการ">
        {desktop ? (
          <div className="adm-card adm-tablecard">
            <table className="adm-table">
              <thead><tr><th>เวลา</th><th>การกระทำ</th><th>ผู้ดำเนินการ</th><th>ผู้ถือหุ้น</th><th>รายละเอียด</th><th>IP</th></tr></thead>
              <tbody>
                {data?.items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.created_at}</td>
                    <td><span className={`adm-chip ${cat(r.action)}`} title={ACTIONS[r.action]}>{r.action}</span>{ACTIONS[r.action] && <div className="muted" style={{ fontSize: 11 }}>{ACTIONS[r.action]}</div>}</td>
                    <td>{actor(r.detail) || "-"}</td>
                    <td>{r.acc_id || "-"}</td>
                    <td>{r.detail ? <span className="adm-d1" title={prettyDetail(r.detail)}>{oneLine(r.detail)}</span> : "-"}</td>
                    <td className="mono">{r.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ol className="adm-timeline">
            {data?.items.map((r) => (
              <li key={r.id}>
                <span className={`adm-tl-dot ${cat(r.action)}`} aria-hidden />
                <div className="adm-tl-card">
                  <div className="adm-tl-h"><b>{r.action}</b><time>{r.created_at}</time></div>
                  {r.detail && <p className="adm-tl-d">{oneLine(r.detail)}</p>}
                  <div className="adm-tl-f"><span className={`adm-chip ${cat(r.action)}`}>{r.action.split("_")[0].toUpperCase()}</span><span className="muted">{[actor(r.detail), r.acc_id].filter(Boolean).join(" · ") || "-"} · {r.ip}</span></div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <Pager page={page} pages={pages} onPage={setPage} />
      </State>
    </>
  );
}

export default function Page() { return <AdminFrame title="Audit Log"><Body /></AdminFrame>; }
