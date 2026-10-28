"use client";
import { Icon } from "@/components/brand/Icon";
import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { api, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { GroupItem, GroupMember, HolderItem, Meeting, Stats } from "@/lib/types";
import p from "./summary.module.css";
import { Avatar, Ctx, HolderPicker, StaffPage, StModal, styles } from "@/components/staff/common";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p className={styles.empty}>กำลังโหลด...</p>}><Inner params={params} /></Suspense>;
}

function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <StaffPage title="สมาชิกกลุ่ม" sub="จัดการสมาชิกและจำนวนหุ้นของกลุ่ม">{(c) => <Members id={id} {...c} />}</StaffPage>;
}

function Members({ id, canWrite, toast }: Ctx & { id: string }) {
  useEffect(() => { document.body.classList.add("print-sheet"); return () => document.body.classList.remove("print-sheet"); }, []);
  const { data: members, loading, error, reload } = useApi<GroupMember[]>(`/api/registration/groups/${encodeURIComponent(id)}`);
  const { data: groups, reload: reloadGroups } = useApi<GroupItem[]>("/api/registration/groups");
  const { data: stats } = useApi<Stats>("/api/stats");
  const { data: meeting } = useApi<Meeting>("/api/meeting");
  const group = groups?.find((g) => String(g.id) === id);
  const [adding, setAdding] = useState<HolderItem | null>(null);
  const [shares, setShares] = useState("");
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);

  const n = Number(shares);
  const okShares = !!adding && Number.isInteger(n) && n >= 1 && n <= adding.shares;
  const total = group?.shares ?? members?.reduce((s, m) => s + m.shares, 0) ?? 0;

  async function add() {
    if (!adding || !okShares) return;
    setBusy(true);
    try {
      await api(`/api/registration/groups/${encodeURIComponent(id)}/members`, { method: "POST", body: { account_id: adding.account_id, shares: n } });
      toast("เพิ่มสมาชิกแล้ว");
      setAdding(null);
      await Promise.all([reload(), reloadGroups()]);
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/api/registration/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(removing.account_id)}`, { method: "DELETE" });
      toast("ลบสมาชิกแล้ว");
      setRemoving(null);
      await Promise.all([reload(), reloadGroups()]);
    } catch (e) { toast(errMsg(e), true); setRemoving(null); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <Link href="/staff/register" className={styles.back}>← กลับไปหน้าลงทะเบียน</Link>
        <Link className={`${styles.btn} ${styles.sm} ${styles.bPri}`} href={`/staff/ballots?group=${encodeURIComponent(id)}`}><Icon name="print" size={15} className="ico-inl" />พิมพ์บัตรลงคะแนนทั้งกลุ่ม</Link>
        <button className={`${styles.btn} ${styles.sm}`} disabled={!members || members.length === 0} onClick={() => window.print()}><Icon name="print" size={15} className="ico-inl" />พิมพ์ใบสรุปเข้าประชุม</button>
      </div>
      <div className={styles.card}>
        <div className={styles.row} style={{ justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div className={styles.hero} style={{ flex: "1 1 260px", minWidth: 0 }}>
            <span className={styles.groupBadge} style={{ width: 52, height: 52 }}>{group ? group.code.replace(/^.*?-/, "").slice(0, 4) : "G"}</span>
            <div className={styles.grow}>
              <div className={styles.name} style={{ fontSize: 17, whiteSpace: "normal" }}>{group?.name ?? `กลุ่ม #${id}`}</div>
              <div className={styles.meta}>{group ? `รหัสกลุ่ม: ${group.code}` : ""}</div>
            </div>
          </div>
          <div className={styles.stats3}>
            <div><b>{group?.members ?? members?.length ?? "-"}</b><small>สมาชิก</small></div>
            <div><b>{fmt(total)}</b><small>หุ้นรวม</small></div>
            <div><b>{stats?.total_shares ? `${((total / stats.total_shares) * 100).toFixed(2)}%` : "-"}</b><small>% คะแนน</small></div>
          </div>
        </div>
      </div>

      {canWrite && <div className={styles.alertAmber}><Icon name="warn" size={15} className="ico-inl" />การแก้ไขสมาชิกจะมีผลกับคะแนนเสียงทั้งกลุ่ม กรุณาตรวจสอบก่อนบันทึกการเปลี่ยนแปลง</div>}

      {canWrite && (
        <div className={styles.card}>
          {!adding ? (
            <HolderPicker label="เพิ่มสมาชิกใหม่" filter={(h) => h.status === "none"} actionLabel="+ เลือก" onPick={(h) => { setAdding(h); setShares(String(h.shares)); }} />
          ) : (
            <div className={styles.row} style={{ gap: 12 }}>
              <Avatar name={adding.name} size="sm" />
              <div className={styles.grow} style={{ minWidth: 160 }}><div className={styles.name}>{adding.name}</div><div className={styles.meta}>{adding.account_id} · สูงสุด {fmt(adding.shares)}</div></div>
              <input className={styles.numIn} type="number" min={1} max={adding.shares} value={shares} onChange={(e) => setShares(e.target.value)} aria-label="จำนวนหุ้น" aria-invalid={!okShares} />
              <button className={`${styles.btn} ${styles.sm} ${styles.bPri}`} onClick={add} disabled={busy || !okShares}>{busy ? "..." : "+ เพิ่ม"}</button>
              <button className={`${styles.btn} ${styles.sm}`} onClick={() => setAdding(null)} disabled={busy}>ยกเลิก</button>
            </div>
          )}
        </div>
      )}

      {loading && <p className={styles.empty}>กำลังโหลด...</p>}
      {error && <p className={styles.errText}>{error}</p>}
      {members && members.length === 0 && <p className={styles.empty}>ยังไม่มีสมาชิก</p>}
      {members && members.length > 0 && (
        <div className={styles.tableCard}>
          <div className={styles.tableScroll}>
            <table className={styles.tbl}>
              <thead><tr><th>#</th><th>สมาชิก</th><th className={styles.num}>หุ้น</th><th /></tr></thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.account_id}>
                    <td>{i + 1}</td>
                    <td><div className={styles.cellHolder}><Avatar name={m.name} size="sm" /><div><div className={styles.name}>{m.name}</div><div className={styles.meta}>{m.account_id}</div></div></div></td>
                    <td className={`${styles.num} ${styles.shares}`}>{fmt(m.shares)}</td>
                    <td style={{ textAlign: "right" }}>{canWrite && <button className={styles.xbtn} onClick={() => setRemoving(m)} aria-label={`ลบ ${m.name}`}><Icon name="x" size={15} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.totalBar}><span>รวมหุ้นทั้งหมด ({members.length} สมาชิก)</span><b>{fmt(members.reduce((s, m) => s + m.shares, 0))} หุ้น</b></div>
        </div>
      )}

      {removing && (
        <StModal title="ลบสมาชิกออกจากกลุ่ม" onClose={() => !busy && setRemoving(null)}
          actions={<><button className={styles.btn} onClick={() => setRemoving(null)} disabled={busy}>ยกเลิก</button><button className={`${styles.btn} ${styles.bDanger}`} onClick={remove} disabled={busy}>{busy ? "..." : "ลบ"}</button></>}>
          <p>ลบ <b>{removing.name}</b> ออกจากกลุ่ม? การลงทะเบียนของสมาชิกจะถูกยกเลิกด้วย (ทำไม่ได้หากลงคะแนนแล้ว)</p>
        </StModal>
      )}

      <section className={p.sheet} aria-hidden="true">
        <h1>ใบสรุปการเข้าร่วมประชุม (ลงทะเบียนแบบกลุ่ม)</h1>
        <div className={p.sub}>{meeting?.detail ?? "ประชุมสามัญผู้ถือหุ้น"} · {meeting?.date}</div>
        <div className={p.meta}>
          <div><small>ชื่อกลุ่ม</small><b>{group?.name ?? `กลุ่ม #${id}`}</b></div>
          <div><small>รหัสกลุ่ม</small><b>{group?.code ?? "-"}</b></div>
          <div><small>วันที่พิมพ์</small><b>{new Date().toLocaleString("th-TH")}</b></div>
        </div>
        <table>
          <thead><tr><th>#</th><th>เลขทะเบียน</th><th>ชื่อ-นามสกุล</th><th className={p.num}>จำนวนหุ้นที่ใช้สิทธิ์</th></tr></thead>
          <tbody>{(members ?? []).map((m, i) => <tr key={m.account_id}><td>{i + 1}</td><td>{m.account_id}</td><td>{m.name}</td><td className={p.num}>{fmt(m.shares)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>รวม {members?.length ?? 0} ราย{stats?.total_shares ? ` · ${((total / stats.total_shares) * 100).toFixed(2)}% ของหุ้นทั้งหมด` : ""}</td><td className={p.num}>{fmt(total)}</td></tr></tfoot>
        </table>
        <div className={p.sign}><div>ผู้รับมอบฉันทะ / ผู้แทนกลุ่ม</div><div>เจ้าหน้าที่ลงทะเบียน</div><div>ผู้ตรวจสอบ</div></div>
      </section>
    </>
  );
}
