"use client";
import { Icon } from "@/components/brand/Icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHOICE_LABEL, fmt } from "@/lib/api";
import { Receipt } from "@/lib/types";
import { OnlineShell } from "@/components/online/OnlineShell";
import { useHolderApi, holderLogout } from "@/components/online/hooks";
import s from "@/components/online/online.module.css";

const dt = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime()) || d.getFullYear() < 2000 ? "-" : d.toLocaleString("th-TH");
};

export default function OnlineConfirm() {
  const router = useRouter();
  const { data, error, loading } = useHolderApi<Receipt>("/api/online/receipt");
  const logout = () => { void holderLogout((p) => router.replace(p)); };

  const chCls: Record<string, string> = { agree: s.bAgree, disagree: s.bDis, abstain: s.bAbs, spoiled: s.bSpo };
  const manual = data ? data.votes.filter((v) => !v.auto).length : 0;
  const footer = (
    <>
      <Link href="/online/vote" className={`btn ${s.cta} ${s.barbtn2}`}>กลับไปลงคะแนน</Link>
      <button type="button" className={`btn btn-primary ${s.cta} ${s.barbtn}`} onClick={() => window.print()}><Icon name="print" size={16} className="ico-inl" />พิมพ์ใบยืนยัน</button>
    </>
  );

  return (
    <OnlineShell title="ผลการลงคะแนนเสียง" step={4} width="col" auth onLogout={logout} footer={footer}>
      {loading && !data && <div className="muted">กำลังโหลด...</div>}
      {error && !data && <div className="error-text" role="alert">{error}</div>}
      {data && (
        <>
          <section className={s.success}>
            <div className={s.tick} aria-hidden="true">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <h2>บันทึกการลงคะแนนเรียบร้อยแล้ว</h2>
            <p>{manual > 0 ? `ท่านได้ลงคะแนนเสียงแล้ว ${manual} วาระ ขอบคุณสำหรับการมีส่วนร่วม` : "ขอบคุณสำหรับการมีส่วนร่วม"}</p>
            <span className={s.sealed}>ไม่สามารถแก้ไขหรือเปลี่ยนแปลงคะแนนได้หลังยืนยันแล้ว</span>
          </section>
          <section className={`${s.cardc} ${s.refcard}`}>
            <div className={s.reflabel}>หมายเลขอ้างอิง</div>
            <div className={s.ref}>{data.reference}</div>
            <div className={s.refgrid}>
              <div><span>ผู้ถือหุ้น</span><b>{data.name}</b></div>
              <div><span>เลขทะเบียน</span><b>{data.account_id}</b></div>
              <div><span>จำนวนหุ้น</span><b>{fmt(data.shares)} หุ้น</b></div>
              <div><span>ลงทะเบียนเมื่อ</span><b>{dt(data.registered_at)}</b></div>
              <div><span>ลงคะแนนล่าสุด</span><b>{dt(data.last_vote_at)}</b></div>
              <div><span>IP Address</span><b>{data.ip || "-"}</b></div>
            </div>
          </section>
          <section className={s.resultcard}>
            <div className={s.cardh2}>สรุปผลการลงคะแนนของท่าน</div>
            <div className={s.rows}>
              {data.votes.map((v) => (
                <div key={v.term_id} className={s.rrow}>
                  <span className={s.num}>{v.term_id}</span>
                  <span className={s.rowtxt}>{v.name}</span>
                  {v.auto
                    ? <span className={`${s.cb} ${s.bAuto}`}>นับเป็นเห็นด้วยอัตโนมัติ</span>
                    : <span className={`${s.cb} ${chCls[v.choice] ?? ""}`}>{CHOICE_LABEL[v.choice] ?? v.choice}</span>}
                </div>
              ))}
              {data.votes.length === 0 && <div className="muted" style={{ padding: 16 }}>ไม่มีวาระที่ต้องลงคะแนน</div>}
            </div>
          </section>
          <button type="button" className={`btn btn-block ${s.noprint}`} onClick={logout}>ออกจากระบบ</button>
        </>
      )}
    </OnlineShell>
  );
}
