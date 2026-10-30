"use client";
import { Icon } from "@/components/brand/Icon";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { AttendeeRow } from "@/lib/types";
import { useIsDesktop } from "@/lib/media";
import { Avatar, AdminFrame, Live, PageHead, State } from "@/components/admin/common";

const CHANNELS = [
  { k: "", label: "ทั้งหมด" },
  { k: "onsite", label: "Onsite" },
  { k: "online", label: "Online" },
] as const;

const STATUSES = [
  { k: "registered", label: "ลงทะเบียนแล้ว", cls: "badge badge-green" },
  { k: "pending", label: "รอยืนยัน", cls: "badge badge-amber" },
  { k: "verified", label: "ยืนยันแล้ว", cls: "badge badge-blue" },
  { k: "voted", label: "ลงคะแนนแล้ว", cls: "badge badge-green" },
  { k: "cancelled", label: "ยกเลิก", cls: "badge badge-red" },
] as const;

function Body() {
  const { data, error, loading, reload } = useApi<AttendeeRow[]>("/api/admin/attendees", "staff", 10000);
  const desktop = useIsDesktop();
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [data]);
  const chCount = useMemo(() => {
    const c: Record<string, number> = { onsite: 0, online: 0 };
    data?.forEach((r) => { if (r.status !== "cancelled") c[r.channel] += 1; });
    return c;
  }, [data]);
  const active = (chCount.onsite ?? 0) + (chCount.online ?? 0);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((r) => (!channel || r.channel === channel) && (!status || r.status === status) &&
      (!t || [r.name, r.account_id, r.phone, r.email].some((v) => v.toLowerCase().includes(t))));
  }, [data, q, channel, status]);
  const meta = (s: string) => STATUSES.find((x) => x.k === s);
  const chBadge = (r: AttendeeRow) => (
    <span className={r.channel === "onsite" ? "badge badge-blue" : "badge badge-cyan"}>
      {r.channel === "onsite" ? (r.reg_type === "proxy" ? "Onsite · มอบฉันทะ" : r.reg_type === "group" ? "Onsite · กลุ่ม" : "Onsite") : "Online"}
    </span>
  );

  return (
    <>
      <PageHead title="ผู้เข้าร่วมประชุม" sub={`ลงทะเบียนแล้ว ${fmt(active)} ราย (ไม่รวมที่ยกเลิก) · Onsite + Online`}
        actions={<><Live>รีเฟรช 10 วิ</Live><button className="btn" onClick={reload}>⟳ รีเฟรช</button></>} />
      <div className="adm-kpis">
        <div className="adm-kpi top-blue"><span>ผู้เข้าร่วมทั้งหมด</span><b className="c-blue">{fmt(active)}</b><small>Onsite + Online (ไม่รวมยกเลิก)</small></div>
        <div className="adm-kpi top-green"><span>Onsite</span><b className="c-green">{fmt(chCount.onsite)}</b><small>ลงทะเบียนหน้างาน</small></div>
        <div className="adm-kpi top-cyan"><span>Online</span><b className="c-cyan">{fmt(chCount.online)}</b><small>รอยืนยัน {fmt(counts.pending ?? 0)} · ลงคะแนนแล้ว {fmt(counts.voted ?? 0)}</small></div>
        <div className="adm-kpi top-red"><span>ยกเลิก</span><b className="c-red">{fmt(counts.cancelled ?? 0)}</b><small>ยกเลิกการลงทะเบียนออนไลน์</small></div>
      </div>
      <div className="adm-filter">
        <div className="adm-search"><span aria-hidden className="ico-box"><Icon name="search" size={18} /></span>
          <input id="q" aria-label="ค้นหา ชื่อ เลขบัญชี เบอร์ อีเมล" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / เลขบัญชี / เบอร์ / อีเมล" /></div>
        <div role="group" aria-label="กรองช่องทาง" className="adm-tabs">
          {CHANNELS.map((c) => (
            <button key={c.k} className={channel === c.k ? "on" : ""} aria-pressed={channel === c.k} onClick={() => setChannel(c.k)}>
              {c.label} ({c.k ? chCount[c.k] ?? 0 : active})
            </button>
          ))}
        </div>
        <div role="group" aria-label="กรองสถานะ" className="adm-tabs">
          {STATUSES.filter((x) => (counts[x.k] ?? 0) > 0 || x.k === status).map((s) => (
            <button key={s.k} className={status === s.k ? "on" : ""} aria-pressed={status === s.k} onClick={() => setStatus(status === s.k ? "" : s.k)}>{s.label} ({counts[s.k] ?? 0})</button>
          ))}
        </div>
        <span className="adm-count muted">แสดง {fmt(rows.length)} รายการ</span>
      </div>
      {(data?.length ?? 0) >= 1000 && <p className="muted" style={{ margin: "0 0 8px" }}>แสดงสูงสุด 1,000 รายการล่าสุด — ใช้ช่องค้นหาเพื่อหารายการที่ต้องการ</p>}
      <State loading={loading && !data} error={data ? "" : error} empty={rows.length === 0} emptyText="ไม่พบรายการ">
        {desktop ? (
          <div className="adm-card adm-tablecard">
            <table className="adm-table">
              <thead><tr><th>ผู้ถือหุ้น</th><th>ช่องทาง</th><th>หุ้น</th><th>ติดต่อ</th><th>สถานะ</th><th>OTP</th><th>IP</th><th>ลงทะเบียนเมื่อ</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td><div className="adm-who"><Avatar name={r.name} size={34} /><div><b>{r.name || "-"}</b><div className="muted mono">{r.account_id}</div></div></div></td>
                    <td>{chBadge(r)}</td>
                    <td><b>{fmt(r.shares)}</b></td>
                    <td>{r.phone || "-"}<div className="muted" style={{ fontSize: 11 }}>{r.email}</div></td>
                    <td><span className={meta(r.status)?.cls ?? "badge"}>{meta(r.status)?.label ?? r.status}</span></td>
                    <td>{r.channel === "onsite" ? <span className="muted">-</span> : r.otp_verified ? <span className="badge badge-green">ยืนยันแล้ว</span> : <span className="badge">ยังไม่ยืนยัน</span>}</td>
                    <td className="mono">{r.ip || "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.registered_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="adm-list">
            {rows.map((r) => (
              <li key={r.key} className={`adm-orow${r.status === "pending" ? " warn" : ""}`}>
                <div className="adm-orow-t"><div><b>{r.name || "-"}</b><div className="muted" style={{ fontSize: 12 }}>{r.account_id}</div></div>
                  <div style={{ textAlign: "right" }}><b className="c-blue">{fmt(r.shares)}</b><div className="muted" style={{ fontSize: 11 }}>หุ้น</div></div></div>
                <div className="adm-pills">
                  {chBadge(r)}
                  <span className={meta(r.status)?.cls ?? "badge"}>{meta(r.status)?.label ?? r.status}</span>
                  {r.channel === "online" && <span className={r.otp_verified ? "badge badge-green" : "badge"}>{r.otp_verified ? "OTP ยืนยันแล้ว" : "OTP ยังไม่ยืนยัน"}</span>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}><Icon name="phone" size={13} className="ico-inl" />{r.phone || "-"}{r.email ? <>{" · "}<Icon name="mail" size={13} className="ico-inl" />{r.email}</> : ""}</div>
                <div className="muted" style={{ fontSize: 11 }}>⏱ {r.registered_at}</div>
              </li>
            ))}
          </ul>
        )}
      </State>
    </>
  );
}

export default function Page() { return <AdminFrame title="ผู้เข้าร่วม"><Body /></AdminFrame>; }
