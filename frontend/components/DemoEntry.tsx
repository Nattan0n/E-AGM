"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MOCK, mockReset, mockSignIn } from "@/lib/mock";

/** Demo-mode shortcuts (NEXT_PUBLIC_MOCK=1): jump straight into each role without filling any form. */
export function DemoEntry() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!MOCK) return null;
  const go = (kind: "holder" | "staff" | "admin", to: string) => { mockSignIn(kind); router.push(to); };
  const btn = { flex: 1, minWidth: 120, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,.4)", background: "rgba(255,255,255,.14)", color: "#fff", font: "inherit", fontWeight: 600, cursor: "pointer" } as const;
  if (!open) {
    return (
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button onClick={() => setOpen(true)} style={{ background: "transparent", border: 0, color: "rgba(255,255,255,.55)", font: "inherit", fontSize: 12, cursor: "pointer" }}>โหมดทดลอง ▾</button>
      </div>
    );
  }
  return (
    <div style={{ margin: "18px auto 0", maxWidth: 560, padding: 14, borderRadius: 16, border: "1px dashed rgba(255,255,255,.5)", color: "#fff", textAlign: "center" }}>
      <div style={{ fontSize: 13, marginBottom: 10, opacity: .9 }}>
        <button onClick={() => setOpen(false)} aria-label="ซ่อน" style={{ float: "right", background: "transparent", border: 0, color: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>โหมดทดลอง — เข้าได้ทันที ไม่ต้องกรอกข้อมูล (ข้อมูลเป็นตัวอย่าง)</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => go("holder", "/online/waiting")}>ผู้ถือหุ้น</button>
        <button style={btn} onClick={() => go("staff", "/staff")}>เจ้าหน้าที่</button>
        <button style={btn} onClick={() => go("admin", "/admin")}>ผู้ดูแลระบบ</button>
      </div>
      <button style={{ ...btn, flex: "none", marginTop: 8, fontSize: 12, padding: "6px 10px", background: "transparent" }} onClick={() => { mockReset(); sessionStorage.clear(); location.reload(); }}>รีเซ็ตข้อมูลตัวอย่าง</button>
    </div>
  );
}
