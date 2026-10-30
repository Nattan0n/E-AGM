"use client";
import { Icon } from "@/components/brand/Icon";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errMsg, fmt } from "@/lib/api";
import { OnlineAgenda } from "@/lib/types";
import { OnlineShell } from "@/components/online/OnlineShell";
import { refreshMe, useHolderApi, useMe, holderLogout } from "@/components/online/hooks";
import { useIsDesktop } from "@/lib/media";
import s from "@/components/online/online.module.css";

const STATUS: Record<string, { cls: string; label: string }> = {
  open: { cls: s.stOpen, label: "กำลังลงคะแนน" },
  pending: { cls: s.stWait, label: "รอเปิด" },
  closed: { cls: s.stDone, label: "ปิดแล้ว" },
};

const two = (n: number) => String(n).padStart(2, "0");

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={s.clock}>{now ? `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}` : "--:--:--"}</span>;
}

function Today() {
  const [d, setD] = useState("");
  useEffect(() => { setD(new Date().toLocaleDateString("th-TH", { dateStyle: "full" })); }, []);
  return <span>{d || " "}</span>;
}

type AgState = { data: OnlineAgenda[] | null; error: string };

function Body({ ag, desktop }: { ag: AgState; desktop: boolean }) {
  const me = useMe()?.data ?? null;
  const agendas = ag.data ?? [];
  const votable = agendas.filter((a) => a.vote_type !== "info" && !a.novote);
  const anyOpen = votable.some((a) => a.status === "open");
  const voted = votable.filter((a) => a.choice !== "").length;
  const closed = agendas.filter((a) => a.status === "closed").length;
  const pct = agendas.length ? Math.round((closed / agendas.length) * 100) : 0;
  const st = me?.stats;
  const sharePct = me && st && st.total_shares > 0 ? (me.shares / st.total_shares) * 100 : 0;
  const openAg = agendas.find((a) => a.status === "open");
  const staffMode = me?.vote_mode === "staff";
  const [switching, setSwitching] = useState(false);
  const [swErr, setSwErr] = useState("");
  const toSelf = async () => {
    setSwitching(true); setSwErr("");
    try { await api("/api/online/vote-mode", { method: "PUT", body: { mode: "self" }, session: "holder" }); refreshMe(); }
    catch (e) { setSwErr(errMsg(e)); }
    setSwitching(false);
  };

  const noteText = me?.meeting.announcement ?? "";
  const docsUrl = me?.meeting.documents_url ?? "";
  const notice = (noteText || docsUrl) ? (
    <div className={s.lobbyMode} role="note" style={{ marginBottom: 12, flexWrap: "wrap" }}>
      <Icon name="warn" size={16} className="ico-inl" />
      {noteText && <span style={{ flex: "1 1 220px" }}>{noteText}</span>}
      {docsUrl && <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">เอกสารการประชุม ↗</a>}
    </div>
  ) : null;
  const hero = me && (
    <section className={`${s.hero} lava`}>
      <div className={s.heroname}>{me.name}</div>
      <div className={s.heroid}>เลขทะเบียน: {me.account_id}</div>
      <div className={s.herostats}>
        <div><span>จำนวนหุ้น</span><b>{fmt(me.shares)}</b><em>หุ้น</em></div>
        <div><span>วิธีลงคะแนน</span><b>{me.vote_mode === "staff" ? "เจ้าหน้าที่" : "ด้วยตนเอง"}</b><em>E-AGM</em></div>
        <div><span>% ของหุ้นทั้งหมด</span><b>{sharePct.toFixed(2)}%</b><em>ที่ถืออยู่</em></div>
      </div>
      <span className={s.herochip}><Icon name="check" size={13} className="ico-inl" />ลงทะเบียนออนไลน์แล้ว · {me.vote_mode === "staff" ? "เจ้าหน้าที่ลงคะแนนให้" : "ลงคะแนนด้วยตนเอง"}</span>
    </section>
  );

  const staffState = (
    <section className={`${s.cardc} ${s.staffbox}`}>
      <h3>เจ้าหน้าที่จะลงคะแนนแทนท่าน</h3>
      <p>ท่านเลือกให้เจ้าหน้าที่ลงคะแนนให้ในวันประชุม กรุณาแจ้งเลขทะเบียน <b>{me?.account_id}</b> และแสดงบัตรประชาชนที่จุดลงทะเบียน เจ้าหน้าที่จะตรวจสอบตัวตนและลงคะแนนตามเจตนาของท่าน</p>
      <div className={s.alertWait}><Icon name="users" size={20} /><span>ท่านจะไม่สามารถลงคะแนนผ่านระบบด้วยตนเองได้ ขณะอยู่ในโหมดนี้</span></div>
      {swErr && <div className="error-text" role="alert">{swErr}</div>}
      <button type="button" className="btn btn-block" onClick={toSelf} disabled={switching}>{switching ? "กำลังเปลี่ยน..." : "เปลี่ยนเป็นลงคะแนนด้วยตนเอง"}</button>
    </section>
  );

  const state = staffMode ? staffState : (
    <section className={`${s.cardc} ${s.statebox} ${anyOpen ? s.stateOpen : ""}`}>
      <div className={s.clockrow}>
        <Clock />
        <div className={s.clockmeta}><Today /><span>{me?.meeting.detail ?? "ประชุมสามัญผู้ถือหุ้น"}</span></div>
      </div>
      <div className={s.track} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      <div className={s.trackmeta}>
        <span>{openAg ? `วาระที่ ${openAg.term_id} กำลังดำเนินการ` : agendas.length ? "ยังไม่มีวาระที่เปิดลงคะแนน" : "-"}</span>
        <span>ดำเนินการแล้ว {pct}%</span>
      </div>
      {ag.data && (anyOpen
        ? <div className={s.alertOpen}><b>เปิดลงคะแนนแล้ว</b> — เข้าสู่หน้าลงคะแนนเพื่อออกเสียงในแต่ละวาระ</div>
        : <div className={s.alertWait}><span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}><Icon name="warn" size={20} /></span><span><b>กรุณาอยู่ที่หน้านี้</b> — เมื่อเจ้าหน้าที่เปิดวาระลงคะแนน ปุ่มลงคะแนนจะปรากฏโดยอัตโนมัติ (อัปเดตทุก 5 วินาที)</span></div>)}
      {anyOpen && <Link href="/online/vote" className={`btn btn-primary ${s.cta} ${s.deskonly}`}>เข้าสู่การลงคะแนน →</Link>}
    </section>
  );

  const quorum = st && (
    <section className={s.cardc}>
      <div className={s.cardh}>สถานะองค์ประชุม <span className={`badge ${st.quorum_reached ? "badge-green" : "badge-amber"}`}>{st.quorum_reached ? "องค์ประชุมครบ" : "ยังไม่ครบองค์ประชุม"}</span></div>
      <div className={s.qrow}><span>ผู้ถือหุ้นที่เข้าร่วมแล้ว</span><b className={st.quorum_reached ? s.good : s.warnc}>{st.quorum_pct.toFixed(2)}%</b></div>
      <div className={s.qbar}><i className={st.quorum_reached ? s.qOk : s.qWait} style={{ width: `${Math.min(100, st.quorum_pct)}%` }} /><u style={{ left: `${Math.min(100, st.quorum_required_pct)}%` }} /></div>
      <div className={s.qmeta}>
        <span>เข้าร่วมแล้ว <b>{fmt(st.onsite_count + st.online_count)}</b> ราย</span>
        <span>หุ้นที่เข้าประชุม <b>{fmt(st.onsite_shares + st.online_shares)}</b> หุ้น</span>
        <span>ต้องการ <b>{st.quorum_required_pct}%</b> ขึ้นไป</span>
      </div>
    </section>
  );

  const agenda = (
    <section className={s.agsec}>
      <div className={s.sec}>
        <span>วาระการประชุม ({agendas.length} วาระ)</span>
        {votable.length > 0 && <span className={s.secr}>ลงคะแนนแล้ว {voted}/{votable.length}</span>}
      </div>
      {ag.error && !ag.data && <div className="error-text" role="alert">{ag.error}</div>}
      <div className={s.rows}>
        {agendas.map((a) => {
          const b = STATUS[a.status] ?? STATUS.pending;
          return (
            <div key={a.term_id} className={`${s.row} ${a.status === "open" ? s.rowOpen : ""}`}>
              <span className={s.num}>{a.term_id}</span>
              <span className={s.rowtxt}>
                {a.name}
                {a.vote_type === "info" && <small>วาระรับทราบ</small>}
                {a.novote && <small>ไม่มีสิทธิ์ออกเสียง</small>}
              </span>
              <span className={`${s.st} ${b.cls}`}>{b.label}</span>
            </div>
          );
        })}
        {ag.data && agendas.length === 0 && <div className="muted">ยังไม่มีวาระ</div>}
      </div>
    </section>
  );

  const confirmLink = <div className={`${s.deskonly} ${s.noprint}`}><Link href="/online/confirm" className="btn btn-block">ดูใบยืนยันการลงคะแนน</Link></div>;
  const loading = !me && <div className="muted">กำลังโหลด...</div>;

  // Lobby: before an admin opens the room, holders (incl. early registrants) only see the meeting details.
  const lobby = me && !me.meeting.room_open && (
    <section className={`${s.cardc} ${s.statebox} ${s.lobby}`}>
      <span className={s.lobbyIcon} aria-hidden="true"><Icon name="clock" size={34} /></span>
      <h3>รอเปิดห้องประชุม</h3>
      <p>ท่านลงทะเบียนเรียบร้อยแล้ว เมื่อผู้ดูแลระบบเปิดห้องประชุม วาระการประชุมจะปรากฏที่หน้านี้โดยอัตโนมัติ ไม่ต้องรีเฟรช</p>
      <div className={s.clockrow}>
        <Clock />
        <div className={s.clockmeta}><Today /><span>{me.meeting.detail || "ประชุมสามัญผู้ถือหุ้น"}</span></div>
      </div>
      {me.meeting.date && <div className={s.lobbyDate}>กำหนดประชุม: {me.meeting.date}</div>}
      <div className={s.lobbyMode}>
        <Icon name={staffMode ? "users" : "vote"} size={16} className="ico-inl" />
        {staffMode ? "วิธีลงคะแนน: ผ่านบัตรลงคะแนน (เจ้าหน้าที่บันทึกให้) — แจ้งเลขทะเบียนที่จุดลงทะเบียน" : "วิธีลงคะแนน: ออนไลน์ด้วยตนเอง เมื่อห้องประชุมเปิด"}
      </div>
      <div className={s.lobbyLive}><i aria-hidden="true" />อัปเดตสถานะอัตโนมัติ</div>
    </section>
  );
  if (lobby) {
    return desktop ? (
      <>
        <div className="page-head"><div><h1>ห้องรอประชุม</h1><p className="muted">ยังไม่ถึงเวลาเปิดประชุม — ระบบจะเปิดให้อัตโนมัติเมื่อผู้ดูแลระบบเริ่มการประชุม</p></div></div>
        <div className={s.wgrid}>
          <div className={s.wleft}>{notice}{hero}</div>
          <aside className={s.wright}>{lobby}</aside>
        </div>
      </>
    ) : <>{notice}{hero}{lobby}</>;
  }

  if (desktop) {
    return (
      <>
        <div className="page-head"><div><h1>ห้องประชุมออนไลน์</h1><p className="muted">{staffMode ? "ลงทะเบียนแล้ว — แจ้งเลขทะเบียนที่จุดลงทะเบียน เจ้าหน้าที่จะลงคะแนนให้ท่าน" : "รอเจ้าหน้าที่เปิดวาระ แล้วเข้าไปลงคะแนนได้ทันที"}</p></div></div>
        {loading}
        <div className={s.wgrid}>
          <div className={s.wleft}>{notice}{hero}{agenda}</div>
          <aside className={s.wright}>{state}{quorum}{confirmLink}</aside>
        </div>
      </>
    );
  }
  return <>{loading}{notice}{hero}{state}{quorum}{agenda}{confirmLink}</>;
}

function MobileFooter({ ag }: { ag: AgState }) {
  const meNow = useMe()?.data;
  const staffMode = meNow?.vote_mode === "staff";
  const roomClosed = !!meNow && !meNow.meeting.room_open;
  const anyOpen = !staffMode && (ag.data ?? []).some((a) => a.status === "open" && a.vote_type !== "info" && !a.novote);
  return (
    <>
      {anyOpen
        ? <Link href="/online/vote" className={`btn btn-primary ${s.cta}`}>เข้าสู่การลงคะแนน →</Link>
        : <button type="button" className={`btn btn-primary ${s.cta}`} disabled>{roomClosed ? "รอเปิดห้องประชุม" : staffMode ? "เจ้าหน้าที่จะลงคะแนนให้ท่าน" : "รอเปิดวาระลงคะแนน"}</button>}
      <Link href="/online/confirm" className={s.linkbtn}>ดูใบยืนยันการลงคะแนน</Link>
      {meNow?.meeting.results_published && <Link href="/online/results" className={s.linkbtn}>ดูผลมติรายวาระ</Link>}
    </>
  );
}

export default function OnlineWaiting() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const ag = useHolderApi<OnlineAgenda[]>("/api/online/agendas", 5000);
  const logout = () => { void holderLogout((p) => router.replace(p)); };
  const footer = desktop ? undefined : <MobileFooter ag={ag} />;
  return (
    <OnlineShell title="ห้องประชุมออนไลน์" step={3} auth pollMs={5000} width="full" onLogout={logout} footer={footer}
      right={<button type="button" className={s.topbtn} onClick={logout}>ออกจากระบบ</button>}>
      <Body ag={ag} desktop={desktop} />
    </OnlineShell>
  );
}
