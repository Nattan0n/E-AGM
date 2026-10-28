"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Agenda, HolderItem, Meeting, VoteRow } from "@/lib/types";
import { Ctx, fetchHolder, HolderCard, HolderPicker, StaffPage, styles } from "@/components/staff/common";
import b from "./ballots.module.css";

export default function BallotsPage() {
  return (
    <StaffPage title="พิมพ์บัตรลงคะแนน" sub="พิมพ์บัตรลงคะแนนรายวาระให้ผู้ถือหุ้นที่ลงทะเบียนหน้างาน (เหมือนบัตรของระบบเดิม)">
      {(c) => <Suspense fallback={<p className={styles.empty}>กำลังโหลด...</p>}><Ballots {...c} /></Suspense>}
    </StaffPage>
  );
}

const TYPE: Record<string, string> = { ordinary: "มติทั่วไป (เสียงข้างมาก)", special: "มติพิเศษ (3 ใน 4)", unanimous: "มติเอกฉันท์", info: "รับทราบ" };

function Ballots({ toast }: Ctx) {
  const acc = useSearchParams().get("acc") ?? "";
  const [h, setH] = useState<HolderItem | null>(null);
  const [loading, setLoading] = useState(!!acc);
  const { data: agendas } = useApi<Agenda[]>("/api/agendas");
  const { data: meeting } = useApi<Meeting>("/api/meeting");
  const { data: rows } = useApi<VoteRow[]>(h && h.status === "onsite" ? `/api/vote/onsite/${encodeURIComponent(h.account_id)}` : null);

  useEffect(() => {
    if (!acc) return;
    let live = true;
    fetchHolder(acc).then((x) => { if (live) { if (x) setH(x); else toast("ไม่พบผู้ถือหุ้น " + acc, true); } })
      .catch((e) => toast(errMsg(e), true)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [acc, toast]);

  if (loading) return <p className={styles.empty}>กำลังโหลดข้อมูลผู้ถือหุ้น...</p>;
  if (!h) return <div className={styles.card}><HolderPicker onPick={setH} filter={(x) => x.status === "onsite"} actionLabel="เลือก" /></div>;

  const type = new Map((agendas ?? []).map((a) => [a.term_id, a.vote_type]));
  const cards = (rows ?? []).filter((r) => r.shares > 0 && type.get(r.term_id) !== "info");
  const ready = h.status === "onsite" && rows;

  return (
    <>
      <div className={`${styles.card} ${b.noprint}`}>
        <HolderCard h={h} />
        {h.status !== "onsite" && <p className={styles.errText}>ผู้ถือหุ้นรายนี้ยังไม่ได้ลงทะเบียน Onsite — ลงทะเบียนหรือกด &quot;รับเข้าห้อง&quot; ก่อนจึงจะพิมพ์บัตรได้</p>}
        {ready && <p className={styles.muted}>พิมพ์ได้ {cards.length} ใบ (ข้ามวาระรับทราบและวาระที่ไม่มีสิทธิ์ออกเสียง) · 1 วาระต่อ 1 หน้า</p>}
      </div>
      <div className={`${styles.actionBar} ${b.noprint}`}>
        <button className={styles.btn} onClick={() => setH(null)}>เลือกใหม่</button>
        <button className={`${styles.btn} ${styles.bPri}`} disabled={!ready || cards.length === 0} onClick={() => window.print()}><Icon name="print" size={16} className="ico-inl" />พิมพ์บัตรทั้งหมด</button>
      </div>

      <div className={b.sheets}>
        {ready && cards.map((r) => (
          <section key={r.term_id} className={b.ballot}>
            <header>
              <b>บัตรลงคะแนน · {meeting?.detail ?? "ประชุมสามัญผู้ถือหุ้น"}</b>
              <span>{meeting?.date}</span>
            </header>
            <div className={b.who}>
              <div><small>ผู้ถือหุ้น</small><b>{h.name}</b></div>
              <div><small>เลขทะเบียน</small><b>{h.account_id}</b></div>
              <div><small>จำนวนหุ้น</small><b>{fmt(r.shares)}</b></div>
            </div>
            <div className={b.agenda}>
              <small>วาระที่ {r.term_id} · {TYPE[type.get(r.term_id) ?? "ordinary"]}</small>
              <b>{r.name}</b>
            </div>
            <div className={b.boxes}>
              {["เห็นด้วย", "ไม่เห็นด้วย", "งดออกเสียง", "บัตรเสีย"].map((l) => <div key={l}><i />{l}</div>)}
            </div>
            <footer>ลงชื่อผู้ถือหุ้น ........................................ &nbsp;&nbsp; เจ้าหน้าที่ ........................................</footer>
          </section>
        ))}
      </div>
    </>
  );
}
