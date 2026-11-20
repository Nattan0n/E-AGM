"use client";
import { useEffect, useMemo, useState } from "react";
import { api, errMsg, fetchBlobUrl, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { MOCK, mockDocUrl } from "@/lib/mock";
import type { HolderItem, RequestFile, ReviewHolder, UserRequestDetail, UserRequestList, UserRequestRow, UserRequestStatus } from "@/lib/types";
import { Icon } from "@/components/brand/Icon";
import { Avatar, Ctx, HolderPicker, Metrics, SearchIcon, StaffPage, StModal, styles } from "@/components/staff/common";
import r from "./review.module.css";

// OMD Review (flow page 17): requests for a User that the system could not settle on its own. OMD checks the data
// and documents, calls the holder back, then approves (the confirmed contact is bound to the account) or rejects.

export default function RequestsPage() {
  return (
    <StaffPage title="คำขอ User" sub="ตรวจคำขอที่ระบบตรวจเองไม่ได้ — ดูเอกสาร โทรกลับ แล้วอนุมัติหรือปฏิเสธ">
      {(c) => (c.session.role === "viewer" ? <p className={styles.errText}>บัญชี Viewer ไม่มีสิทธิ์ดูคำขอ User (ข้อมูลส่วนบุคคล)</p> : <Review {...c} />)}
    </StaffPage>
  );
}

type Tab = UserRequestStatus | "all";
const TABS: [Tab, string][] = [["pending", "รอตรวจ"], ["approved", "อนุมัติแล้ว"], ["rejected", "ปฏิเสธ"], ["all", "ทั้งหมด"]];
const KIND: Record<UserRequestRow["kind"], string> = { contact: "ไม่มีช่องทางติดต่อ", not_found: "ไม่พบในทะเบียน" };
const REASONS = ["ไม่พบชื่อในทะเบียน ณ วันปิดสมุดทะเบียน", "ชื่อ/เลขบัตรไม่ตรงกับเอกสาร", "เอกสารไม่ชัดเจนหรือไม่ครบ", "ติดต่อผู้ถือหุ้นไม่ได้", "ยืนยันตัวตนทางโทรศัพท์ไม่ผ่าน"];

const when = (s: string | null) => {
  if (!s) return "-";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const ago = (s: string | null) => {
  if (!s) return "";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (isNaN(m)) return "";
  return m < 1 ? "เมื่อสักครู่" : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชม.ที่แล้ว` : when(s);
};
const idFmt = (c: string) => (/^\d{13}$/.test(c) ? `${c[0]}-${c.slice(1, 5)}-${c.slice(5, 10)}-${c.slice(10, 12)}-${c[12]}` : c);
const phoneFmt = (p: string) => (/^0\d{9}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
const norm = (n: string) => n.toLowerCase().replace(/^(นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?|miss)\s*/, "").replace(/\s+/g, "");
const nameMatch = (a: string, b: string) => !!a && !!b && (norm(a) === norm(b) || norm(b).includes(norm(a)) || norm(a).includes(norm(b)));
const title = (q: UserRequestRow) => q.full_name || (q.acc_ids.length ? `บัญชี ${q.acc_ids.join(", ")}` : idFmt(q.id_card));

function StatusTag({ q }: { q: UserRequestRow }) {
  if (q.status === "approved") return <span className={`${styles.tag} ${styles.tGreen}`}>อนุมัติแล้ว</span>;
  if (q.status === "rejected") return <span className={`${styles.tag} ${styles.tRed}`}>ปฏิเสธ</span>;
  if (q.first_by) return <span className={`${styles.tag} ${styles.tBlue}`}>รออนุมัติคนที่ 2</span>;
  return <span className={`${styles.tag} ${styles.tAmber}`}>รอตรวจ</span>;
}

function Review({ canWrite, toast }: Ctx) {
  const [tab, setTab] = useState<Tab>("pending");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data: list, error, loading, reload } = useApi<UserRequestList>(`/api/user-requests?status=${tab}${term ? `&q=${encodeURIComponent(term)}` : ""}`, "staff", 15000);
  const [sel, setSel] = useState<number | null>(null);
  const counts = list?.counts;

  return (
    <>
      <Metrics cols="three" items={[
        { v: counts ? fmt(counts.pending) : "-", l: "รอตรวจ", c: "cAmber" },
        { v: counts ? fmt(counts.approved) : "-", l: "อนุมัติแล้ว", c: "cGreen" },
        { v: counts ? fmt(counts.rejected) : "-", l: "ปฏิเสธ", c: "cBlue" },
      ]} />
      {!!list?.dual_shares && (
        <div className={styles.alertAmber}><Icon name="users" size={16} />ผู้ถือหุ้นที่มีหุ้นรวม <b>{fmt(list.dual_shares)} หุ้นขึ้นไป</b> ต้องให้เจ้าหน้าที่ 2 คนอนุมัติ</div>
      )}

      <div className={r.layout} data-open={sel ? "1" : "0"}>
        <div className={`${styles.card} ${r.listCol}`}>
          <div className={r.tabs} role="tablist" aria-label="สถานะคำขอ">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`${r.tab} ${tab === k ? r.tabOn : ""}`} onClick={() => { setTab(k); setSel(null); }}>
                {l}{k !== "all" && counts ? <b>{counts[k]}</b> : null}
              </button>
            ))}
          </div>
          <div className={styles.sbox} style={{ marginBottom: 10 }}>
            <SearchIcon />
            <input id="rq-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ / เลขบัตร / เบอร์ / REQ-" autoComplete="off" aria-label="ค้นหาคำขอ" />
          </div>
          {loading && !list && <p className={styles.empty}>กำลังโหลด...</p>}
          {error && <p className={styles.errText}>{error}</p>}
          {list && list.items.length === 0 && <p className={styles.empty}>{term ? "ไม่พบคำขอที่ค้นหา" : tab === "pending" ? "ไม่มีคำขอรอตรวจ" : "ไม่มีคำขอ"}</p>}
          <div className={r.reqList}>
            {list?.items.map((it) => (
              <button key={it.id} type="button" className={`${r.reqItem} ${sel === it.id ? r.reqOn : ""}`} onClick={() => setSel(it.id)} aria-current={sel === it.id}>
                <Avatar name={it.full_name || "?"} size="sm" />
                <span className={styles.grow}>
                  <span className={styles.name} style={{ display: "block" }}>{title(it)}</span>
                  <span className={styles.meta} style={{ display: "block" }}>{it.reference} · {ago(it.submitted_at)}</span>
                  <span className={r.tags}>
                    <StatusTag q={it} />
                    <span className={styles.tag}>{KIND[it.kind]}</span>
                    {it.files > 0 && <span className={styles.tag}>เอกสาร {it.files}</span>}
                    {it.called_at && it.status === "pending" && <span className={`${styles.tag} ${styles.tCyan}`}>โทรแล้ว</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={r.detailCol}>
          {sel ? <Detail key={sel} id={sel} canWrite={canWrite} toast={toast} onBack={() => setSel(null)} onChanged={reload} dual={list?.dual_shares ?? 0} />
            : <div className={styles.card}><p className={styles.empty}><Icon name="idcard" size={28} /><br />เลือกคำขอทางซ้ายเพื่อตรวจสอบ</p></div>}
        </div>
      </div>
    </>
  );
}

function Detail({ id, canWrite, toast, onBack, onChanged, dual }: {
  id: number; canWrite: boolean; toast: Ctx["toast"]; onBack: () => void; onChanged: () => void; dual: number;
}) {
  const { data, error, loading, reload } = useApi<UserRequestDetail>(`/api/user-requests/${id}`);
  const [picked, setPicked] = useState<string[] | null>(null); // null = default choice
  const [extra, setExtra] = useState<ReviewHolder[]>([]);
  const [callNote, setCallNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [view, setView] = useState<RequestFile | null>(null);
  const [search, setSearch] = useState(false);

  const q = data?.request;
  const pending = q?.status === "pending";
  const accounts = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return [...data.holders, ...data.suggest, ...extra].filter((h) => !seen.has(h.account_id) && !!seen.add(h.account_id));
  }, [data, extra]);
  // default: the accounts the first approver chose, else the ones the system matched by ID card
  const chosen = picked ?? (q ? (q.approve_acc.length ? q.approve_acc : q.acc_ids) : []);
  const chosenShares = accounts.filter((h) => chosen.includes(h.account_id)).reduce((a, h) => a + h.shares, 0);
  const needsTwo = dual > 0 && chosenShares >= dual;

  if (loading && !data) return <div className={styles.card}><p className={styles.empty}>กำลังโหลด...</p></div>;
  if (error || !q || q.id !== id) return <div className={styles.card}><p className={styles.errText}>{error || "ไม่พบคำขอ"}</p></div>;

  const toggle = (acc: string) => setPicked(chosen.includes(acc) ? chosen.filter((a) => a !== acc) : [...chosen, acc]);
  const after = async () => { await reload(); onChanged(); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); await after(); return true; }
    catch (e) { toast(errMsg(e), true); return false; }
    finally { setBusy(false); }
  };
  const saveCall = () => act(() => api(`/api/user-requests/${id}/call`, { method: "POST", body: { note: callNote } }), "บันทึกผลการโทรแล้ว").then((ok) => ok && setCallNote(""));
  const approve = async () => {
    setBusy(true);
    try {
      const res = await api<{ status: string; awaiting_second?: boolean; notified?: boolean }>(`/api/user-requests/${id}/approve`, { method: "POST", body: { account_ids: chosen } });
      setConfirm(false);
      toast(res.awaiting_second ? "บันทึกการอนุมัติคนที่ 1 แล้ว — รอเจ้าหน้าที่อีกคนอนุมัติ" : res.notified ? "อนุมัติแล้ว และแจ้งผู้ถือหุ้นแล้ว" : "อนุมัติแล้ว (แจ้งผู้ถือหุ้นไม่สำเร็จ — กรุณาโทรแจ้ง)", !res.awaiting_second && res.notified === false);
      await after();
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  };
  const doReject = () => act(() => api(`/api/user-requests/${id}/reject`, { method: "POST", body: { reason: reason.trim() } }), "ปฏิเสธคำขอแล้ว และแจ้งผู้ถือหุ้นแล้ว").then((ok) => ok && setReject(false));
  const confirmedSms = q.otp_channel === "sms", confirmedMail = q.otp_channel === "email";
  const verified = <span className={`${styles.tag} ${styles.tGreen}`} style={{ marginLeft: 6 }}>ยืนยัน OTP แล้ว</span>;

  return (
    <div className={styles.card}>
      <button type="button" className={`${styles.btn} ${styles.sm} ${r.backBtn}`} onClick={onBack}>← รายการคำขอ</button>
      <div className={r.head}>
        <div>
          <div className={r.ref}>{q.reference}</div>
          <div className={r.sub}>ส่งคำขอ {when(q.submitted_at)} · {KIND[q.kind]}</div>
        </div>
        <StatusTag q={q} />
      </div>

      {data.warnings.length > 0 && (
        <div className={styles.alertAmber} style={{ marginTop: 12 }} role="note">
          {data.warnings.map((w) => <div key={w}><Icon name="warn" size={15} />{w}</div>)}
        </div>
      )}

      <div className={r.section}>
        <h4><Icon name="user" size={15} />ข้อมูลที่ผู้ถือหุ้นกรอก</h4>
        <div className={`${styles.infoRows} ${r.grid2}`}>
          <div><span>ชื่อ-นามสกุล</span><b>{q.full_name || "-"}</b></div>
          <div><span>เลขบัตร / Passport</span><b>{idFmt(q.id_card)}</b></div>
          <div><span>มือถือ</span><b>{q.phone ? <>{phoneFmt(q.phone)}{confirmedSms && verified}</> : "-"}</b></div>
          <div><span>อีเมล</span><b style={{ wordBreak: "break-all" }}>{q.email ? <>{q.email}{confirmedMail && verified}</> : "-"}</b></div>
        </div>
        {q.note && <p className={r.callLog} style={{ marginTop: 8 }}><b>หมายเหตุจากผู้ถือหุ้น:</b> {q.note}</p>}
      </div>

      <div className={r.section}>
        <h4><Icon name="file" size={15} />เอกสารแนบ ({data.files.length})</h4>
        {data.files.length === 0 ? <p className={styles.muted}>ไม่มีเอกสารแนบ{q.kind === "contact" ? " (พบในทะเบียนแล้ว ไม่บังคับแนบ)" : ""}</p> : (
          <div className={r.files}>
            {data.files.map((f) => (
              <button key={f.id} type="button" className={r.file} onClick={() => setView(f)}>
                <Icon name={f.content_type === "application/pdf" ? "file" : "eye"} size={20} />
                <span><b>{f.filename}</b><small>{f.content_type === "application/pdf" ? "PDF" : "รูปภาพ"} · {(f.size / 1024 / 1024).toFixed(1)} MB</small></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={r.section}>
        <h4><Icon name="building" size={15} />บัญชีในทะเบียนผู้ถือหุ้น</h4>
        {q.kind === "not_found" && pending && <p className={styles.muted} style={{ marginBottom: 8 }}>เลขบัตรนี้ไม่พบในทะเบียน — ตรวจกับนายทะเบียน (TSD) แล้วเลือกบัญชีที่เป็นของผู้ขอ ระบบจะผูกเลขบัตรและช่องทางติดต่อนี้กับบัญชีที่เลือก</p>}
        {accounts.length === 0 && <p className={styles.muted}>{pending ? "ยังไม่มีบัญชีที่ตรงกัน — ค้นหาจากทะเบียนด้านล่าง" : "-"}</p>}
        {accounts.map((h) => {
          const on = chosen.includes(h.account_id);
          const fromName = data.suggest.some((s) => s.account_id === h.account_id) && !data.holders.some((s) => s.account_id === h.account_id);
          return (
            <label key={h.account_id} className={`${r.acct} ${on ? r.acctOn : ""}`}>
              <input type="checkbox" checked={on} disabled={!pending || !canWrite || busy || !!q.first_by} onChange={() => toggle(h.account_id)} aria-label={`เลือกบัญชี ${h.account_id}`} />
              <span className={styles.grow}>
                <span className={styles.name} style={{ display: "block" }}>{h.name}</span>
                <span className={styles.meta} style={{ display: "block" }}>{h.account_id} · เลขบัตรในทะเบียน {h.masked_id || "-"} · {fmt(h.shares)} หุ้น</span>
                <span className={r.badges}>
                  {h.id_match ? <span className={`${styles.tag} ${styles.tGreen}`}>เลขบัตรตรงกับทะเบียน</span> : <span className={`${styles.tag} ${styles.tAmber}`}>เลขบัตรไม่ตรงกับทะเบียน</span>}
                  {q.full_name && (nameMatch(q.full_name, h.name) ? <span className={`${styles.tag} ${styles.tGreen}`}>ชื่อตรงกัน</span> : <span className={`${styles.tag} ${styles.tAmber}`}>ชื่อไม่ตรง</span>)}
                  {fromName && <span className={`${styles.tag} ${styles.tBlue}`}>แนะนำจากชื่อ</span>}
                  {h.phone || h.email ? <span className={styles.tag}>ติดต่อในทะเบียน: {[h.phone, h.email].filter(Boolean).join(" / ")}</span> : <span className={styles.tag}>ไม่มีช่องทางติดต่อในทะเบียน</span>}
                  {h.bound_to && <span className={`${styles.tag} ${styles.tRed}`}>ผูกไว้กับ {h.bound_to}</span>}
                </span>
              </span>
            </label>
          );
        })}
        {pending && canWrite && !q.first_by && !search && (
          <button type="button" className={`${styles.btn} ${styles.sm}`} style={{ marginTop: 10 }} onClick={() => setSearch(true)}><Icon name="search" size={15} className="ico-inl" />ค้นหาบัญชีอื่นในทะเบียน</button>
        )}
        {pending && canWrite && !q.first_by && search && (
          <div className={r.picker}>
            <HolderPicker label="ค้นหาบัญชีอื่นในทะเบียน" actionLabel="เพิ่ม" filter={(h) => !accounts.some((a) => a.account_id === h.account_id)}
              onPick={(h: HolderItem) => {
                setExtra((x) => [...x, { account_id: h.account_id, name: h.name, shares: h.shares, masked_id: h.masked_id, id_match: false, phone: h.phone ? "มี" : "", email: "", bound_to: "" }]);
                setPicked([...chosen, h.account_id]);
                setSearch(false);
              }} />
          </div>
        )}
        {pending && (
          <div className={r.total}>
            <span>เลือก {chosen.length} บัญชี · รวม <b>{fmt(chosenShares)}</b> หุ้น</span>
            {needsTwo && <span className={`${styles.tag} ${styles.tBlue}`}>ต้องอนุมัติ 2 คน</span>}
          </div>
        )}
      </div>

      <div className={r.section}>
        <h4><Icon name="phone" size={15} />โทรกลับยืนยันตัวตน</h4>
        {q.called_at && <div className={r.callLog}><b>{q.called_by}</b> · {when(q.called_at)}<br />{q.call_note}</div>}
        {pending && canWrite && (
          <>
            {q.phone && <p className={styles.muted} style={{ marginBottom: 6 }}>โทร <a href={`tel:${q.phone}`}><b>{phoneFmt(q.phone)}</b></a> แล้วถามข้อมูลที่ตรวจสอบได้ เช่น วันเกิด ที่อยู่ตามทะเบียน จำนวนหุ้นโดยประมาณ</p>}
            <textarea className={r.note} value={callNote} onChange={(e) => setCallNote(e.target.value)} maxLength={500} placeholder="ผลการโทร เช่น ยืนยันตัวตนผ่าน / ไม่รับสาย / ขอเอกสารเพิ่ม" aria-label="ผลการโทร" />
            <div className={styles.row} style={{ justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className={`${styles.btn} ${styles.sm}`} disabled={busy || !callNote.trim()} onClick={saveCall}>บันทึกผลการโทร</button>
            </div>
          </>
        )}
        {!pending && !q.called_at && <p className={styles.muted}>ไม่ได้บันทึกการโทร</p>}
      </div>

      <div className={r.section}>
        {q.status === "approved" && (
          <div className={`${r.result} ${r.resOk}`}><b>อนุมัติแล้ว — ผูกกับบัญชี {q.approve_acc.join(", ")}</b>
            โดย {q.reviewed_by} · {when(q.reviewed_at)} · {q.notified ? "แจ้งผู้ถือหุ้นแล้ว" : "ยังแจ้งผู้ถือหุ้นไม่สำเร็จ"}<br />ผู้ถือหุ้นเข้าสู่ระบบด้วยเลขบัตรนี้ได้แล้ว</div>
        )}
        {q.status === "rejected" && (
          <div className={`${r.result} ${r.resNo}`}><b>ปฏิเสธ: {q.reason}</b>โดย {q.reviewed_by} · {when(q.reviewed_at)} · {q.notified ? "แจ้งผู้ถือหุ้นแล้ว" : "ยังแจ้งผู้ถือหุ้นไม่สำเร็จ"}</div>
        )}
        {pending && q.first_by && (
          <div className={`${r.result} ${r.resWait}`}><b>อนุมัติคนที่ 1 แล้ว โดย {q.first_by} ({when(q.first_at)})</b>
            {q.first_by_me ? "ต้องให้เจ้าหน้าที่คนอื่นเป็นผู้อนุมัติคนที่ 2" : "ตรวจข้อมูลอีกครั้งแล้วกดอนุมัติเป็นคนที่ 2 หรือปฏิเสธ"}</div>
        )}
        {pending && (
          <div className={r.actions}>
            <button type="button" className={`${styles.btn} ${styles.bOutRed}`} disabled={!canWrite || busy} onClick={() => { setReason(""); setReject(true); }}>ปฏิเสธ</button>
            <button type="button" className={`${styles.btn} ${styles.bPri}`} disabled={!canWrite || busy || chosen.length === 0 || q.first_by_me} onClick={() => setConfirm(true)}>
              {q.first_by ? "อนุมัติ (คนที่ 2)" : needsTwo ? "อนุมัติ (คนที่ 1)" : "อนุมัติ"}
            </button>
          </div>
        )}
        {pending && canWrite && chosen.length === 0 && <p className={styles.muted} style={{ textAlign: "right", marginTop: 6 }}>เลือกบัญชีในทะเบียนก่อนอนุมัติ</p>}
      </div>

      {confirm && (
        <StModal title={`อนุมัติ ${q.reference}`} onClose={() => !busy && setConfirm(false)}
          actions={<><button className={styles.btn} disabled={busy} onClick={() => setConfirm(false)}>ยกเลิก</button>
            <button className={`${styles.btn} ${styles.bPri}`} disabled={busy} onClick={approve}>{busy ? "กำลังบันทึก..." : "ยืนยันอนุมัติ"}</button></>}>
          <div className={styles.infoRows}>
            <div><span>บัญชี</span><b>{chosen.join(", ")}</b></div>
            <div><span>หุ้นรวม</span><b>{fmt(chosenShares)}</b></div>
            <div><span>เลขบัตรที่ใช้เข้าระบบ</span><b>{idFmt(q.id_card)}</b></div>
            <div><span>รับ OTP ทาง</span><b>{[q.phone && phoneFmt(q.phone), q.email].filter(Boolean).join(" / ")}</b></div>
          </div>
          <p className={styles.muted} style={{ marginTop: 10 }}>
            {needsTwo && !q.first_by ? "ผู้ถือหุ้นรายใหญ่: การอนุมัติครั้งนี้เป็นคนที่ 1 ต้องให้เจ้าหน้าที่อีกคนอนุมัติก่อน ผู้ถือหุ้นจึงจะเข้าระบบได้"
              : "ผู้ถือหุ้นจะเข้าสู่ระบบด้วยเลขบัตรนี้ได้ทันที และระบบจะแจ้งผลไปที่ช่องทางที่ยืนยัน OTP ไว้"}
          </p>
        </StModal>
      )}

      {reject && (
        <StModal title={`ปฏิเสธ ${q.reference}`} onClose={() => !busy && setReject(false)}
          actions={<><button className={styles.btn} disabled={busy} onClick={() => setReject(false)}>ยกเลิก</button>
            <button className={`${styles.btn} ${styles.bDanger}`} disabled={busy || !reason.trim()} onClick={doReject}>{busy ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}</button></>}>
          <p className={styles.muted} style={{ marginBottom: 8 }}>เลือกเหตุผล หรือพิมพ์เอง — ผู้ถือหุ้นจะได้รับเหตุผลนี้</p>
          <div className={r.reasons}>{REASONS.map((x) => <button key={x} type="button" className={r.reasonChip} onClick={() => setReason(x)}>{x}</button>)}</div>
          <textarea className={r.note} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="เหตุผลที่ปฏิเสธ" aria-label="เหตุผลที่ปฏิเสธ" />
        </StModal>
      )}

      {view && <DocViewer reqId={id} f={view} onClose={() => setView(null)} />}
    </div>
  );
}

function DocViewer({ reqId, f, onClose }: { reqId: number; f: RequestFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (MOCK) { const t = setTimeout(() => setUrl(mockDocUrl(f)), 0); return () => clearTimeout(t); }
    let u = "", live = true;
    fetchBlobUrl(`/api/user-requests/${reqId}/files/${f.id}`).then((x) => { u = x; if (live) setUrl(x); else URL.revokeObjectURL(x); }).catch((e) => live && setErr(errMsg(e)));
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [reqId, f]);
  const pdf = f.content_type === "application/pdf" && !MOCK;
  return (
    <StModal title={f.filename} onClose={onClose} actions={<>
      {url && <a className={styles.btn} href={url} target="_blank" rel="noopener noreferrer">เปิดในแท็บใหม่</a>}
      <button className={`${styles.btn} ${styles.bPri}`} onClick={onClose}>ปิด</button></>}>
      {err && <p className={styles.errText}>{err}</p>}
      {!url && !err && <p className={styles.empty}>กำลังโหลดเอกสาร...</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && (pdf ? <iframe className={r.viewerFrame} src={url} title={f.filename} /> : <img className={r.viewer} src={url} alt={f.filename} />)}
    </StModal>
  );
}
