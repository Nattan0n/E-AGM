"use client";
import { Icon } from "@/components/brand/Icon";
import { Select } from "@/components/Select";
import { FormEvent, useMemo, useState } from "react";
import { api, getSession, StaffSession } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { AdModal as Modal } from "@/components/admin/AdModal";
import { useIsDesktop } from "@/lib/media";
import type { Role, UserRow } from "@/lib/types";
import { AdminFrame, Avatar, PageHead, State, Switch, useToastAction } from "@/components/admin/common";

const ROLES: { k: Role; label: string; desc: string; icon: string; cls: string }[] = [
  { k: "admin", label: "Admin", desc: "จัดการทุกอย่าง รวมถึงวาระ ผู้ใช้ และตั้งค่า", icon: "shield", cls: "badge badge-red" },
  { k: "staff", label: "Staff", desc: "ลงทะเบียน ลงคะแนน และจัดการหน้างาน", icon: "user", cls: "badge badge-blue" },
  { k: "viewer", label: "Viewer", desc: "ดูข้อมูลและสรุปผลได้อย่างเดียว", icon: "eye", cls: "badge badge-cyan" },
];

interface Form { id?: number; username: string; fullname: string; dept: string; role: Role; active: boolean; password: string }
const EMPTY: Form = { username: "", fullname: "", dept: "", role: "staff", active: true, password: "" };

function Body() {
  const { data, error, loading, reload } = useApi<UserRow[]>("/api/admin/users");
  const { run, busy, node } = useToastAction();
  const [form, setForm] = useState<Form | null>(null);
  const desktop = useIsDesktop();
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [stFilter, setStFilter] = useState("");
  const [q, setQ] = useState("");
  const [formErr, setFormErr] = useState("");
  const me = getSession<StaffSession>("staff")?.username;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.forEach((u) => { c[u.role] = (c[u.role] ?? 0) + 1; });
    return c;
  }, [data]);
  const rows = (data ?? []).filter((u) => (!roleFilter || u.role === roleFilter) && (!stFilter || (stFilter === "on" ? u.active : !u.active)) &&
    (!q.trim() || [u.username, u.fullname, u.dept].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))));
  const activeN = data?.filter((u) => u.active).length ?? 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.password && form.password.length < 8) { setFormErr("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
    if (!form.id && !form.password) { setFormErr("กรุณากำหนดรหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"); return; }
    setFormErr("");
    const ok = await run(() => form.id
      ? api(`/api/admin/users/${form.id}`, { method: "PUT", body: { fullname: form.fullname, dept: form.dept, role: form.role, active: form.active, ...(form.password ? { password: form.password } : {}) } })
      : api("/api/admin/users", { method: "POST", body: { username: form.username.trim(), fullname: form.fullname, dept: form.dept, role: form.role, password: form.password } }),
      form.id ? "บันทึกผู้ใช้แล้ว" : "สร้างผู้ใช้แล้ว");
    if (ok) { setForm(null); reload(); }
  };
  const toggleActive = async (u: UserRow) => {
    const ok = await run(() => api(`/api/admin/users/${u.id}`, { method: "PUT", body: { fullname: u.fullname, dept: u.dept, role: u.role, active: !u.active } }),
      u.active ? `ปิดใช้งาน ${u.username} แล้ว` : `เปิดใช้งาน ${u.username} แล้ว`);
    if (ok) reload();
  };
  const open = (f: Form) => { setFormErr(""); setForm(f); };

  return (
    <>
      <PageHead title="จัดการผู้ใช้งาน" sub={desktop ? "เพิ่ม แก้ไข และกำหนดสิทธิ์ผู้ใช้ระบบ E-AGM" : "จัดการสิทธิ์และบัญชีผู้ใช้ในระบบ E-AGM"} actions={<button className="btn btn-primary" onClick={() => open(EMPTY)}>+ เพิ่มผู้ใช้</button>} />
      {desktop ? (
        <div className="adm-filter">
          <label className="adm-fl">Role
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")}>
              <option value="">ทั้งหมด</option>{ROLES.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
            </Select></label>
          <label className="adm-fl">สถานะ
            <Select value={stFilter} onChange={(e) => setStFilter(e.target.value)}>
              <option value="">ทั้งหมด</option><option value="on">ใช้งาน</option><option value="off">ปิดใช้งาน</option>
            </Select></label>
          <div className="adm-search"><span aria-hidden className="ico-box"><Icon name="search" size={18} /></span><input aria-label="ค้นหาผู้ใช้" placeholder="ค้นหาชื่อ / username / แผนก" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="adm-count muted">ผู้ใช้งาน {data?.length ?? 0} คน</span>
        </div>
      ) : (
        <>
          <div className="adm-tabs adm-tabs-line" role="group" aria-label="กรองสิทธิ์">
            <button className={roleFilter === "" ? "on" : ""} onClick={() => setRoleFilter("")}>ทั้งหมด ({data?.length ?? 0})</button>
            {ROLES.map((r) => <button key={r.k} className={roleFilter === r.k ? "on" : ""} onClick={() => setRoleFilter(roleFilter === r.k ? "" : r.k)}>{r.label} ({counts[r.k] ?? 0})</button>)}
          </div>
          <div className="adm-filter" style={{ marginTop: 12 }}><div className="adm-search"><span aria-hidden className="ico-box"><Icon name="search" size={18} /></span><input aria-label="ค้นหาผู้ใช้" placeholder="ค้นหาชื่อ / username / แผนก" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
          <div className="adm-strip">
            <div><b className="c-blue">{data?.length ?? 0}</b><span>ทั้งหมด</span></div>
            <div><b className="c-green">{activeN}</b><span>ใช้งานได้</span></div>
            <div><b className="c-gray">{(data?.length ?? 0) - activeN}</b><span>ระงับ</span></div>
            <div><b className="c-purple">{counts.admin ?? 0}</b><span>Admin</span></div>
          </div>
        </>
      )}
      <State loading={loading} error={error} empty={rows.length === 0} emptyText="ไม่พบผู้ใช้">
        {desktop ? (
          <div className="adm-card adm-tablecard">
            <table className="adm-table">
              <thead><tr><th>ผู้ใช้</th><th>แผนก</th><th>สิทธิ์</th><th>สถานะ</th><th style={{ textAlign: "right" }}>จัดการ</th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const r = ROLES.find((x) => x.k === u.role);
                  return (
                    <tr key={u.id}>
                      <td><div className="adm-who"><Avatar name={u.fullname || u.username} size={36} /><div><b>{u.fullname || u.username}</b><div className="muted" style={{ fontSize: 11 }}>@{u.username}</div></div></div></td>
                      <td>{u.dept || "-"}</td>
                      <td><span className={`adm-role adm-role-${u.role}`}>{r?.label ?? u.role}</span></td>
                      <td><span className={`adm-dot ${u.active ? "on" : ""}`}>{u.active ? "ใช้งาน" : "ระงับ"}</span></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="adm-act" onClick={() => open({ id: u.id, username: u.username, fullname: u.fullname, dept: u.dept, role: u.role, active: u.active, password: "" })}>แก้ไข / รีเซ็ตรหัส</button>{" "}
                        <button className={`adm-act ${u.active ? "danger" : ""}`} disabled={busy || u.username === me} title={u.username === me ? "ไม่สามารถปิดบัญชีของตัวเอง" : undefined} onClick={() => toggleActive(u)}>{u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="adm-tfoot">แสดง {rows.length} จาก {data?.length ?? 0} รายการ</div>
          </div>
        ) : (
          <ul className="adm-list">
            {rows.map((u) => (
              <li key={u.id} className="adm-urow">
                <Avatar name={u.fullname || u.username} size={44} />
                <div className="adm-urow-m">
                  <b>{u.fullname || u.username}</b>
                  <span className="muted">@{u.username}{u.dept ? ` · ${u.dept}` : ""}</span>
                  <div className="adm-pills"><span className={`adm-role adm-role-${u.role}`}>{ROLES.find((x) => x.k === u.role)?.label ?? u.role}</span><span className={`adm-dot ${u.active ? "on" : ""}`}>{u.active ? "ใช้งาน" : "ระงับ"}</span></div>
                </div>
                <div className="adm-urow-a">
                  <Switch on={u.active} disabled={busy || u.username === me} label={u.username === me ? "ไม่สามารถปิดบัญชีของตัวเอง" : u.active ? `ปิดใช้งาน ${u.username}` : `เปิดใช้งาน ${u.username}`} onChange={() => toggleActive(u)} />
                  <button className="adm-icobtn" aria-label={`แก้ไข ${u.username}`} onClick={() => open({ id: u.id, username: u.username, fullname: u.fullname, dept: u.dept, role: u.role, active: u.active, password: "" })}><Icon name="edit" size={17} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </State>

      {form && (
        <Modal title={form.id ? `แก้ไขผู้ใช้ ${form.username}` : "เพิ่มผู้ใช้"} onClose={() => !busy && setForm(null)}>
          <form onSubmit={save}>
            <div className="field"><label className="label" htmlFor="un">ชื่อผู้ใช้</label>
              <input id="un" className="input" required disabled={!!form.id} value={form.username} autoComplete="off" onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="fn">ชื่อ-นามสกุล</label>
              <input id="fn" className="input" value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="dp">แผนก</label>
              <input id="dp" className="input" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="rl">สิทธิ์</label>
              <Select id="rl" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
              </Select></div>
            <div className="field"><label className="label" htmlFor="pw">{form.id ? "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"}</label>
              <input id="pw" className="input" type="password" autoComplete="new-password" minLength={form.password ? 8 : undefined} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            {form.id && (
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={form.active} disabled={form.username === me} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> เปิดใช้งานบัญชี
              </label>
            )}
            {formErr && <p className="error-text" role="alert">{formErr}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => setForm(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
            </div>
          </form>
        </Modal>
      )}
      {node}
    </>
  );
}

export default function Page() { return <AdminFrame title="ผู้ใช้งาน"><Body /></AdminFrame>; }
