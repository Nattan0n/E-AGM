"use client";
import { Icon } from "@/components/brand/Icon";
import { Select } from "@/components/Select";
import { FormEvent, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { AuditRow } from "@/lib/types";
import { useIsDesktop } from "@/lib/media";
import { AdminFrame, PageHead, Pager, State } from "@/components/admin/common";

const ACTIONS = [
  "login", "otp_request", "otp_fail", "vote", "vote_onsite", "register_onsite", "register_cancel", "register_group", "convert_to_onsite",
  "group_member_add", "group_member_remove", "late_arrival", "novote_add", "novote_remove",
  "agenda_create", "agenda_update", "agenda_delete", "agenda_open", "agenda_closed",
  "user_create", "user_update", "meeting_create", "meeting_update", "meeting_close", "export_summary",
];
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
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select></label>
        <div className="adm-search"><span aria-hidden className="ico-box"><Icon name="search" size={18} /></span><input id="aq" aria-label="ค้นหา เลขบัญชี รายละเอียด" placeholder="ค้นหา เลขบัญชี / รายละเอียด" value={qInput} onChange={(e) => setQInput(e.target.value)} /></div>
        <button type="submit" className="btn btn-primary">ค้นหา</button>
        <span className="adm-count muted">{total.toLocaleString("th-TH")} รายการ</span>
      </form>
      <State loading={loading && !data} error={data ? "" : error} empty={data?.items.length === 0} emptyText="ไม่พบรายการ">
        {desktop ? (
          <div className="adm-card adm-tablecard">
            <table className="adm-table">
              <thead><tr><th>เวลา</th><th>การกระทำ</th><th>บัญชี</th><th>รายละเอียด</th><th>IP</th></tr></thead>
              <tbody>
                {data?.items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.created_at}</td>
                    <td><span className={`adm-chip ${cat(r.action)}`}>{r.action}</span></td>
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
                  <div className="adm-tl-f"><span className={`adm-chip ${cat(r.action)}`}>{r.action.split("_")[0].toUpperCase()}</span><span className="muted">{r.acc_id || "-"} · {r.ip}</span></div>
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
