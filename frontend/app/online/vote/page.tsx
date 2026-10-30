"use client";
import { Icon } from "@/components/brand/Icon";
import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, CHOICE_LABEL, errMsg } from "@/lib/api";
import { Choice, OnlineAgenda } from "@/lib/types";
import { Modal } from "@/components/Modal";
import { OnlineShell } from "@/components/online/OnlineShell";
import { refreshMe, useHolderApi, useMe, holderLogout } from "@/components/online/hooks";
import s from "@/components/online/online.module.css";

const CHOICES: Choice[] = ["agree", "disagree", "abstain", "spoiled"];
const parentOf = (id: string) => id.split(".")[0];

interface Group { parent: string; head?: OnlineAgenda; subs: OnlineAgenda[] }

/** Holders who chose "staff votes for me" cannot vote here; they may switch back until the first online vote. */
function Gate({ children }: { children: ReactNode }) {
  const me = useMe()?.data;
  const router = useRouter();
  const roomClosed = !!me && !me.meeting.room_open;
  useEffect(() => { if (roomClosed) router.replace("/online/waiting"); }, [roomClosed, router]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (me?.vote_mode !== "staff") return <>{children}</>;
  const toSelf = async () => {
    setBusy(true); setErr("");
    try { await api("/api/online/vote-mode", { method: "PUT", body: { mode: "self" }, session: "holder" }); refreshMe(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className={`${s.cardc} ${s.staffbox}`}>
      <h3>เจ้าหน้าที่จะลงคะแนนแทนท่าน</h3>
      <p>ท่านเลือกให้เจ้าหน้าที่ลงคะแนนให้ในวันประชุม จึงไม่ต้องลงคะแนนในหน้านี้ กรุณาแจ้งเลขทะเบียน <b>{me.account_id}</b> ที่จุดลงทะเบียน</p>
      {err && <div className="error-text" role="alert">{err}</div>}
      <button type="button" className="btn btn-primary" onClick={toSelf} disabled={busy}>{busy ? "กำลังเปลี่ยน..." : "เปลี่ยนเป็นลงคะแนนด้วยตนเอง"}</button>
    </div>
  );
}

export default function OnlineVote() {
  const { data, error, loading, reload } = useHolderApi<OnlineAgenda[]>("/api/online/agendas", 4000);
  const [target, setTarget] = useState<{ a: OnlineAgenda; choice: Choice } | null>(null);
  const router = useRouter();
  const logout = () => { void holderLogout((p) => router.replace(p)); };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [voteErr, setVoteErr] = useState("");

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const a of data ?? []) {
      const p = parentOf(a.term_id);
      const g = m.get(p) ?? { parent: p, subs: [] };
      if (a.term_id === p) g.head = a; else g.subs.push(a);
      m.set(p, g);
    }
    return [...m.values()];
  }, [data]);

  const confirm = async () => {
    if (!target) return;
    setBusy(true); setVoteErr(""); setMsg("");
    try {
      await api("/api/online/vote", { method: "POST", body: { term_id: target.a.term_id, choice: target.choice }, session: "holder" });
      setMsg(`บันทึกคะแนนวาระ ${target.a.term_id} แล้ว`);
      setTarget(null);
    } catch (e) {
      setVoteErr(errMsg(e));
      setTarget(null);
    }
    setBusy(false);
    await reload();
  };

  const votable = (data ?? []).filter((a) => a.vote_type !== "info" && !a.novote);
  const votedN = votable.filter((a) => a.choice !== "").length;
  const pct = votable.length ? Math.round((votedN / votable.length) * 100) : 0;

  const card = (a: OnlineAgenda, sub: boolean) => {
    const locked = a.choice !== "";
    const canVote = a.status === "open" && a.vote_type !== "info" && !a.novote;
    let body: ReactNode;
    if (a.vote_type === "info") body = <div className={s.note}>รับทราบ - ไม่ต้องลงคะแนน</div>;
    else if (a.novote) body = <div className={s.note}>ไม่มีสิทธิ์ออกเสียง</div>;
    else if (locked || canVote) body = (
      <>
        <div className={`${s.choices} ${locked ? s.lockedset : ""}`} role="group" aria-label={`ลงคะแนนวาระ ${a.term_id}`}>
          {CHOICES.map((c) => (
            <button key={c} type="button" className={`${s.ch} ${s[c]} ${a.choice === c ? s.sel : ""}`} disabled={busy || locked}
              aria-pressed={a.choice === c} onClick={() => setTarget({ a, choice: c })}>{a.choice === c ? <Icon name="check" size={14} className="ico-inl" /> : null}{CHOICE_LABEL[c]}</button>
          ))}
        </div>
        {locked && <div className={s.lockednote}><Icon name="lock" size={13} className="ico-inl" />ลงคะแนนแล้ว: <b>{CHOICE_LABEL[a.choice]}</b> (เปลี่ยนแปลงไม่ได้)</div>}
      </>
    );
    else if (a.status === "pending") body = <div className={s.note}>ยังไม่เปิดลงคะแนน</div>;
    else body = <div className={s.note}>ปิดแล้ว - นับเป็นเห็นด้วย</div>;
    const badge = locked ? <span className={`${s.st} ${s.stDoneV}`}>ลงคะแนนแล้ว</span>
      : canVote ? <span className={`${s.st} ${s.stOpen}`}>เปิดลงคะแนน</span>
      : a.status === "closed" ? <span className={`${s.st} ${s.stDone}`}>ปิดแล้ว</span>
      : <span className={`${s.st} ${s.stWait}`}>{a.vote_type === "info" ? "รับทราบ" : "ยังไม่เปิด"}</span>;
    return (
      <div key={a.term_id} className={`${s.vcard} ${canVote && !locked ? s.vopen : ""} ${sub ? s.vsub : ""}`}>
        <div className={s.vhead}>
          <div className={s.vtitle}><small>วาระที่ {a.term_id}</small>{a.name}</div>
          {badge}
        </div>
        {body}
      </div>
    );
  };

  const footer = (
    <>
      <div className={s.barinfo}>
        <span>ลงคะแนนแล้ว <b>{votedN} / {votable.length}</b> วาระ</span>
        <small>เมื่อลงคะแนนแล้วไม่สามารถเปลี่ยนแปลงได้</small>
      </div>
      <Link href="/online/confirm" className={`btn btn-primary ${s.cta} ${s.barbtn}`}>ดูสรุปและใบยืนยัน →</Link>
    </>
  );

  return (
    <OnlineShell title="ลงคะแนนเสียง" step={3} back="/online/waiting" width="wide" auth onLogout={logout} footer={footer}
      right={<span className={s.live}><i />LIVE</span>}>
      <Gate>
      {loading && !data && <div className="muted">กำลังโหลด...</div>}
      {error && !data && <div className="error-text" role="alert">{error}</div>}
      {msg && <div className={s.okmsg} role="status">{msg}</div>}
      {voteErr && <div className="error-text" role="alert">{voteErr}</div>}
      <div className={`${s.cardc} ${s.vprog}`}>
        <div className={s.vprogtop}><span>ลงคะแนนแล้ว <b>{votedN} / {votable.length}</b> วาระ</span><b className={s.vpct}>{pct}%</b></div>
        <div className={s.track}><i style={{ width: `${pct}%` }} /></div>
      </div>
      <div className={s.info}><strong>การลงคะแนนเมื่อยืนยันแล้วไม่สามารถเปลี่ยนแปลงได้</strong>วาระที่ไม่ได้ลงคะแนนเมื่อปิดวาระ ระบบจะนับเป็นเห็นด้วย</div>
      <div className={s.vlist}>
        {groups.map((g) => (
          <div key={g.parent} className={s.vgroup}>
            {g.head && card(g.head, false)}
            {g.subs.length > 0 && (
              <div className={s.vsubs}>
                {!g.head && <div className={s.group}>วาระที่ {g.parent}</div>}
                {g.subs.map((a) => card(a, true))}
              </div>
            )}
          </div>
        ))}
        {data && data.length === 0 && <div className="muted">ยังไม่มีวาระ</div>}
      </div>

      {target && (
        <Modal title="ยืนยันการลงคะแนน" onClose={() => !busy && setTarget(null)}
          actions={<>
            <button type="button" className="btn" disabled={busy} onClick={() => setTarget(null)}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>{busy ? "กำลังบันทึก..." : "ยืนยัน"}</button>
          </>}>
          <p style={{ fontSize: 14 }}>วาระ {target.a.term_id} {target.a.name}</p>
          <p style={{ marginTop: 8 }}>ท่านเลือก: <b>{CHOICE_LABEL[target.choice]}</b></p>
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>เมื่อยืนยันแล้วจะไม่สามารถเปลี่ยนแปลงได้</p>
        </Modal>
      )}
      </Gate>
    </OnlineShell>
  );
}
