"use client";
import { Icon } from "@/components/brand/Icon";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { api, ApiError, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { AdModal as Modal } from "@/components/admin/AdModal";
import type { HolderAdminList, HolderAdminRow } from "@/lib/types";
import { AdminFrame, Avatar, Pager, PageHead, State, useMeeting, useToastAction } from "@/components/admin/common";

const PAGE = 50;

interface Form { account_id: string; title: string; first: string; last: string; shares: string; tax_id: string; phone: string; email: string }
const EMPTY: Form = { account_id: "", title: "", first: "", last: "", shares: "", tax_id: "", phone: "", email: "" };

/** Minimal CSV reader: quoted fields, commas inside quotes, "" escapes, CRLF/LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// header aliases (Thai or English) -> field
const COLS: Record<string, keyof Form | "security"> = {
  account_id: "account_id", "เลขทะเบียน": "account_id", "เลขที่บัญชี": "account_id",
  security: "security", "หลักทรัพย์": "security",
  title: "title", "คำนำหน้า": "title",
  first: "first", "ชื่อ": "first", last: "last", "นามสกุล": "last",
  shares: "shares", "จำนวนหุ้น": "shares", "หุ้น": "shares",
  tax_id: "tax_id", "เลขบัตร": "tax_id", "เลขบัตรประชาชน": "tax_id",
  phone: "phone", "เบอร์โทร": "phone", "โทรศัพท์": "phone",
  email: "email", "อีเมล": "email",
};

function HolderModal({ h, onClose, onSaved }: { h: HolderAdminRow | null; onClose: () => void; onSaved: () => void }) {
  const { run, busy, node } = useToastAction();
  const [f, setF] = useState<Form>(h ? { account_id: h.account_id, title: h.title, first: h.first, last: h.last, shares: String(h.shares), tax_id: "", phone: h.phone, email: h.email } : EMPTY);
  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const shares = Number(f.shares);
  const ok = f.account_id.trim() !== "" && (f.first.trim() !== "" || f.last.trim() !== "") && Number.isInteger(shares) && shares >= 0 && (h ? true : f.tax_id.trim() !== "");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const body = { ...f, shares };
    const done = await run(() => h ? api(`/api/admin/holders/${encodeURIComponent(h.account_id)}`, { method: "PUT", body }) : api("/api/admin/holders", { method: "POST", body }), h ? "บันทึกแล้ว" : "เพิ่มผู้ถือหุ้นแล้ว");
    if (done) onSaved();
  };
  return (
    <Modal title={h ? `แก้ไขผู้ถือหุ้น ${h.account_id}` : "เพิ่มผู้ถือหุ้น"} onClose={() => !busy && onClose()}
      actions={<><button className="btn" disabled={busy} onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy || !ok} onClick={save}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button></>}>
      <form onSubmit={save}>
        <div className="field"><label className="label" htmlFor="h-acc">เลขทะเบียน</label><input id="h-acc" className="input" disabled={!!h} maxLength={15} value={f.account_id} onChange={set("account_id")} /></div>
        <div className="field"><label className="label" htmlFor="h-t">คำนำหน้า</label><input id="h-t" className="input" value={f.title} onChange={set("title")} /></div>
        <div className="field"><label className="label" htmlFor="h-f">ชื่อ</label><input id="h-f" className="input" value={f.first} onChange={set("first")} /></div>
        <div className="field"><label className="label" htmlFor="h-l">นามสกุล</label><input id="h-l" className="input" value={f.last} onChange={set("last")} /></div>
        <div className="field"><label className="label" htmlFor="h-s">จำนวนหุ้น</label><input id="h-s" className="input" type="number" min={0} value={f.shares} onChange={set("shares")} />
          {h?.registered && <p className="muted" style={{ fontSize: 12 }}>ลงทะเบียนในการประชุมนี้แล้ว — เปลี่ยนจำนวนหุ้นไม่ได้</p>}</div>
        <div className="field"><label className="label" htmlFor="h-x">เลขบัตรประชาชน / เลขผู้เสียภาษี</label>
          <input id="h-x" className="input" autoComplete="off" value={f.tax_id} onChange={set("tax_id")} placeholder={h ? `ปัจจุบัน ${h.masked_id} — เว้นว่างไว้ถ้าไม่เปลี่ยน` : ""} /></div>
        <div className="field"><label className="label" htmlFor="h-p">เบอร์โทร</label><input id="h-p" className="input" value={f.phone} onChange={set("phone")} /></div>
        <div className="field"><label className="label" htmlFor="h-e">อีเมล</label><input id="h-e" className="input" type="email" value={f.email} onChange={set("email")} /></div>
        <button type="submit" hidden />
      </form>
      {node}
    </Modal>
  );
}

interface ImportErr { row: number; msg: string }

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { show, node } = useToastAction();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [name, setName] = useState("");
  const [errs, setErrs] = useState<ImportErr[]>([]);
  const [preview, setPreview] = useState<{ created: number; updated: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name); setErrs([]); setPreview(null); setRows(null);
    const table = parseCsv(await file.text());
    if (table.length < 2) { setErrs([{ row: 0, msg: "ไฟล์ว่างหรือไม่มีแถวข้อมูล" }]); return; }
    const map = table[0].map((h) => COLS[h.trim().toLowerCase()] ?? COLS[h.trim()]);
    if (!map.includes("account_id")) { setErrs([{ row: 0, msg: "ไม่พบหัวคอลัมน์ account_id (เลขทะเบียน)" }]); return; }
    const out = table.slice(1).map((r) => {
      const o: Record<string, unknown> = {};
      map.forEach((k, i) => { if (k) o[k] = (r[i] ?? "").trim(); });
      o.shares = Number(String(o.shares ?? "0").replace(/,/g, "")) || 0;
      return o;
    });
    setRows(out);
    await send(out, true);
  };

  async function send(data: Record<string, unknown>[], dry: boolean) {
    setBusy(true); setErrs([]);
    try {
      const r = await api<{ created: number; updated: number }>("/api/admin/holders/import", { method: "POST", body: { rows: data, dry_run: dry } });
      if (dry) setPreview(r);
      else { show(`นำเข้าแล้ว: เพิ่ม ${r.created} · อัปเดต ${r.updated}`); onDone(); }
    } catch (e) {
      setPreview(null);
      const body = e instanceof ApiError ? e.data?.errors : undefined;
      setErrs(body && body.length ? body : [{ row: 0, msg: errMsg(e) }]);
    } finally { setBusy(false); }
  }

  return (
    <Modal title="นำเข้าทะเบียนผู้ถือหุ้น (CSV)" onClose={() => !busy && onClose()}
      actions={<><button className="btn" disabled={busy} onClick={onClose}>ปิด</button>
        <button className="btn btn-primary" disabled={busy || !rows || !preview} onClick={() => rows && send(rows, false)}>{busy ? "กำลังนำเข้า..." : "ยืนยันนำเข้า"}</button></>}>
      <p className="muted" style={{ fontSize: 13 }}>ไฟล์ CSV (UTF-8) แถวแรกเป็นหัวคอลัมน์: <code>account_id, title, first, last, shares, tax_id, phone, email</code> (ไทยได้: เลขทะเบียน, คำนำหน้า, ชื่อ, นามสกุล, จำนวนหุ้น, เลขบัตร, เบอร์โทร, อีเมล) — เลขทะเบียนที่มีอยู่แล้วจะถูกอัปเดต ถ้ามีแถวผิดแม้แถวเดียวจะไม่นำเข้าเลย</p>
      <div className="field"><label className="label" htmlFor="imp-f">เลือกไฟล์</label><input id="imp-f" type="file" accept=".csv,text/csv" onChange={onFile} /></div>
      {name && rows && <p style={{ fontSize: 13 }}>{name}: {fmt(rows.length)} แถว</p>}
      {preview && <p className="c-green" role="status"><b>ตรวจแล้วผ่าน:</b> จะเพิ่มใหม่ {fmt(preview.created)} · อัปเดต {fmt(preview.updated)} — กด &quot;ยืนยันนำเข้า&quot;</p>}
      {errs.length > 0 && (
        <div role="alert" className="error-text" style={{ maxHeight: 180, overflow: "auto" }}>
          {errs.map((x, i) => <div key={i}>{x.row > 0 ? `แถวที่ ${x.row}: ` : ""}{x.msg}</div>)}
        </div>
      )}
      {node}
    </Modal>
  );
}

function Body() {
  const { closed } = useMeeting();
  const { show, node } = useToastAction();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<HolderAdminRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useApi<HolderAdminList>(`/api/admin/holders?limit=${PAGE}&offset=${page * PAGE}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`, "staff");
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  return (
    <>
      <PageHead title="ทะเบียนผู้ถือหุ้น" sub={`ทั้งหมด ${fmt(data?.total ?? 0)} ราย`}
        actions={<><button className="btn" onClick={() => setImporting(true)}><Icon name="upload" size={15} className="ico-inl" />นำเข้า CSV</button>
          <button className="btn btn-primary" onClick={() => setEdit("new")}>+ เพิ่มผู้ถือหุ้น</button></>} />
      {closed && <p className="muted">การประชุมปิดแล้ว — แก้ไขทะเบียนผู้ถือหุ้นยังทำได้ แต่จะไม่กระทบผลของการประชุมที่ปิดไปแล้ว</p>}
      <div className="adm-filter">
        <div className="adm-search"><span aria-hidden className="ico-box"><Icon name="search" size={18} /></span>
          <input aria-label="ค้นหาผู้ถือหุ้น" placeholder="ค้นหา เลขทะเบียน / ชื่อ / เลขบัตร" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="adm-count muted">แสดง {fmt(data?.items.length ?? 0)} จาก {fmt(data?.total ?? 0)}</span>
      </div>
      <State loading={loading && !data} error={data ? "" : error} empty={data?.items.length === 0} emptyText="ไม่พบผู้ถือหุ้น">
        <div className="adm-card adm-tablecard">
          <table className="adm-table">
            <thead><tr><th>ผู้ถือหุ้น</th><th>หุ้น</th><th>เลขบัตร</th><th>ติดต่อ</th><th>การประชุม</th><th /></tr></thead>
            <tbody>
              {data?.items.map((h) => (
                <tr key={h.account_id}>
                  <td><div className="adm-who"><Avatar name={h.first || h.account_id} size={34} /><div><b>{`${h.title} ${h.first} ${h.last}`.trim()}</b><div className="muted mono">{h.account_id}</div></div></div></td>
                  <td><b>{fmt(h.shares)}</b></td>
                  <td className="mono">{h.masked_id}</td>
                  <td>{h.phone || "-"}<div className="muted" style={{ fontSize: 11 }}>{h.email}</div></td>
                  <td>{h.registered ? <span className="badge badge-green">ลงทะเบียนแล้ว</span> : <span className="badge">ยังไม่ลงทะเบียน</span>}</td>
                  <td style={{ textAlign: "right" }}><button className="adm-act" onClick={() => setEdit(h)}>แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && <Pager page={page} pages={pages} onPage={setPage} />}
      </State>
      {edit && <HolderModal h={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); show("นำเข้าเสร็จสิ้น"); }} />}
      {node}
    </>
  );
}

export default function Page() { return <AdminFrame title="ทะเบียนผู้ถือหุ้น"><Body /></AdminFrame>; }
