"use client";
import { useEffect } from "react";

/** Last-resort boundary: a page that fails to render shows a message instead of a blank screen,
 *  and a stale tab (old JS after a new deploy) reloads itself once. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const stale = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch RSC payload|Server Components render/i.test(`${error.name} ${error.message}`);
    if (!stale) return;
    try {
      if (sessionStorage.getItem("eagm_reloaded") === "1") return;
      sessionStorage.setItem("eagm_reloaded", "1");
    } catch { /* ignore */ }
    window.location.reload();
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", background: "rgba(255,255,255,.9)", borderRadius: 20, padding: 28, boxShadow: "0 10px 30px rgba(15,23,42,.15)" }}>
        <h2 style={{ color: "#1e3a8a", marginBottom: 8 }}>หน้านี้แสดงผลไม่ได้</h2>
        <p style={{ color: "#64748b", marginBottom: 16 }}>อาจเป็นเพราะระบบเพิ่งอัปเดต กรุณาโหลดหน้าใหม่</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#2563eb", color: "#fff", fontWeight: 600 }}>โหลดหน้าใหม่</button>
          <button onClick={() => reset()} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>ลองอีกครั้ง</button>
        </div>
      </div>
    </div>
  );
}
