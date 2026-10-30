"use client";
import { Icon } from "@/components/brand/Icon";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, CHOICE_LABEL, errMsg, fmt } from "@/lib/api";
import { Choice, HolderResults, OnlineAgenda } from "@/lib/types";
import { TallyPanel } from "@/components/TallyPanel";
import { Modal } from "@/components/Modal";
import { OnlineShell } from "@/components/online/OnlineShell";
import { refreshMe, useHolderApi, useMe, holderLogout, type Me } from "@/components/online/hooks";
import s from "@/components/online/online.module.css";

const CHOICES: Choice[] = ["agree", "disagree", "abstain", "spoiled"];

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
  const me = useHolderApi<Me>("/api/online/me").data; // this component renders the shell, so the shell's context is not available here
  const results = useHolderApi<HolderResults>("/api/online/results", 5000).data;
  const { data, error, loading, reload } = useHolderApi<OnlineAgenda[]>("/api/online/agendas", 4000);
  const [target, setTarget] = useState<{ a: OnlineAgenda; choice: Choice } | null>(null);
  const router = useRouter();
  const logout = () => { void holderLogout((p) => router.replace(p)); };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [voteErr, setVoteErr] = useState("");

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

  const all = data ?? [];
  const [pick, setPick] = useState("");
  const current = all.find((x) => x.term_id === pick)
    ?? all.find((x) => x.status === "open" && x.vote_type !== "info" && !x.novote && x.choice === "")
    ?? all.find((x) => x.status === "open") ?? all[0];

  const bigCls: Record<Choice, string> = { agree: s.bcAgree, disagree: s.bcDisagree, abstain: s.bcAbstain, spoiled: s.bcSpoiled };
  const bigIcon: Record<Choice, "thumbUp" | "thumbDown" | "hand" | "ballotX"> = { agree: "thumbUp", disagree: "thumbDown", abstain: "hand", spoiled: "ballotX" };
  const panel = (a: OnlineAgenda) => {
    const locked = a.choice !== "";
    const canVote = a.status === "open" && a.vote_type !== "info" && !a.novote;
    if (a.vote_type === "info") return <div className={s.note}>รับทราบ - ไม่ต้องลงคะแนน</div>;
    if (a.novote) return <div className={s.note}>ไม่มีสิทธิ์ออกเสียง</div>;
    if (!locked && !canVote) return <div className={s.note}>{a.status === "pending" ? "ยังไม่เปิดลงคะแนน" : "ปิดแล้ว - นับเป็นเห็นด้วย"}</div>;
    return (
      <>
        <div className={s.bigs} role="group" aria-label={`ลงคะแนนวาระ ${a.term_id}`}>
          {CHOICES.map((c) => (
            <button key={c} type="button" className={`${s.bc} ${bigCls[c]} ${a.choice === c ? s.picked : ""}`} disabled={busy || locked} aria-pressed={a.choice === c} onClick={() => setTarget({ a, choice: c })}>
              <Icon name={bigIcon[c]} size={28} />{CHOICE_LABEL[c]}
            </button>
          ))}
        </div>
        {locked && <div className={s.lockednote} style={{ marginTop: 12 }}><Icon name="lock" size={13} className="ico-inl" />ลงคะแนนแล้ว: <b>{CHOICE_LABEL[a.choice]}</b> (เปลี่ยนแปลงไม่ได้)</div>}
      </>
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
      {all.length > 0 && current && (
        <div className={s.cardc}>
          <div className={s.vme}><span className="muted">{me?.name}</span><span>สิทธิ์ลงคะแนน <b>{fmt(me?.shares ?? 0)}</b> หุ้น</span></div>
          <div className={s.vtabs} role="tablist" aria-label="วาระ" style={{ marginTop: 12 }}>
            {all.map((x) => (
              <button key={x.term_id} role="tab" aria-selected={x.term_id === current.term_id} className={`${s.vtab} ${x.term_id === current.term_id ? s.on : ""}`} onClick={() => setPick(x.term_id)}>
                {x.status === "open" && x.vote_type !== "info" && x.choice === "" && !x.novote && <i className={s.dot} aria-hidden />}วาระ {x.term_id}{x.choice !== "" && <Icon name="check" size={13} className={`ico-inl ${s.done}`} />}
              </button>
            ))}
          </div>
          <div className={s.vsel}><small>วาระที่ {current.term_id}</small><b>{current.name}</b></div>
          {panel(current)}
          {(() => { const r = results?.published ? results.terms.find((x) => x.term_id === current.term_id) : undefined; return r && r.vote_type !== "info" ? <TallyPanel t={r} /> : null; })()}
        </div>
      )}
      {data && data.length === 0 && <div className="muted">ยังไม่มีวาระ</div>}

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
