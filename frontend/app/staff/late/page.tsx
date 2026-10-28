"use client";
import { useEffect, useState } from "react";
import { api, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { HolderItem, LateRow, Stats } from "@/lib/types";
import { Avatar, Ctx, HolderCard, HolderPicker, Metrics, StaffPage, styles } from "@/components/staff/common";

export default function LatePage() {
  return <StaffPage title="ผู้มาสาย" sub="บันทึกเวลามาถึงของผู้ถือหุ้นที่มาหลังประชุมเริ่ม">{(c) => <Late {...c} />}</StaffPage>;
}

const time = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };

function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <b style={{ fontSize: 18 }}>{now || "--:--:--"} น.</b>;
}

function Late({ canWrite, toast }: Ctx) {
  const { data: rows, loading, error, reload } = useApi<LateRow[]>("/api/late", "staff", 10000);
  const { data: stats, reload: reloadStats } = useApi<Stats>("/api/stats", "staff", 10000);
  const [holder, setHolder] = useState<HolderItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function record() {
    if (!holder) return;
    setBusy(true);
    try {
      await api("/api/late", { method: "POST", body: { account_id: holder.account_id } });
      toast("บันทึกผู้มาสายแล้ว");
      setHolder(null);
      await Promise.all([reload(), reloadStats()]);
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Metrics cols="two" items={[
        { v: stats ? fmt(stats.late_count) : (rows?.length ?? "-"), l: "ผู้มาสาย (ราย)", c: "cBlue" },
        { v: stats ? fmt(stats.late_shares) : "-", l: "จำนวนหุ้นของผู้มาสาย", c: "cAmber" },
      ]} />

      <div className={styles.card}>
        {!holder ? (
          <HolderPicker label="ค้นหาผู้ถือหุ้นที่มาสาย" actionLabel="เลือก" onPick={setHolder} disabled={!canWrite} />
        ) : (
          <div className={styles.stack}>
            <HolderCard h={holder} />
            {holder.status === "none" && <p className={styles.errText}>ผู้ถือหุ้นรายนี้ยังไม่ได้ลงทะเบียน — กรุณาลงทะเบียนก่อนบันทึกมาสาย</p>}
            {holder.late && <p className={styles.muted}>บันทึกมาสายไว้แล้ว</p>}
            <div className={styles.sharesBox} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <small style={{ display: "inline" }}>บันทึกเวลา (อัตโนมัติ)</small><Clock />
            </div>
            <div className={styles.row}>
              <button className={styles.btn} onClick={() => setHolder(null)} disabled={busy}>ยกเลิก</button>
              <button className={`${styles.btn} ${styles.bWarn}`} onClick={record} disabled={!canWrite || busy}>{busy ? "กำลังบันทึก..." : "⏱ บันทึกเวลามาถึง"}</button>
            </div>
          </div>
        )}
        {!canWrite && <p className={styles.muted} style={{ marginTop: 8 }}>ไม่สามารถบันทึกได้ในโหมดอ่านอย่างเดียว</p>}
      </div>

      {loading && <p className={styles.empty}>กำลังโหลด...</p>}
      {error && <p className={styles.errText}>{error}</p>}
      {rows && rows.length === 0 && <p className={styles.empty}>ยังไม่มีผู้มาสาย</p>}
      {rows && rows.length > 0 && (
        <div className={styles.tableCard}>
          <div className={styles.tableHead}><span>รายชื่อผู้มาสาย — <b>{rows.length}</b> คน</span></div>
          <div className={styles.tableScroll}>
            <table className={styles.tbl}>
              <thead><tr><th>#</th><th>ผู้ถือหุ้น</th><th className={styles.num}>หุ้น</th><th>เวลามาถึง</th><th>เข้าร่วมวาระ</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.account_id}>
                    <td>{i + 1}</td>
                    <td><div className={styles.cellHolder}><Avatar name={r.name} size="sm" /><div><div className={styles.name}>{r.name}</div><div className={styles.meta}>{r.account_id}</div></div></div></td>
                    <td className={`${styles.num} ${styles.shares}`}>{fmt(r.shares)}</td>
                    <td>{time(r.arrived_at)}</td>
                    <td>{r.term_id ? <span className={`${styles.tag} ${styles.tAmber}`}>วาระ {r.term_id}</span> : <span className={styles.muted}>-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
