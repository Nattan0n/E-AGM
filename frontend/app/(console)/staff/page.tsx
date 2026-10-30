"use client";
import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/Select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/media";
import type { HolderItem, Stats } from "@/lib/types";
import { Avatar, Ctx, Metrics, SearchIcon, StaffPage, StModal, StatusBadge, styles } from "@/components/staff/common";

export default function StaffSearchPage() {
  return <StaffPage title="ค้นหาผู้ถือหุ้น" sub="ค้นหาและจัดการการลงทะเบียนของผู้ถือหุ้น">{(c) => <Search {...c} />}</StaffPage>;
}

type Confirm = { kind: "cancel" | "convert"; h: HolderItem } | null;
type Filter = "all" | "none" | "onsite" | "online";

function Search({ canWrite, toast }: Ctx) {
  const { data: stats, reload: reloadStats } = useApi<Stats>("/api/stats", "staff", 15000);
  const desktop = useIsDesktop();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [rowsRaw, setRows] = useState<HolderItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [acting, setActing] = useState(false);
  const seq = useRef(0);
  const term = q.trim();

  async function run(t: string, f: Filter = filter) {
    const id = ++seq.current;
    setBusy(true);
    try {
      const r = await api<HolderItem[]>(`/api/holders/search?q=${encodeURIComponent(t)}${f === "all" ? "" : `&status=${f}`}`);
      if (id === seq.current) { setRows(r); setErr(""); }
    } catch (e) { if (id === seq.current) { setRows(null); setErr(errMsg(e)); } }
    finally { if (id === seq.current) setBusy(false); }
  }
  useEffect(() => {
    if ([...term].length < 2) { seq.current++; return; }
    const t = setTimeout(() => run(term), 300);
    return () => clearTimeout(t);
  }, [term, filter]);

  async function doConfirm() {
    if (!confirm) return;
    setActing(true);
    try {
      if (confirm.kind === "cancel") {
        await api(`/api/registration/${encodeURIComponent(confirm.h.account_id)}`, { method: "DELETE" });
        toast("ยกเลิกการลงทะเบียนแล้ว");
      } else {
        await api(`/api/registration/${encodeURIComponent(confirm.h.account_id)}/convert`, { method: "POST" });
        toast(confirm.h.vote_mode === "staff" ? "รับเข้าห้องแล้ว — ลงคะแนนแทนได้เลย" : "เปลี่ยนเป็น Onsite แล้ว");
        if (confirm.h.vote_mode === "staff") { router.push(`/staff/vote?acc=${encodeURIComponent(confirm.h.account_id)}`); return; }
      }
      setConfirm(null);
      await Promise.all([run(term), reloadStats()]);
    } catch (e) { toast(errMsg(e), true); setConfirm(null); }
    finally { setActing(false); }
  }

  const short = [...term].length < 2;
  const rowsAll = rowsRaw && !short ? rowsRaw : null;
  const rows = rowsAll; // the status filter is applied by the server, before its 50-row limit
  const reg = stats ? stats.onsite_count + stats.online_count : 0;
  const regLabel = (h: HolderItem) => (h.reg_type === "person" ? "มาด้วยตนเอง" : h.reg_type === "proxy" ? "มอบฉันทะ" : h.reg_type === "group" ? `กลุ่ม ${h.group_name ?? ""}` : "");
  const actions = (h: HolderItem) => (canWrite ? (
    <>
      {h.status === "none" && <Link className={`${styles.btn} ${styles.sm} ${styles.bPri}`} href={`/staff/register?acc=${encodeURIComponent(h.account_id)}`}>+ ลงทะเบียน</Link>}
      {h.status === "onsite" && <Link className={`${styles.btn} ${styles.sm} ${styles.bSoft}`} href={`/staff/ballots?acc=${encodeURIComponent(h.account_id)}`}>พิมพ์บัตร</Link>}
      {h.status === "onsite" && <button className={`${styles.btn} ${styles.sm} ${styles.bOutRed}`} onClick={() => setConfirm({ kind: "cancel", h })}>ยกเลิกลงทะเบียน</button>}
      {h.status === "online" && h.vote_mode === "staff" && <button className={`${styles.btn} ${styles.sm} ${styles.bPri}`} onClick={() => setConfirm({ kind: "convert", h })}>รับเข้าห้อง · ลงคะแนนแทน</button>}
      {h.status === "online" && h.vote_mode !== "staff" && <button className={`${styles.btn} ${styles.sm} ${styles.bSoft}`} onClick={() => setConfirm({ kind: "convert", h })}>เปลี่ยนเป็น Onsite</button>}
    </>
  ) : <span className={styles.muted}>อ่านอย่างเดียว</span>);

  return (
    <>
      <Metrics items={[
        { v: stats ? fmt(stats.holders) : "-", l: "ผู้ถือหุ้นทั้งหมด", c: "cBlue" },
        { v: stats ? fmt(reg) : "-", l: "ลงทะเบียนแล้ว", c: "cGreen" },
        { v: stats ? `${stats.quorum_pct.toFixed(1)}%` : "-", l: "Quorum ปัจจุบัน", c: "cCyan" },
        { v: stats ? fmt(stats.online_count) : "-", l: "ออนไลน์", c: "cAmber" },
      ]} />

      <div className={`${styles.card} ${styles.searchRow}`}>
        <div className={styles.sbox}>
          <SearchIcon />
          <input id="q" aria-label="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขทะเบียน / ชื่อ / เลขบัตร (อย่างน้อย 2 ตัวอักษร)" autoComplete="off" />
        </div>
        <Select className={styles.sel} aria-label="สถานะ" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">ทั้งหมด</option>
          <option value="none">ยังไม่ลงทะเบียน</option>
          <option value="onsite">Onsite</option>
          <option value="online">Online</option>
        </Select>
      </div>

      <div aria-live="polite">
        {busy && !short && <p className={styles.empty}>กำลังค้นหา...</p>}
        {err && !short && <p className={styles.errText}>{err}</p>}
        {!busy && !err && rows && rows.length === 0 && <p className={styles.empty}>ไม่พบผู้ถือหุ้น</p>}
        {!rows && (short || !busy) && (short || !err) && <p className={styles.empty}>พิมพ์ชื่อหรือเลขทะเบียนเพื่อค้นหา</p>}
      </div>

      {rows && rows.length > 0 && !desktop && (
        <div className={styles.list}>
          <div className={styles.listHead}><span>พบ {rows.length} รายการ</span><span>เรียงตามชื่อ</span></div>
          {rows.map((h) => {
            const isOpen = open === h.account_id;
            return (
              <div key={h.account_id} className={styles.srow}>
                <button type="button" className={styles.srowBtn} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : h.account_id)}>
                  <Avatar name={h.name} />
                  <span className={styles.grow}>
                    <div className={styles.name}>{h.name}</div>
                    <div className={styles.meta}>{h.account_id} · {h.masked_id}</div>
                  </span>
                  <span className={styles.right}>
                    <span className={styles.shares}>{fmt(h.shares)} หุ้น</span>
                    <StatusBadge status={h.status} />
                  </span>
                  <span aria-hidden className={styles.chev}>{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className={styles.detail}>
                    <div className={styles.meta} style={{ whiteSpace: "normal" }}>
                      โทร: {h.phone || "-"}
                      {h.reg_type && <> · ประเภท: {regLabel(h)}</>}
                      {h.status === "online" && <> · <span className={`${styles.tag} ${styles.tBlue}`}>{h.vote_mode === "staff" ? "ให้เจ้าหน้าที่ลงคะแนน" : "ลงคะแนนเอง"}</span></>}
                      {h.late && <> · <span className={`${styles.tag} ${styles.tAmber}`}>มาสาย</span></>}
                      {h.novote_any && <> · <span className={`${styles.tag} ${styles.tRed}`}>มีวาระที่ไม่มีสิทธิ์</span></>}
                    </div>
                    <div className={styles.row}>{actions(h)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rows && rows.length > 0 && desktop && (
        <div className={styles.tableCard}>
          <div className={styles.tableHead}><span>พบ <b>{rows.length}</b> รายการ จากการค้นหา &quot;{term}&quot; · เรียงตามชื่อ</span></div>
          <div className={styles.tableScroll}>
            <table className={styles.tbl}>
              <thead><tr><th>#</th><th>ชื่อ-นามสกุล</th><th>รหัสผู้ถือหุ้น</th><th className={styles.num}>จำนวนหุ้น</th><th>สถานะ</th><th>การดำเนินการ</th></tr></thead>
              <tbody>
                {rows.map((h, i) => (
                  <tr key={h.account_id}>
                    <td>{i + 1}</td>
                    <td>
                      <div className={styles.cellHolder}>
                        <Avatar name={h.name} size="sm" />
                        <div>
                          <div className={styles.name}>{h.name}</div>
                          <div className={styles.meta}>{h.masked_id}{h.phone ? ` · โทร ${h.phone}` : ""}{h.reg_type ? ` · ${regLabel(h)}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12 }}>{h.account_id}</td>
                    <td className={`${styles.num} ${styles.shares}`}>{fmt(h.shares)}</td>
                    <td>
                      <div className={styles.row} style={{ gap: 4 }}>
                        <StatusBadge status={h.status} />
                        {h.status === "online" && <span className={`${styles.tag} ${styles.tBlue}`}>{h.vote_mode === "staff" ? "ให้เจ้าหน้าที่ลงคะแนน" : "ลงคะแนนเอง"}</span>}
                        {h.late && <span className={`${styles.tag} ${styles.tAmber}`}>มาสาย</span>}
                        {h.novote_any && <span className={`${styles.tag} ${styles.tRed}`}>ไม่มีสิทธิ์บางวาระ</span>}
                      </div>
                    </td>
                    <td><div className={styles.row}>{actions(h)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.tblFoot}>
            <span>{rows.length >= 50 ? "แสดง 50 รายการแรก — พิมพ์ให้เจาะจงขึ้นเพื่อกรองผลลัพธ์" : `พบ ${rows.length} รายการ`}</span>
          </div>
        </div>
      )}

      {confirm && (
        <StModal
          title={confirm.kind === "cancel" ? "ยืนยันยกเลิกการลงทะเบียน" : confirm.h.vote_mode === "staff" ? "รับเข้าห้องและลงคะแนนแทน" : "เปลี่ยนจาก Online เป็น Onsite"}
          onClose={() => !acting && setConfirm(null)}
          actions={<>
            <button className={styles.btn} onClick={() => setConfirm(null)} disabled={acting}>ยกเลิก</button>
            <button className={`${styles.btn} ${confirm.kind === "cancel" ? styles.bDanger : styles.bPri}`} onClick={doConfirm} disabled={acting}>{acting ? "กำลังดำเนินการ..." : "ยืนยัน"}</button>
          </>}
        >
          <p><b>{confirm.h.name}</b> ({confirm.h.account_id})</p>
          {confirm.kind === "cancel"
            ? <p className={styles.muted}>ลบการลงทะเบียน Onsite ของผู้ถือหุ้นรายนี้ (ทำไม่ได้หากลงคะแนนแล้ว)</p>
            : confirm.h.vote_mode === "staff"
              ? <p className={styles.muted}>ตรวจสอบบัตรประชาชนของผู้ถือหุ้นแล้ว ระบบจะรับเข้าห้องประชุมเป็น Onsite (ผู้ถือหุ้นเลือกให้เจ้าหน้าที่ลงคะแนนแทน) แล้วพาไปหน้าลงคะแนนแทนทันที</p>
              : <p className={styles.errText}>คำเตือน: ระบบจะยกเลิกเซสชัน Online ของผู้ถือหุ้นรายนี้ และลงทะเบียน Onsite แทน คะแนนที่ลงไว้แล้วจะถูกโอนมา การดำเนินการนี้ย้อนกลับไม่ได้</p>}
        </StModal>
      )}
    </>
  );
}
