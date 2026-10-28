"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { api, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Agenda, GroupItem, GroupMember, HolderItem, Meeting, NovoteRow, VoteRow } from "@/lib/types";
import { Ctx, fetchHolder, HolderCard, HolderPicker, StaffPage, styles } from "@/components/staff/common";
import { Barcode } from "@/components/staff/Barcode";
import b from "./ballots.module.css";

export default function BallotsPage() {
  return (
    <StaffPage title="พิมพ์บัตรลงคะแนน" sub="พิมพ์ใบลงทะเบียนและบัตรลงคะแนนรายวาระให้ผู้ถือหุ้นที่ลงทะเบียนหน้างาน ก่อนเข้าห้องประชุม">
      {(c) => <Suspense fallback={<p className={styles.empty}>กำลังโหลด...</p>}><Ballots {...c} /></Suspense>}
    </StaffPage>
  );
}

const TYPE: Record<string, string> = { ordinary: "มติทั่วไป (เสียงข้างมาก)", special: "มติพิเศษ (3 ใน 4)", unanimous: "มติเอกฉันท์", info: "รับทราบ (ไม่ต้องลงมติ)" };

interface Person { account_id: string; name: string; shares: number; note: string }

function Ballots({ toast }: Ctx) {
  useEffect(() => { document.body.classList.add("print-ballots"); return () => document.body.classList.remove("print-ballots"); }, []);
  const params = useSearchParams();
  const acc = params.get("acc") ?? "";
  const gid = params.get("group") ?? "";
  const [h, setH] = useState<HolderItem | null>(null);
  const [loading, setLoading] = useState(!!acc);
  const [slip, setSlip] = useState(true);
  const { data: agendas } = useApi<Agenda[]>("/api/agendas");
  const { data: meeting } = useApi<Meeting>("/api/meeting");
  const { data: rows } = useApi<VoteRow[]>(h && h.status === "onsite" ? `/api/vote/onsite/${encodeURIComponent(h.account_id)}` : null);
  const { data: members } = useApi<GroupMember[]>(gid ? `/api/registration/groups/${encodeURIComponent(gid)}` : null);
  const { data: groups } = useApi<GroupItem[]>(gid ? "/api/registration/groups" : null);
  const [noVote, setNoVote] = useState<Set<string>>(new Set()); // "term|account" pairs without voting rights

  useEffect(() => {
    if (!acc) return;
    let live = true;
    fetchHolder(acc).then((x) => { if (live) { if (x) setH(x); else toast("ไม่พบผู้ถือหุ้น " + acc, true); } })
      .catch((e) => toast(errMsg(e), true)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [acc, toast]);

  useEffect(() => {
    if (!agendas) return;
    let live = true;
    Promise.all(agendas.filter((a) => a.vote_type !== "info").map((a) => api<NovoteRow[]>(`/api/novote?term_id=${encodeURIComponent(a.term_id)}`).catch(() => [] as NovoteRow[])))
      .then((all) => { if (live) setNoVote(new Set(all.flat().map((n) => `${n.term_id}|${n.account_id}`))); });
    return () => { live = false; };
  }, [agendas]);

  const group = groups?.find((g) => String(g.id) === gid);
  let people: Person[] | null = null;
  if (gid) people = members ? members.map((m) => ({ account_id: m.account_id, name: m.name, shares: m.shares, note: `กลุ่ม ${group?.name ?? gid}` })) : null;
  else if (h && h.status === "onsite" && rows) people = [{ account_id: h.account_id, name: h.name, shares: rows[0]?.shares ?? h.shares, note: h.reg_type === "proxy" ? "ผู้รับมอบฉันทะ" : h.reg_type === "group" ? `กลุ่ม ${h.group_name ?? ""}` : "-" }];

  if (!gid && loading) return <p className={styles.empty}>กำลังโหลดข้อมูลผู้ถือหุ้น...</p>;
  if (!gid && !h) return <div className={styles.card}><HolderPicker onPick={setH} filter={(x) => x.status === "onsite"} actionLabel="เลือก" /></div>;

  const votable = (agendas ?? []).filter((a) => a.vote_type !== "info");
  const ready = !!people && people.length > 0 && !!agendas;
  const total = people ? people.length * votable.length : 0;
  const title = meeting?.detail ?? "ประชุมสามัญผู้ถือหุ้น";

  return (
    <>
      <div className={`${styles.card} ${b.noprint}`}>
        {gid ? (
          <p><b>{group?.name ?? `กลุ่ม #${gid}`}</b> · สมาชิก {members?.length ?? "-"} ราย</p>
        ) : h && <HolderCard h={h} />}
        {!gid && h && h.status !== "onsite" && <p className={styles.errText}>ผู้ถือหุ้นรายนี้ยังไม่ได้ลงทะเบียน Onsite — ลงทะเบียนหรือกด &quot;รับเข้าห้อง&quot; ก่อนจึงจะพิมพ์บัตรได้</p>}
        {ready && <p className={styles.muted}>พิมพ์บัตรลงคะแนน {total} ใบ ({people!.length} ราย × {votable.length} วาระ) · ข้ามวาระรับทราบ · ผู้ไม่มีสิทธิ์ในวาระใดจะมีลายน้ำ &quot;ไม่มีสิทธิ์ออกเสียง&quot; · 1 วาระต่อ 1 ใบ</p>}
        <label className={b.chk}><input type="checkbox" checked={slip} onChange={(e) => setSlip(e.target.checked)} /> พิมพ์ใบลงทะเบียนเข้าประชุม (ให้ผู้ถือหุ้นลงชื่อ) ด้วย</label>
      </div>
      <div className={`${styles.actionBar} ${b.noprint}`}>
        {!gid && <button className={styles.btn} onClick={() => setH(null)}>เลือกใหม่</button>}
        <button className={`${styles.btn} ${styles.bPri}`} disabled={!ready || total === 0} onClick={() => window.print()}><Icon name="print" size={16} className="ico-inl" />พิมพ์{slip ? "ใบลงทะเบียน + " : ""}บัตรทั้งหมด</button>
      </div>

      <div className={b.sheets}>
        {ready && slip && people!.map((p) => (
          <section key={`slip-${p.account_id}`} className={`${b.ballot} ${b.slip}`}>
            <header><b>ใบลงทะเบียนเข้าร่วมประชุม · {title}</b><span>{meeting?.date}</span></header>
            <div className={b.top}>
              <div className={b.who}>
                <div><small>ผู้ถือหุ้น</small><b>{p.name}</b></div>
                <div><small>จำนวนหุ้น</small><b>{fmt(p.shares)}</b></div>
              </div>
              <div className={b.bc}><Barcode value={p.account_id} /><small>{p.account_id}</small></div>
            </div>
            <div className={b.agenda}><small>ประเภทการเข้าร่วม</small><b>{p.note === "-" ? "มาด้วยตนเอง" : p.note}</b></div>
            <div className={b.sign}><span>ลงชื่อผู้ถือหุ้น / ผู้รับมอบฉันทะ</span><span>เจ้าหน้าที่</span></div>
          </section>
        ))}
        {ready && people!.flatMap((p) => votable.map((a) => {
          const denied = noVote.has(`${a.term_id}|${p.account_id}`);
          return (
            <section key={`${p.account_id}-${a.term_id}`} className={`${b.ballot} ${denied ? b.denied : ""}`}>
              <header>
                <b>บัตรลงคะแนน (Vote card) · {title}</b>
                <span>{meeting?.date}</span>
              </header>
              <div className={b.top}>
                <div className={b.who}>
                  <div><small>ผู้ถือหุ้น (Shareholder)</small><b>{p.name}</b></div>
                  <div><small>จำนวนหุ้น (Shares)</small><b>{fmt(p.shares)}</b></div>
                </div>
                <div className={b.bc}><Barcode value={p.account_id} /><small>{p.account_id}</small></div>
              </div>
              <div className={b.proxy}><small>ผู้รับมอบฉันทะ / กลุ่ม (Proxy, if any)</small><span>{p.note}</span></div>
              <div className={b.agenda}>
                <small>วาระที่ {a.term_id} · {TYPE[a.vote_type]}</small>
                <b>{a.name}</b>
                {a.name_en && <span>{a.name_en}</span>}
              </div>
              <p className={b.hint}>โปรดทำเครื่องหมาย (/) ลงในกรอบสี่เหลี่ยมที่ท่านต้องการลงมติ</p>
              <div className={b.boxes}>
                {[["เห็นด้วย", "In favor"], ["ไม่เห็นด้วย", "Against"], ["งดออกเสียง", "Abstain"]].map(([l, e]) => <div key={l}><i /><span>{l}<small>({e})</small></span></div>)}
              </div>
              <div className={b.sign}><span>ลงชื่อผู้ถือหุ้น / ผู้รับมอบฉันทะ</span><span>เจ้าหน้าที่</span></div>
              {denied && <div className={b.mark}>ไม่มีสิทธิ์ออกเสียง</div>}
            </section>
          );
        }))}
      </div>
    </>
  );
}
