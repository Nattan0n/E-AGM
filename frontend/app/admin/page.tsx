"use client";
import { Icon } from "@/components/brand/Icon";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/hooks";
import { fmt } from "@/lib/api";
import { useIsDesktop } from "@/lib/media";
import type { AuditRow, Summary, TermResult } from "@/lib/types";
import { AdminFrame, ClosedBanner, Live, PageHead, ResultBar, ResultChip, State } from "@/components/admin/common";

const LINKS = [
  { href: "/admin/vote-control", label: "เปิด/ปิดลงคะแนน", icon: "vote", c: "#dbeafe" },
  { href: "/admin/export", label: "ส่งออกรายงาน", icon: "upload", c: "#dcfce7" },
  { href: "/admin/audit", label: "ดู Audit Log", icon: "search", c: "#cffafe" },
  { href: "/admin/users", label: "จัดการผู้ใช้งาน", icon: "users", c: "#ede9fe" },
];

function useClock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => setT(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    f();
    const i = setInterval(f, 15000);
    return () => clearInterval(i);
  }, []);
  return t;
}

function TermRow({ t }: { t: TermResult }) {
  const started = t.status !== "pending";
  return (
    <li className={`adm-trow${t.status === "open" ? " live" : ""}`}>
      <span className="adm-num">{t.term_id}</span>
      <div className="adm-tname"><b>{t.name}</b></div>
      <span className="adm-tchip"><ResultChip t={t} /></span>
      <div className="adm-tbar">
        {started ? (<><span className="adm-pct">{t.agree_pct.toFixed(1)}%</span><ResultBar t={t} /></>) : <span className="muted">—</span>}
      </div>
      <span className="adm-tcnt">{started ? fmt(t.voted_count) : ""}</span>
    </li>
  );
}

function Activity() {
  const { data } = useApi<{ items: AuditRow[] }>("/api/admin/audit?limit=6&offset=0", "staff", 10000);
  return (
    <div className="adm-card">
      <div className="adm-card-h">กิจกรรมล่าสุด</div>
      <ul className="adm-feed">
        {(data?.items ?? []).map((r) => (
          <li key={r.id}>
            <span className="adm-feed-dot">{(r.action || "?").slice(0, 2).toUpperCase()}</span>
            <div><b>{r.action}</b><small>{r.acc_id || r.ip}</small></div>
            <time>{r.created_at.slice(-8, -3) || r.created_at}</time>
          </li>
        ))}
        {data && data.items.length === 0 && <li className="muted">ยังไม่มีกิจกรรม</li>}
      </ul>
    </div>
  );
}

function Body() {
  const desktop = useIsDesktop();
  const { data, error, loading } = useApi<Summary>("/api/summary", "staff", 5000);
  const clock = useClock();
  const st = data?.stats;
  const doneN = data?.terms.filter((t) => t.status === "closed").length ?? 0;
  const openN = data?.terms.filter((t) => t.status === "open").length ?? 0;
  const closedMeeting = !!data?.meeting.closed_at;
  const sub = data ? `${data.meeting.detail || `การประชุมผู้ถือหุ้น ปี ${data.meeting.year}`}${data.meeting.date ? ` · ${data.meeting.date}` : ""}` : undefined;

  return (
    <>
      <PageHead title="Dashboard" sub={sub} actions={<Live>LIVE</Live>} />
      <ClosedBanner meeting={data?.meeting} />
      <State loading={loading && !data} error={data ? "" : error}>
        {data && st && (
          <>
            <div className="adm-kpis adm-kpis-3">
              <div className="adm-kpi"><b className="c-blue">{st.quorum_pct.toFixed(1)}%</b><span>องค์ประชุม</span><small>{fmt(st.onsite_shares + st.online_shares)} / {fmt(st.total_shares)} หุ้น</small></div>
              <div className="adm-kpi"><b className="c-green">{fmt(st.onsite_count)}</b><span>Onsite</span><small>{fmt(st.onsite_shares)} หุ้น</small></div>
              <div className="adm-kpi"><b className="c-cyan">{fmt(st.online_count)}</b><span>Online</span><small>{fmt(st.online_shares)} หุ้น</small></div>
              <div className="adm-kpi"><b className="c-amber">{fmt(st.late_count)}</b><span>มาสาย</span><small>{fmt(st.late_shares)} หุ้น</small></div>
            </div>

            {!desktop && (
              <div className="hero-card lava">
                <div className="hc-label">สถานะองค์ประชุม</div>
                <div className="hc-big">{st.quorum_pct.toFixed(2)}%</div>
                <p className="hc-sub">{fmt(st.onsite_shares + st.online_shares)} / {fmt(st.total_shares)} หุ้น · ขั้นต่ำ {st.quorum_required_pct}%</p>
                <div className="adm-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, st.quorum_pct)} aria-label="องค์ประชุม">
                  <span style={{ width: `${Math.min(100, st.quorum_pct)}%` }} />
                  <i title={`เกณฑ์ ${st.quorum_required_pct}%`} style={{ left: `${Math.min(100, st.quorum_required_pct)}%` }} />
                </div>
                <div className="hc-chips">
                  <span>Onsite {fmt(st.onsite_count)} ราย</span>
                  <span>Online {fmt(st.online_count)} ราย</span>
                  <span>ทั้งหมด {fmt(st.holders)}</span>
                </div>
                <span className={st.quorum_reached ? "hc-ok" : "hc-bad"}>{st.quorum_reached ? "✓ ครบองค์ประชุม" : "ยังไม่ครบองค์ประชุม"}</span>
              </div>
            )}

            <div className="grid-2">
              <div className="adm-card">
                <div className="adm-card-h"><span>{desktop ? `สถานะวาระการประชุม — ${data.terms.length} วาระ` : "สถานะวาระการประชุม"}</span>
                  {!desktop && <Link href="/admin/vote-control" className="adm-link">จัดการ →</Link>}</div>
                {data.terms.length === 0 ? <div className="adm-card-b muted">ยังไม่มีวาระ</div> : (
                  <ul className="adm-tlist">{data.terms.map((t) => <TermRow key={t.id} t={t} />)}</ul>
                )}
              </div>

              <div className="adm-side">
                {desktop && (
                  <div className="adm-card">
                    <div className="adm-card-h">สถานะการประชุม</div>
                    <div className="adm-card-b">
                      <div className={`adm-status ${closedMeeting ? "off" : ""}`}><i /><span>{closedMeeting ? "ปิดการประชุมแล้ว" : "กำลังดำเนินการ"}</span><small>{data.meeting.date}</small></div>
                      <div className="adm-mini2">
                        <div><b>{doneN}/{data.terms.length}</b><small>วาระเสร็จสิ้น</small></div>
                        <div><b>{clock || "--:--"}</b><small>เวลาปัจจุบัน</small></div>
                      </div>
                      {openN > 0 && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>กำลังลงคะแนน {openN} วาระ</p>}
                    </div>
                  </div>
                )}
                <div className="adm-card">
                  <div className="adm-card-h adm-upper">Quick actions</div>
                  <nav aria-label="ทางลัด" className="adm-qas">
                    {LINKS.map((l) => (
                      <Link key={l.href} href={l.href} className="adm-qa"><span className="adm-qa-ic" style={{ background: l.c }} aria-hidden><Icon name={l.icon} size={22} style={{ color: "#1e3a8a" }} /></span>{l.label}</Link>
                    ))}
                  </nav>
                </div>
                {desktop && <Activity />}
              </div>
            </div>
          </>
        )}
      </State>
    </>
  );
}

export default function Page() { return <AdminFrame title="Dashboard"><Body /></AdminFrame>; }
