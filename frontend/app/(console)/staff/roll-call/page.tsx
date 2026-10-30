"use client";
import { Icon } from "@/components/brand/Icon";
import { Select } from "@/components/Select";
import { useEffect, useMemo, useState } from "react";
import { CHOICE_LABEL, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/media";
import type { Agenda, Choice, RollRow } from "@/lib/types";
import { Avatar, Metrics, SearchIcon, StaffPage, styles } from "@/components/staff/common";
import r from "./roll.module.css";

export default function RollCallPage() {
  return <StaffPage title="ผลรายผู้ถือหุ้น" sub="ดูว่าผู้ถือหุ้นแต่ละรายลงคะแนนอะไรในวาระที่เลือก — ใช้ตรวจเทียบกับบัตรลงคะแนนก่อนปิดวาระ">{() => <Roll />}</StaffPage>;
}

type View = "all" | "voted" | "not_voted" | "no_right";
const VIEWS: { k: View; label: string }[] = [
  { k: "all", label: "ทั้งหมด" }, { k: "voted", label: "ลงแล้ว" }, { k: "not_voted", label: "ยังไม่ลง" }, { k: "no_right", label: "ไม่มีสิทธิ์" },
];
const CH_CLS: Record<Choice, string> = { agree: styles.tGreen, disagree: styles.tRed, abstain: styles.tAmber, spoiled: "" };

/** What was recorded, in words: one choice, or the split of a custodian. */
function outcome(x: RollRow): { text: string; cls: string } {
  if (x.state === "no_right") return { text: "ไม่มีสิทธิ์ออกเสียง", cls: styles.tBlue };
  if (x.state === "not_voted") return { text: "ยังไม่ลง · นับเห็นด้วย", cls: "" };
  const parts = (["agree", "disagree", "abstain", "spoiled"] as const).filter((c) => x[c] > 0);
  if (parts.length === 1) return { text: CHOICE_LABEL[parts[0]], cls: CH_CLS[parts[0]] };
  return { text: parts.map((c) => `${CHOICE_LABEL[c]} ${fmt(x[c])}`).join(" · "), cls: styles.tAmber };
}

const clock = (v: string) => { const d = new Date(v); return !v || isNaN(d.getTime()) ? "-" : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };

function Roll() {
  const desktop = useIsDesktop();
  const { data: agendas, loading, error } = useApi<Agenda[]>("/api/agendas", "staff", 8000);
  const [sel, setSel] = useState("");
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  useEffect(() => { document.body.classList.add("print-roll"); return () => document.body.classList.remove("print-roll"); }, []);

  const voteable = useMemo(() => (agendas ?? []).filter((a) => a.vote_type !== "info"), [agendas]);
  const termId = voteable.some((a) => a.term_id === sel) ? sel : (voteable.find((a) => a.status === "open") ?? voteable[0])?.term_id ?? "";
  const agenda = voteable.find((a) => a.term_id === termId);
  const { data: rows, error: rowsErr, loading: rowsLoading } = useApi<RollRow[]>(termId ? `/api/vote/roll?term_id=${encodeURIComponent(termId)}` : null, "staff", 8000);

  const count = (st: RollRow["state"]) => rows?.filter((x) => x.state === st).length ?? 0;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((x) => (view === "all" || x.state === view) && (!t || x.name.toLowerCase().includes(t) || x.account_id.toLowerCase().includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rows, view, q]);

  if (loading && !agendas) return <p className={styles.empty}>กำลังโหลดวาระ...</p>;
  if (error && !agendas) return <p className={styles.errText}>{error}</p>;
  if (voteable.length === 0) return <p className={styles.empty}>ยังไม่มีวาระที่ลงคะแนนได้</p>;

  return (
    <>
      <div className={`${styles.card} ${r.noprint}`}>
        <div className={r.pick}>
          <label className={r.cap} htmlFor="roll-ag">วาระ</label>
          <Select id="roll-ag" className={`${styles.sel} ${styles.block}`} value={termId} onChange={(e) => setSel(e.target.value)}>
            {voteable.map((a) => <option key={a.term_id} value={a.term_id}>{`วาระ ${a.term_id} — ${a.name}`}</option>)}
          </Select>
        </div>
      </div>

      <div className={r.printHead}>
        <b>ผลรายผู้ถือหุ้น — วาระ {agenda?.term_id}</b>
        <div>{agenda?.name}</div>
        <div>พิมพ์เมื่อ {new Date().toLocaleString("th-TH")}</div>
      </div>

      <Metrics cols="three" items={[
        { v: fmt(count("voted")), l: "ลงคะแนนแล้ว (ราย)", c: "cGreen" },
        { v: fmt(count("not_voted")), l: "ยังไม่ลง — นับเห็นด้วย", c: "cAmber" },
        { v: fmt(count("no_right")), l: "ไม่มีสิทธิ์ออกเสียง", c: "cBlue" },
      ]} />

      <div className={`${styles.card} ${styles.searchRow} ${r.noprint}`}>
        <div className={styles.sbox}>
          <SearchIcon />
          <input aria-label="ค้นหาในรายการ" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / เลขทะเบียน" autoComplete="off" />
        </div>
        <button className={styles.btn} onClick={() => window.print()} disabled={shown.length === 0}><Icon name="print" size={16} className="ico-inl" />พิมพ์</button>
      </div>
      <div className={`${styles.seg} ${r.noprint}`} role="tablist" style={{ maxWidth: 520 }}>
        {VIEWS.map((v) => (
          <button key={v.k} role="tab" aria-selected={view === v.k} className={`${styles.segBtn} ${view === v.k ? styles.segOn : ""}`} onClick={() => setView(v.k)}>{v.label}</button>
        ))}
      </div>

      {rowsErr && !rows && <p className={styles.errText}>{rowsErr}</p>}
      {rowsLoading && !rows && <p className={styles.empty}>กำลังโหลด...</p>}
      {rows && !desktop && (
        <div className={styles.list}>
          <div className={styles.listHead}><span>แสดง {fmt(shown.length)} จาก {fmt(rows.length)} ราย · วาระ {agenda?.term_id}</span><span>เรียงตามชื่อ</span></div>
          {shown.map((x) => {
            const o = outcome(x);
            return (
              <div key={x.account_id} className={styles.item}>
                <Avatar name={x.name} />
                <span className={styles.grow}>
                  <div className={styles.name}>{x.name}</div>
                  <div className={styles.meta}>{x.account_id} · {x.channel === "online" ? "Online" : "Onsite"}{x.by ? ` · ${x.by} ${clock(x.at)}` : ""}</div>
                </span>
                <span className={styles.right}><span className={`${styles.tag} ${o.cls} ${r.res}`}>{o.text}</span><span className={styles.meta}>{fmt(x.shares)} หุ้น</span></span>
              </div>
            );
          })}
          {shown.length === 0 && <p className={styles.empty}>ไม่พบรายการ</p>}
        </div>
      )}
      {rows && desktop && (
        <div className={styles.tableCard}>
          <div className={styles.tableHead}><span>แสดง <b>{fmt(shown.length)}</b> จาก {fmt(rows.length)} ราย · วาระ {agenda?.term_id}</span></div>
          <div className={styles.tableScroll}>
            <table className={styles.tbl}>
              <thead><tr><th>#</th><th>ผู้ถือหุ้น</th><th>ช่องทาง</th><th className={styles.num}>หุ้น</th><th>ผลที่บันทึก</th><th>ผู้บันทึก</th><th>เวลา</th></tr></thead>
              <tbody>
                {shown.map((x, i) => {
                  const o = outcome(x);
                  return (
                    <tr key={x.account_id}>
                      <td>{i + 1}</td>
                      <td><div className={styles.cellHolder}><Avatar name={x.name} size="sm" /><div><div className={styles.name}>{x.name}</div><div className={styles.meta}>{x.account_id}</div></div></div></td>
                      <td>{x.channel === "online" ? <span className={`${styles.tag} ${styles.tCyan}`}>Online</span> : <span className={styles.tag}>Onsite</span>}</td>
                      <td className={`${styles.num} ${styles.shares}`}>{fmt(x.shares)}</td>
                      <td><span className={`${styles.tag} ${o.cls} ${r.res}`}>{o.text}</span></td>
                      <td>{x.by || "-"}</td>
                      <td>{clock(x.at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className={styles.empty}>ไม่พบรายการ</p>}
          </div>
        </div>
      )}
    </>
  );
}
