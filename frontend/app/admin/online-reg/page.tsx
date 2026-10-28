"use client";
import { Icon } from "@/components/brand/Icon";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { OnlineRegRow } from "@/lib/types";
import { useIsDesktop } from "@/lib/media";
import { Avatar, AdminFrame, Live, PageHead, State } from "@/components/admin/common";

const STATUSES = [
  { k: "pending", label: "รอยืนยัน", cls: "badge badge-amber" },
  { k: "verified", label: "ยืนยันแล้ว", cls: "badge badge-blue" },
  { k: "voted", label: "ลงคะแนนแล้ว", cls: "badge badge-green" },
  { k: "cancelled", label: "ยกเลิก", cls: "badge badge-red" },
] as const;

function Body() {
  const { data, error, loading, reload } = useApi<OnlineRegRow[]>("/api/admin/online-registrations", "staff", 10000);
  const desktop = useIsDesktop();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [data]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((r) => (!status || r.status === status) &&
      (!t || [r.name, r.account_id, r.phone, r.email].some((v) => v.toLowerCase().includes(t))));
  }, [data, q, status]);
  const meta = (s: string) => STATUSES.find((x) => x.k === s);

  return (
    <>
      <PageHead title="ผู้ลงทะเบียนออนไลน์" sub={`ทั้งหมด ${data?.length ?? 0} ราย`}
        actions={<><Live>รีเฟรช 10 วิ</Live><button className="btn" onClick={reload}>⟳ รีเฟรช</button></>} />
      <div className="ad-kpis">
        <div className="ad-kpi top-blue"><span>ลงทะเบียนทั้งหมด</span><b className="c-blue">{fmt(data?.length ?? 0)}</b><small>ผู้ถือหุ้นออนไลน์</small></div>
        <div className="ad-kpi top-amber"><span>รอยืนยัน</span><b className="c-amber">{fmt(counts.pending ?? 0)}</b><small>ยังไม่ยืนยัน OTP</small></div>
        <div className="ad-kpi top-green"><span>ยืนยันแล้ว / ลงคะแนน</span><b className="c-green">{fmt((counts.verified ?? 0) + (counts.voted ?? 0))}</b><small>ลงคะแนนแล้ว {fmt(counts.voted ?? 0)}</small></div>
        <div className="ad-kpi top-red"><span>ยกเลิก</span><b className="c-red">{fmt(counts.cancelled ?? 0)}</b><small>ยกเลิกการลงทะเบียน</small></div>
      </div>
      <div className="ad-filter">
        <div className="ad-search"><span aria-hidden className="ico-box"><Icon name="search" size={18} /></span>
          <input id="q" aria-label="ค้นหา ชื่อ เลขบัญชี เบอร์ อีเมล" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / เลขบัญชี / เบอร์ / อีเมล" /></div>
        <div role="group" aria-label="กรองสถานะ" className="ad-tabs">
          <button className={status === "" ? "on" : ""} aria-pressed={status === ""} onClick={() => setStatus("")}>ทั้งหมด ({data?.length ?? 0})</button>
          {STATUSES.map((s) => (
            <button key={s.k} className={status === s.k ? "on" : ""} aria-pressed={status === s.k} onClick={() => setStatus(status === s.k ? "" : s.k)}>{s.label} ({counts[s.k] ?? 0})</button>
          ))}
        </div>
        <span className="ad-count muted">แสดง {fmt(rows.length)} รายการ</span>
      </div>
      <State loading={loading && !data} error={data ? "" : error} empty={rows.length === 0} emptyText="ไม่พบรายการ">
        {desktop ? (
          <div className="ad-card ad-tablecard">
            <table className="ad-table">
              <thead><tr><th>ผู้ถือหุ้น</th><th>หุ้น</th><th>ติดต่อ</th><th>สถานะ</th><th>OTP</th><th>IP</th><th>ลงทะเบียนเมื่อ</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><div className="ad-who"><Avatar name={r.name} size={34} /><div><b>{r.name || "-"}</b><div className="muted mono">{r.account_id}</div></div></div></td>
                    <td><b>{fmt(r.shares)}</b></td>
                    <td>{r.phone}<div className="muted" style={{ fontSize: 11 }}>{r.email}</div></td>
                    <td><span className={meta(r.status)?.cls ?? "badge"}>{meta(r.status)?.label ?? r.status}</span></td>
                    <td>{r.otp_verified ? <span className="badge badge-green">ยืนยันแล้ว</span> : <span className="badge">ยังไม่ยืนยัน</span>}</td>
                    <td className="mono">{r.ip}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.registered_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="ad-list">
            {rows.map((r) => (
              <li key={r.id} className={`ad-orow${r.status === "pending" ? " warn" : ""}`}>
                <div className="ad-orow-t"><div><b>{r.name || "-"}</b><div className="muted" style={{ fontSize: 12 }}>{r.account_id}</div></div>
                  <div style={{ textAlign: "right" }}><b className="c-blue">{fmt(r.shares)}</b><div className="muted" style={{ fontSize: 11 }}>หุ้น</div></div></div>
                <div className="ad-pills">
                  <span className={meta(r.status)?.cls ?? "badge"}>{meta(r.status)?.label ?? r.status}</span>
                  <span className={r.otp_verified ? "badge badge-green" : "badge"}>{r.otp_verified ? "OTP ยืนยันแล้ว" : "OTP ยังไม่ยืนยัน"}</span>
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

export default function Page() { return <AdminFrame title="ลงทะเบียนออนไลน์"><Body /></AdminFrame>; }
