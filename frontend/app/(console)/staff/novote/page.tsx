"use client";
import { Icon } from "@/components/brand/Icon";
import { useState } from "react";
import { api, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Agenda, HolderItem, NovoteRow } from "@/lib/types";
import { Avatar, Ctx, HolderCard, HolderPicker, StaffPage, StModal, styles } from "@/components/staff/common";

export default function NovotePage() {
  return <StaffPage title="ผู้ไม่มีสิทธิ์ลงคะแนน" sub="จัดการรายชื่อผู้ถือหุ้นที่มีส่วนได้เสียและถูกตัดสิทธิ์ลงคะแนนเป็นรายวาระ">{(c) => <Novote {...c} />}</StaffPage>;
}

function Novote({ canWrite, toast }: Ctx) {
  const { data: agendas, loading: la, error: ea } = useApi<Agenda[]>("/api/agendas");
  const [sel, setSel] = useState("");
  const termId = agendas && agendas.length > 0 ? (agendas.some((a) => a.term_id === sel) ? sel : agendas[0].term_id) : "";
  const { data: rows, loading, error, reload } = useApi<NovoteRow[]>(termId ? `/api/novote?term_id=${encodeURIComponent(termId)}` : null);
  const [holder, setHolder] = useState<HolderItem | null>(null);
  const [restore, setRestore] = useState<NovoteRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [askForce, setAskForce] = useState(false);

  const agenda = agendas?.find((a) => a.term_id === termId);
  const closed = agenda?.status === "closed";
  const total = rows?.reduce((s, r) => s + r.shares, 0) ?? 0;

  async function add(force = false) {
    if (!holder || !termId) return;
    setBusy(true);
    try {
      await api("/api/novote", { method: "POST", body: { account_id: holder.account_id, term_id: termId, force } });
      toast("เพิ่มรายชื่อผู้ไม่มีสิทธิ์แล้ว");
      setHolder(null); setAskForce(false);
      await reload();
    } catch (e) {
      // the holder already voted on this agenda: ask before discarding that vote
      if (e instanceof Error && e.message === "has_votes") setAskForce(true);
      else toast(errMsg(e), true);
    }
    finally { setBusy(false); }
  }
  async function doRestore() {
    if (!restore) return;
    setBusy(true);
    try {
      await api(`/api/novote/${restore.id}`, { method: "DELETE" });
      toast("คืนสิทธิ์แล้ว");
      setRestore(null);
      await reload();
    } catch (e) { toast(errMsg(e), true); setRestore(null); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className={styles.alertRed}>
        <span aria-hidden style={{ display: "inline-flex", flexShrink: 0 }}><Icon name="ban" size={22} /></span>
        <div><b>ผู้ที่มีส่วนได้เสียในวาระการประชุม</b>ผู้ถือหุ้นที่มีส่วนได้เสียในวาระนั้น ๆ จะถูกตัดออกจากการลงคะแนนเสียงในวาระดังกล่าวตามกฎหมายและข้อบังคับบริษัท</div>
      </div>

      <div className={styles.card}>
        <div className={styles.row} style={{ gap: 12, justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 280px", minWidth: 0, maxWidth: 520 }}>
            <label className={styles.lbl} htmlFor="ag">เลือกวาระที่ต้องการจัดการ</label>
            <select id="ag" className={`${styles.sel} ${styles.block}`} value={termId} onChange={(e) => { setSel(e.target.value); setHolder(null); }} disabled={!agendas?.length}>
              {la && <option>กำลังโหลด...</option>}
              {agendas?.map((a) => <option key={a.term_id} value={a.term_id}>วาระ {a.term_id}: {a.name}</option>)}
            </select>
          </div>
          <div className={styles.chips}>
            <span className={`${styles.chip} ${styles.chipRed}`}>ตัดสิทธิ์ {rows?.length ?? 0} คน</span>
            <span className={`${styles.chip} ${styles.chipBlue}`}>{fmt(total)} หุ้น</span>
          </div>
        </div>
        {ea && <p className={styles.errText}>{ea}</p>}
        {closed && <p className={styles.muted} style={{ marginTop: 8 }}>วาระนี้ปิดโหวตแล้ว ไม่สามารถเพิ่มรายชื่อได้</p>}
      </div>

      <div className={styles.card}>
        {!holder ? (
          <HolderPicker label={`เพิ่มผู้ไม่มีสิทธิ์ลงคะแนน (วาระ ${termId || "-"})`} actionLabel="ตัดสิทธิ์" onPick={setHolder} disabled={!canWrite || closed || !termId} />
        ) : (
          <div className={styles.stack}>
            <HolderCard h={holder} />
            <div className={styles.row}>
              <button className={styles.btn} onClick={() => setHolder(null)} disabled={busy}>ยกเลิก</button>
              <button className={`${styles.btn} ${styles.bDanger}`} onClick={() => add()} disabled={!canWrite || busy}>{busy ? "กำลังบันทึก..." : "＋ เพิ่มเป็นผู้ไม่มีสิทธิ์"}</button>
            </div>
          </div>
        )}
      </div>

      {(loading || la) && <p className={styles.empty}>กำลังโหลด...</p>}
      {error && <p className={styles.errText}>{error}</p>}
      {rows && rows.length === 0 && <p className={styles.empty}>ไม่มีผู้ถูกจำกัดสิทธิ์ในวาระนี้</p>}
      {rows && rows.length > 0 && (
        <div className={styles.tableCard}>
          <div className={styles.tableHead}><span>รายชื่อผู้ไม่มีสิทธิ์ — วาระ {termId}</span></div>
          <div className={styles.tableScroll}>
            <table className={styles.tbl}>
              <thead><tr><th>#</th><th>ผู้ถือหุ้น</th><th>วาระ</th><th className={styles.num}>หุ้น</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td><div className={styles.cellHolder}><Avatar name={r.name} size="sm" /><div><div className={styles.name}>{r.name}</div><div className={styles.meta}>{r.account_id}</div></div></div></td>
                    <td><span className={`${styles.tag} ${styles.tBlue}`}>วาระ {r.term_id}</span></td>
                    <td className={`${styles.num} ${styles.shares}`}>{fmt(r.shares)}</td>
                    <td style={{ textAlign: "right" }}>{canWrite && <button className={`${styles.btn} ${styles.sm} ${styles.bOutGreen}`} onClick={() => setRestore(r)}>คืนสิทธิ์</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {askForce && holder && (
        <StModal title="ผู้ถือหุ้นลงคะแนนในวาระนี้แล้ว" onClose={() => !busy && setAskForce(false)}
          actions={<><button className={styles.btn} onClick={() => setAskForce(false)} disabled={busy}>ยกเลิก</button><button className={`${styles.btn} ${styles.bPri}`} onClick={() => add(true)} disabled={busy}>{busy ? "..." : "ตัดสิทธิ์และลบคะแนน"}</button></>}>
          <p><b>{holder.name}</b> ({holder.account_id}) ลงคะแนนในวาระ {termId} ไปแล้ว</p>
          <p className={styles.errText}>การตัดสิทธิ์จะลบคะแนนที่ลงไว้ทั้งแบบ Onsite และ Online และกู้คืนไม่ได้ (บันทึกใน Audit)</p>
        </StModal>
      )}

      {restore && (
        <StModal title="คืนสิทธิ์ลงคะแนน" onClose={() => !busy && setRestore(null)}
          actions={<><button className={styles.btn} onClick={() => setRestore(null)} disabled={busy}>ยกเลิก</button><button className={`${styles.btn} ${styles.bPri}`} onClick={doRestore} disabled={busy}>{busy ? "..." : "ยืนยัน"}</button></>}>
          <p>คืนสิทธิ์ลงคะแนนวาระ {restore.term_id} ให้ <b>{restore.name}</b> ({restore.account_id})?</p>
        </StModal>
      )}
    </>
  );
}
