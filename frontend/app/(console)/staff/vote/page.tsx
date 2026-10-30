"use client";
import { Icon, type IconName } from "@/components/brand/Icon";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, CHOICE_LABEL, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Agenda, Choice, HolderItem, Meeting, Summary, VoteRow } from "@/lib/types";
import { TallyPanel } from "@/components/TallyPanel";
import { Ctx, fetchHolder, HolderCard, HolderPicker, StaffPage, StModal, styles } from "@/components/staff/common";

export default function VotePage() {
  return <StaffPage title="ลงคะแนนแทน" sub="บันทึกการลงคะแนนเสียงให้ผู้ถือหุ้นที่ไม่สะดวกใช้ระบบด้วยตนเอง">{(c) => <Suspense fallback={null}><Vote {...c} /></Suspense>}</StaffPage>;
}

const CHOICES: { c: Choice; cls: string; icon: IconName }[] = [
  { c: "agree", cls: styles.cAgree, icon: "thumbUp" }, { c: "disagree", cls: styles.cDisagree, icon: "thumbDown" },
  { c: "abstain", cls: styles.cAbstain, icon: "hand" }, { c: "spoiled", cls: styles.cSpoiled, icon: "ballotX" },
];
const STATUS: Record<string, string> = { pending: "รอเปิด", open: "เปิดโหวต", closed: "ปิดแล้ว" };

const splitText = (v: VoteRow) => [
  v.agree > 0 && `เห็นด้วย ${fmt(v.agree)}`, v.disagree > 0 && `ไม่เห็นด้วย ${fmt(v.disagree)}`,
  v.abstain > 0 && `งดออกเสียง ${fmt(v.abstain)}`, v.spoiled > 0 && `บัตรเสีย ${fmt(v.spoiled)}`,
].filter(Boolean).join(" · ");

function Vote({ canWrite, toast }: Ctx) {
  const { data: agendas, loading, error } = useApi<Agenda[]>("/api/agendas", "staff", 4000);
  const { data: summary } = useApi<Summary>("/api/summary", "staff", 10000);
  const { data: meeting } = useApi<Meeting>("/api/meeting");
  const advance = !!meeting?.advance_entry;
  const [splitMode, setSplitMode] = useState(false);
  const [sp, setSp] = useState({ disagree: "", abstain: "", spoiled: "" });
  const [sel, setSel] = useState("");
  const [holder, setHolder] = useState<HolderItem | null>(null);
  const accParam = useSearchParams().get("acc") ?? "";
  useEffect(() => {
    if (!accParam) return;
    let live = true;
    fetchHolder(accParam).then((x) => { if (live && x) setHolder(x); }).catch(() => {});
    return () => { live = false; };
  }, [accParam]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { data: history, reload: reloadHistory } = useApi<VoteRow[]>(holder ? `/api/vote/onsite/${encodeURIComponent(holder.account_id)}` : null, "staff", 4000);

  const termId = agendas && agendas.length > 0
    ? (agendas.some((a) => a.term_id === sel) ? sel : (agendas.find((a) => a.status === "open" && a.vote_type !== "info") ?? agendas[0]).term_id)
    : "";

  const agenda = agendas?.find((a) => a.term_id === termId);
  const votable = !!agenda && agenda.vote_type !== "info" && (agenda.status === "open" || (advance && agenda.status === "pending"));
  const row = history?.find((v) => v.term_id === termId);
  const noRight = !!history && !row; // no regissub row for this agenda
  const canVote = canWrite && votable && !!holder && !!row && row.shares > 0;
  const full = row?.shares ?? holder?.shares ?? 0;
  const spN = { d: Number(sp.disagree) || 0, a: Number(sp.abstain) || 0, s: Number(sp.spoiled) || 0 };
  const spAgree = full - spN.d - spN.a - spN.s;
  const splitOk = [spN.d, spN.a, spN.s].every((x) => Number.isInteger(x) && x >= 0) && spAgree >= 0;
  const ready = splitMode ? splitOk : !!choice;
  const tr = summary?.terms.find((t) => t.term_id === termId);
  const idx = agendas ? agendas.findIndex((a) => a.term_id === termId) + 1 : 0;

  async function submit() {
    if (!holder || !agenda || !ready) return;
    setBusy(true);
    try {
      const overwrite = !!row?.voted; // the confirm dialog already warned about replacing the earlier vote
      const body = splitMode
        ? { account_id: holder.account_id, term_id: agenda.term_id, overwrite, split: { agree: spAgree, disagree: spN.d, abstain: spN.a, spoiled: spN.s } }
        : { account_id: holder.account_id, term_id: agenda.term_id, overwrite, choice };
      await api("/api/vote/onsite", { method: "POST", body });
      toast(splitMode ? "บันทึกการแบ่งคะแนนแล้ว" : `บันทึกคะแนน "${CHOICE_LABEL[choice!]}" แล้ว`);
      setConfirming(false); setChoice(null); setSp({ disagree: "", abstain: "", spoiled: "" });
      await reloadHistory();
    } catch (e) { toast(errMsg(e), true); setConfirming(false); }
    finally { setBusy(false); }
  }

  async function clearVote() {
    if (!holder || !agenda) return;
    setBusy(true);
    try {
      await api(`/api/vote/onsite/${encodeURIComponent(holder.account_id)}/${encodeURIComponent(agenda.term_id)}`, { method: "DELETE" });
      toast("ล้างคะแนนแล้ว — ผู้ถือหุ้นกลับเป็น \"ยังไม่ลง\"");
      setClearing(false);
      await reloadHistory();
    } catch (e) { toast(errMsg(e), true); setClearing(false); }
    finally { setBusy(false); }
  }

  if (loading) return <p className={styles.empty}>กำลังโหลดวาระ...</p>;
  if (error) return <p className={styles.errText}>{error}</p>;
  if (agendas && agendas.length === 0) return <p className={styles.empty}>ยังไม่มีวาระ</p>;
  if (!agendas || !agenda) return null;

  const entitled = tr?.eligible_holders ?? 0; // head count of holders entitled to vote (0 = none registered / not reported)
  const progress = tr && entitled > 0 ? Math.min(100, (tr.voted_count / entitled) * 100) : 0;
  const voteOf = (t: string) => history?.find((v) => v.term_id === t);

  return (
    <>
      <div className={styles.voteWrap}>
        {/* 1: agenda status */}
        <div className={`${styles.card} ${styles.vArea1}`}>
          <div className={styles.cardTitle}>{agenda.status === "open" ? "วาระที่กำลังเปิดอยู่" : "สถานะวาระปัจจุบัน"}</div>
          <div className={styles.muted}>วาระที่ {agenda.term_id} / {agendas.length}</div>
          <div style={{ fontWeight: 700, fontSize: 16, margin: "2px 0 6px" }}>
            {agenda.name}{" "}
            <span className={`${styles.tag} ${agenda.status === "open" ? styles.tGreen : agenda.status === "closed" ? styles.tRed : ""}`}>{STATUS[agenda.status]}</span>
            {agenda.vote_type === "info" && <span className={`${styles.tag} ${styles.tBlue}`} style={{ marginLeft: 6 }}>เพื่อทราบ</span>}
          </div>
          {tr && agenda.vote_type !== "info" && (
            <>
              {entitled > 0 && <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="ความคืบหน้า"><span style={{ width: `${progress}%` }} /></div>}
              <div className={styles.row} style={{ justifyContent: "space-between" }}>
                <span className={styles.muted}>ลงคะแนนแล้ว <b style={{ color: "var(--ink)" }}>{fmt(tr.voted_count)}</b>{entitled > 0 ? <> จาก {fmt(entitled)}</> : null} ราย</span>
                {entitled > 0 && <span className={styles.muted}>{Math.round(progress)}%</span>}
              </div>
            </>
          )}
          {tr && agenda.vote_type !== "info" && <TallyPanel t={tr} />}
          {advance && agenda.status === "pending" && votable && <p className={styles.errText} style={{ marginTop: 6 }}>โหมดเตรียมงาน: คีย์คะแนนล่วงหน้าได้ (วาระยังไม่เปิดให้ผู้ถือหุ้นออนไลน์ลงคะแนน)</p>}
          {!votable && <p className={styles.muted} style={{ marginTop: 6 }}>{agenda.vote_type === "info" ? "วาระนี้เป็นการรับทราบ ไม่มีการลงคะแนน" : "วาระนี้ไม่ได้เปิดรับการลงคะแนน"}</p>}
        </div>

        {/* 2: holder */}
        <div className={`${styles.card} ${styles.vArea2}`}>
          <div className={styles.cardTitle}>{holder ? "ผู้ถือหุ้นที่เลือก" : "ค้นหาผู้ถือหุ้น"}</div>
          {!holder ? (
            <HolderPicker label="ผู้ถือหุ้นที่ลงทะเบียนเข้าร่วมแล้ว" filter={(h) => h.status === "onsite"} actionLabel="เลือก" onPick={(h) => { setHolder(h); setChoice(null); setSplitMode(false); setSp({ disagree: "", abstain: "", spoiled: "" }); }} />
          ) : (
            <HolderCard h={holder}><button className={`${styles.btn} ${styles.sm}`} onClick={() => { setHolder(null); setChoice(null); setSplitMode(false); setSp({ disagree: "", abstain: "", spoiled: "" }); }}>เปลี่ยน</button></HolderCard>
          )}
          <p className={styles.muted} style={{ marginTop: 10 }}>ลงคะแนนแทนได้เฉพาะผู้ถือหุ้นที่เจ้าหน้าที่ลงทะเบียนให้ที่หน้างาน (ผู้ที่ลงทะเบียนออนไลน์ลงคะแนนเองผ่านระบบ)</p>
        </div>

        {/* 3: voting */}
        <div className={`${styles.card} ${styles.vArea3}`}>
          <div className={styles.cardTitle}>เลือกวาระที่ต้องการลงคะแนน</div>
          <div className={styles.agTabs} role="tablist" aria-label="วาระ">
            {agendas.map((a) => {
              const v = voteOf(a.term_id);
              return (
                <button key={a.term_id} role="tab" aria-selected={a.term_id === termId} className={`${styles.agTab} ${a.term_id === termId ? styles.agTabOn : ""}`} onClick={() => { setSel(a.term_id); setChoice(null); }}>
                  {a.status === "open" && <span aria-hidden className="ico-dot" style={{ marginRight: 6 }} />}วาระ {a.term_id}{v?.voted && <span className={styles.agDone}> <Icon name="check" size={13} className="ico-inl" /></span>}
                </button>
              );
            })}
          </div>
          <div style={{ margin: "12px 0 14px" }}>
            <b>วาระที่ {agenda.term_id}</b> <span className={styles.muted}>— {agenda.name}</span>
            {holder && row && <div className={styles.muted} style={{ marginTop: 2 }}>{fmt(row.shares)} หุ้น{row.voted && <> · <span className={`${styles.tag} ${styles.tGreen}`}>ลงแล้ว: {row.choice === "split" ? splitText(row) : CHOICE_LABEL[row.choice]}</span>{canWrite && votable && <> <button type="button" className={`${styles.btn} ${styles.sm}`} onClick={() => setClearing(true)} disabled={busy}>ล้างคะแนน</button></>}</>}</div>}
          </div>
          {holder && holder.status !== "onsite" && <p className={styles.errText} style={{ marginBottom: 8 }}>{holder.status === "online" ? "ผู้ถือหุ้นรายนี้ลงทะเบียนออนไลน์ — ลงคะแนนเองผ่านระบบ (หรือให้เจ้าหน้าที่กด \"เปลี่ยนเป็น Onsite\" ที่หน้าค้นหาก่อน)" : "ผู้ถือหุ้นรายนี้ยังไม่ได้ลงทะเบียน — ลงทะเบียนก่อนจึงจะลงคะแนนแทนได้"}</p>}
          {holder && holder.status === "onsite" && (noRight || (row && row.shares === 0)) && <p className={styles.errText} style={{ marginBottom: 8 }}>ผู้ถือหุ้นรายนี้ไม่มีสิทธิ์ลงคะแนนในวาระนี้</p>}
          {!holder && <p className={styles.muted} style={{ marginBottom: 10 }}>เลือกผู้ถือหุ้นก่อนจึงจะลงคะแนนได้</p>}
          {canVote && (
            <label className={styles.check} style={{ marginBottom: 10 }}>
              <input type="checkbox" checked={splitMode} onChange={(e) => { setSplitMode(e.target.checked); setChoice(null); }} />
              <span>แบ่งคะแนนเสียง (คัสโตเดียน / บัญชีเดียวที่ลงคะแนนหลายแบบ)</span>
            </label>
          )}
          {splitMode && canVote ? (
            <div className={styles.card} style={{ marginBottom: 6 }}>
              {([["เห็นด้วย", null], ["ไม่เห็นด้วย", "disagree"], ["งดออกเสียง", "abstain"], ["บัตรเสีย", "spoiled"]] as const).map(([label, key]) => (
                <div key={label} className={styles.row} style={{ justifyContent: "space-between", margin: "6px 0" }}>
                  <span>{label}</span>
                  {key
                    ? <input className={styles.numIn} type="number" min={0} inputMode="numeric" aria-label={`จำนวนหุ้น ${label}`} value={sp[key]} placeholder="0" onChange={(e) => setSp((x) => ({ ...x, [key]: e.target.value }))} />
                    : <b style={{ minWidth: 90, textAlign: "right" }}>{fmt(Math.max(0, spAgree))}</b>}
                </div>
              ))}
              <p className={splitOk ? styles.muted : styles.errText}>{splitOk ? `รวม ${fmt(full)} หุ้น — เห็นด้วยคำนวณจากส่วนที่เหลือ` : `จำนวนเกินหุ้นที่ถือ (${fmt(full)} หุ้น)`}</p>
            </div>
          ) : (
            <div className={styles.choices}>
              {CHOICES.map(({ c, cls, icon }) => (
                <button key={c} className={`${styles.choice} ${cls} ${choice === c ? styles.choiceSel : ""}`} disabled={!canVote || busy} aria-pressed={choice === c} onClick={() => setChoice(c)}>
                  <i aria-hidden><Icon name={icon} size={30} /></i>{CHOICE_LABEL[c]}
                </button>
              ))}
            </div>
          )}
          <p className={styles.muted} style={{ marginTop: 10 }}>หมายเหตุ: ผู้ถือหุ้นที่ไม่ลงคะแนนจะถูกนับเป็น &quot;เห็นด้วย&quot; โดยอัตโนมัติ{row?.voted && canVote ? " · การลงคะแนนใหม่จะเขียนทับคะแนนเดิม" : ""}</p>
          <div className={`${styles.sharesBox} ${styles.sharesRow} ${styles.tableHideM}`} style={{ marginTop: 14 }}>
            <span><small>จำนวนหุ้นที่ใช้ลงคะแนน</small><b>{row ? fmt(row.shares) : holder ? fmt(holder.shares) : "-"} หุ้น</b></span>
            <button className={`${styles.btn} ${styles.bPri}`} disabled={!canVote || !ready || busy} onClick={() => setConfirming(true)}><Icon name="check" size={16} className="ico-inl" />บันทึกการลงคะแนน</button>
          </div>
        </div>

        {/* 4: history */}
        {holder && history && (
          <div className={`${styles.card} ${styles.vArea4}`}>
            <div className={styles.cardTitle}>ประวัติลงคะแนน</div>
            <div className={styles.tableScroll}>
              <table className={styles.tbl} style={{ minWidth: 0 }}>
                <thead><tr><th>วาระ</th><th>ชื่อวาระ</th><th>ผล</th></tr></thead>
                <tbody>
                  {history.map((v) => (
                    <tr key={v.term_id}>
                      <td>{v.term_id}</td><td>{v.name}</td>
                      <td>{v.voted ? <span className={`${styles.tag} ${styles.tGreen}`} style={{ whiteSpace: "normal" }}>{v.choice === "split" ? splitText(v) : CHOICE_LABEL[v.choice]}</span> : <span className={styles.tag}>{v.shares === 0 ? "ไม่มีสิทธิ์" : "ยังไม่ลง"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className={`${styles.actionBar} ${styles.mobileOnly}`}>
        <button className={`${styles.btn} ${styles.bPri}`} disabled={!canVote || !ready || busy} onClick={() => setConfirming(true)}>
          {ready ?`ยืนยันการลงคะแนน วาระ ${agenda.term_id}` : "เลือกผลการลงคะแนน"}
        </button>
      </div>

      {clearing && holder && (
        <StModal title="ล้างคะแนนที่ลงไว้" onClose={() => !busy && setClearing(false)}
          actions={<><button className={styles.btn} onClick={() => setClearing(false)} disabled={busy}>ยกเลิก</button><button className={`${styles.btn} ${styles.bPri}`} onClick={clearVote} disabled={busy}>{busy ? "กำลังล้าง..." : "ล้างคะแนน"}</button></>}>
          <p>{holder.name} ({holder.account_id})</p>
          <p>วาระ {agenda.term_id}: {agenda.name}</p>
          <p className={styles.errText}>คะแนนที่ลงไว้ ({row ? (row.choice === "split" ? splitText(row) : CHOICE_LABEL[row.choice]) : "-"}) จะถูกลบ และผู้ถือหุ้นจะกลับเป็น &quot;ยังไม่ลง&quot; การกระทำนี้ถูกบันทึกใน Audit</p>
        </StModal>
      )}

      {confirming && ready && holder && (
        <StModal title="ยืนยันการลงคะแนน" onClose={() => !busy && setConfirming(false)}
          actions={<><button className={styles.btn} onClick={() => setConfirming(false)} disabled={busy}>ยกเลิก</button><button className={`${styles.btn} ${styles.bPri}`} onClick={submit} disabled={busy}>{busy ? "กำลังบันทึก..." : "ยืนยัน"}</button></>}>
          <p>{holder.name} ({holder.account_id})</p>
          <p>วาระ {agenda.term_id}: {agenda.name}</p>
          {row?.voted && <p className={styles.errText}>⚠ ผู้ถือหุ้นรายนี้ลงคะแนนในวาระนี้แล้ว ({row.choice === "split" ? splitText(row) : CHOICE_LABEL[row.choice]}) — การบันทึกจะเขียนทับคะแนนเดิม</p>}
          {splitMode
            ? <p style={{ fontSize: 16, fontWeight: 700, margin: "6px 0" }}>เห็นด้วย {fmt(spAgree)} · ไม่เห็นด้วย {fmt(spN.d)} · งดออกเสียง {fmt(spN.a)} · บัตรเสีย {fmt(spN.s)}</p>
            : <p style={{ fontSize: 22, fontWeight: 700, margin: "6px 0" }}>{CHOICE_LABEL[choice!]}</p>}
        </StModal>
      )}
    </>
  );
}
