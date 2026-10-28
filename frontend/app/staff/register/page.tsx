"use client";
import { Icon } from "@/components/brand/Icon";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errMsg, fmt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { GroupItem, HolderItem, Stats } from "@/lib/types";
import { Avatar, Ctx, fetchHolder, HolderPicker, StaffPage, StatusBadge, styles } from "@/components/staff/common";

export default function RegisterPage() {
  return (
    <StaffPage title="ลงทะเบียน" sub="ยืนยันตัวตนและลงทะเบียนผู้ถือหุ้นเข้าร่วมประชุม Onsite">
      {(c) => <Suspense fallback={<p className={styles.empty}>กำลังโหลด...</p>}><Register {...c} /></Suspense>}
    </StaffPage>
  );
}

function Register(c: Ctx) {
  const [mode, setMode] = useState<"individual" | "group">("individual");
  return (
    <>
      <div className={styles.seg} role="tablist" style={{ maxWidth: 380 }}>
        {(["individual", "group"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`${styles.segBtn} ${mode === m ? styles.segOn : ""}`} onClick={() => setMode(m)}>
            {m === "individual" ? "รายบุคคล" : "กลุ่ม (กองทุน / นิติบุคคล)"}
          </button>
        ))}
      </div>
      {mode === "individual" ? <Individual {...c} /> : <Group {...c} />}
    </>
  );
}

const pct = (n: number, total?: number) => (total ? `${((n / total) * 100).toFixed(2)}%` : "-");

function Individual({ canWrite, toast }: Ctx) {
  const router = useRouter();
  const acc = useSearchParams().get("acc") ?? "";
  const { data: stats } = useApi<Stats>("/api/stats");
  const [h, setH] = useState<HolderItem | null>(null);
  const [loading, setLoading] = useState(!!acc);
  const [checked, setChecked] = useState(false);
  const [type, setType] = useState<"person" | "proxy">("person");
  const [proxy, setProxy] = useState("");
  const [shares, setShares] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = useCallback((x: HolderItem) => { setH(x); setShares(String(x.shares)); setChecked(false); setType("person"); setProxy(""); }, []);
  useEffect(() => {
    if (!acc) return;
    let live = true;
    fetchHolder(acc).then((x) => { if (live) { if (x) choose(x); else toast("ไม่พบผู้ถือหุ้น " + acc, true); } })
      .catch((e) => toast(errMsg(e), true)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [acc, choose, toast]);

  const n = Number(shares);
  const sharesOk = !!h && Number.isInteger(n) && n >= 1 && n <= h.shares;
  const valid = !!h && h.status === "none" && checked && sharesOk && (type === "person" || proxy.trim() !== "");

  async function submit() {
    if (!h || !valid) return;
    setBusy(true);
    try {
      await api("/api/registration", { method: "POST", body: { account_id: h.account_id, type, proxy_name: type === "proxy" ? proxy.trim() : "", shares: n } });
      toast("ลงทะเบียนสำเร็จ — พิมพ์บัตรลงคะแนนได้เลย");
      router.push(`/staff/ballots?acc=${encodeURIComponent(h.account_id)}`);
    } catch (e) { toast(errMsg(e), true); setBusy(false); }
  }

  if (loading) return <p className={styles.empty}>กำลังโหลดข้อมูลผู้ถือหุ้น...</p>;
  if (!h) return <div className={styles.card}><HolderPicker onPick={choose} /></div>;
  return (
    <>
      <div className={styles.regGrid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>ข้อมูลผู้ถือหุ้น</div>
          <div className={styles.hero}>
            <Avatar name={h.name} size="lg" />
            <div className={styles.grow}>
              <div className={styles.name} style={{ fontSize: 17, whiteSpace: "normal" }}>{h.name}</div>
              <div className={styles.meta}>{h.account_id} · {h.masked_id}</div>
              <div className={styles.row} style={{ marginTop: 4 }}>
                <span className={styles.bigShares}>{fmt(h.shares)}</span><span className={styles.muted}>หุ้น ({pct(h.shares, stats?.total_shares)})</span>
              </div>
            </div>
          </div>
          <div className={styles.infoRows} style={{ marginTop: 10 }}>
            <div><span>สถานะ</span><b><StatusBadge status={h.status} /></b></div>
            <div><span>ชื่อ-นามสกุล</span><b>{h.name}</b></div>
            <div><span>เลขบัตรประชาชน</span><b>{h.masked_id}</b></div>
            <div><span>โทรศัพท์</span><b>{h.phone || "-"}</b></div>
          </div>
          {h.status !== "none" && <p className={styles.errText}>ผู้ถือหุ้นรายนี้ลงทะเบียนแล้ว ({h.status === "onsite" ? "Onsite" : "Online"}) — ไม่สามารถลงทะเบียนซ้ำได้</p>}
          <label className={styles.check} style={{ marginTop: 10 }}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>ตรวจสอบเอกสารยืนยันตัวตนแล้ว (บัตรประชาชน{type === "proxy" ? " / หนังสือมอบฉันทะ" : ""}) ข้อมูลถูกต้องครบถ้วน</span>
          </label>
        </div>

        <div className={styles.stack}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>ประเภทการเข้าร่วมประชุม</div>
            <div className={styles.typeCards} role="radiogroup">
              <button type="button" role="radio" aria-checked={type === "person"} className={`${styles.typeCard} ${type === "person" ? styles.typeOn : ""}`} onClick={() => setType("person")}>
                <i aria-hidden><Icon name="building" size={26} /></i><b>เข้าร่วมด้วยตนเอง</b><small>มาประชุม Onsite</small>
              </button>
              <button type="button" role="radio" aria-checked={type === "proxy"} className={`${styles.typeCard} ${type === "proxy" ? styles.typeOn : ""}`} onClick={() => setType("proxy")}>
                <i aria-hidden><Icon name="user" size={26} /></i><b>มอบฉันทะ</b><small>มอบสิทธิ์ให้ผู้อื่น</small>
              </button>
            </div>
            {type === "proxy" && (
              <div style={{ marginTop: 12 }}>
                <label className={styles.lbl} htmlFor="px">ชื่อผู้รับมอบฉันทะ *</label>
                <input id="px" className={styles.field} value={proxy} onChange={(e) => setProxy(e.target.value)} />
              </div>
            )}
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>จำนวนหุ้นที่ใช้สิทธิ์ (1 - {fmt(h.shares)})</div>
            <div className={styles.shareIn}>
              <input id="sh" aria-label="จำนวนหุ้น" type="number" inputMode="numeric" min={1} max={h.shares} value={shares} onChange={(e) => setShares(e.target.value)} />
              <span className={styles.muted} style={{ fontSize: 14 }}>หุ้น</span>
            </div>
            {shares !== "" && !sharesOk
              ? <p className={styles.errText}>จำนวนหุ้นต้องอยู่ระหว่าง 1 ถึง {fmt(h.shares)}</p>
              : <p className={styles.muted} style={{ marginTop: 6 }}>จำนวนสูงสุด: {fmt(h.shares)} หุ้น · คะแนน: {sharesOk ? pct(n, stats?.total_shares) : "-"} ของทั้งหมด</p>}
          </div>
        </div>
      </div>
      {!canWrite && <p className={styles.muted}>ไม่สามารถบันทึกได้ในโหมดอ่านอย่างเดียว</p>}
      <div className={styles.actionBar}>
        <button className={styles.btn} onClick={() => setH(null)} disabled={busy}>เลือกใหม่</button>
        <button className={`${styles.btn} ${styles.bPri}`} onClick={submit} disabled={!canWrite || !valid || busy}>{busy ? "กำลังบันทึก..." : <><Icon name="check" size={16} className="ico-inl" />ยืนยันลงทะเบียน</>}</button>
      </div>
    </>
  );
}

interface Member { h: HolderItem; shares: string }

function Group({ canWrite, toast }: Ctx) {
  const { data: groups, loading, error, reload } = useApi<GroupItem[]>("/api/registration/groups");
  const { data: stats } = useApi<Stats>("/api/stats");
  const [name, setName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);

  const add = (h: HolderItem) => {
    if (members.some((m) => m.h.account_id === h.account_id)) { toast("เพิ่มสมาชิกนี้แล้ว", true); return; }
    setMembers((m) => [...m, { h, shares: String(h.shares) }]);
  };
  const bad = members.some((m) => { const n = Number(m.shares); return !Number.isInteger(n) || n < 1 || n > m.h.shares; });
  const valid = name.trim() !== "" && members.length > 0 && !bad;
  const total = members.reduce((s, m) => s + (Number(m.shares) || 0), 0);

  async function submit() {
    setBusy(true);
    try {
      await api("/api/registration/group", { method: "POST", body: { name: name.trim(), members: members.map((m) => ({ account_id: m.h.account_id, shares: Number(m.shares) })) } });
      toast("ลงทะเบียนกลุ่มสำเร็จ");
      setName(""); setMembers([]);
      await reload();
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className={styles.heroBlue}>
        <div><div className={styles.mv}>{members.length}</div><div className={styles.ml}>สมาชิกในกลุ่ม</div></div>
        <div><div className={styles.mv}>{fmt(total)}</div><div className={styles.ml}>หุ้นรวม</div></div>
        <div><div className={styles.mv}>{pct(total, stats?.total_shares)}</div><div className={styles.ml}>% คะแนนรวม</div></div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.stack}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>ชื่อกลุ่ม</div>
            <input id="gn" className={styles.field} aria-label="ชื่อกลุ่ม" placeholder="ชื่อกลุ่ม / กองทุน *" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>เพิ่มผู้ถือหุ้นในกลุ่ม</div>
            <HolderPicker label="ค้นหาสมาชิก" onPick={add} filter={(h) => h.status === "none"} actionLabel="+ เพิ่ม" disabled={!canWrite} />
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>รายชื่อสมาชิกในกลุ่ม</div>
          {members.length === 0 && <p className={styles.empty}>ยังไม่มีสมาชิก — ค้นหาและเพิ่มผู้ถือหุ้น</p>}
          {members.map((m, i) => {
            const n = Number(m.shares);
            const ok = Number.isInteger(n) && n >= 1 && n <= m.h.shares;
            return (
              <div key={m.h.account_id} className={styles.memberRow}>
                <span className={styles.idx}>{i + 1}</span>
                <Avatar name={m.h.name} size="sm" />
                <div className={styles.grow}>
                  <div className={styles.name}>{m.h.name}</div>
                  <div className={styles.meta}>{m.h.account_id} · สูงสุด {fmt(m.h.shares)}</div>
                </div>
                <input className={styles.numIn} type="number" min={1} max={m.h.shares} value={m.shares} aria-label={`จำนวนหุ้น ${m.h.name}`} aria-invalid={!ok} style={ok ? undefined : { borderColor: "#ef4444" }}
                  onChange={(e) => setMembers((x) => x.map((y, j) => (j === i ? { ...y, shares: e.target.value } : y)))} />
                <button className={styles.xbtn} onClick={() => setMembers((x) => x.filter((_, j) => j !== i))} aria-label={`ลบ ${m.h.name}`}><Icon name="x" size={15} /></button>
              </div>
            );
          })}
          <div className={`${styles.totalBar} ${styles.cardFoot}`}>
            <span>รวมทั้งหมด ({members.length} สมาชิก)</span><b>{fmt(total)} หุ้น</b>
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        <button className={styles.btn} onClick={() => { setName(""); setMembers([]); }} disabled={busy || (!name && members.length === 0)}>ล้างข้อมูล</button>
        <button className={`${styles.btn} ${styles.bPri}`} onClick={submit} disabled={!canWrite || !valid || busy}>{busy ? "กำลังบันทึก..." : <><Icon name="check" size={16} className="ico-inl" />ลงทะเบียนกลุ่ม</>}</button>
      </div>

      <div className={styles.card}>
        <div className={`${styles.cardTitle} ${styles.big}`}>กลุ่มที่ลงทะเบียนแล้ว</div>
        {loading && <p className={styles.muted}>กำลังโหลด...</p>}
        {error && <p className={styles.errText}>{error}</p>}
        {groups && groups.length === 0 && <p className={styles.empty}>ยังไม่มีกลุ่ม</p>}
        {groups && groups.map((g) => (
          <Link key={g.id} href={`/staff/register/group/${g.id}`} className={styles.groupItem}>
            <span className={styles.groupBadge}>{g.code.replace(/^.*?-/, "").slice(0, 4)}</span>
            <div className={styles.grow}>
              <div className={styles.name}>{g.name}</div>
              <div className={styles.meta}>{g.code} · {g.members} สมาชิก</div>
            </div>
            <span className={styles.shares}>{fmt(g.shares)} หุ้น</span>
            <span className={styles.chev}>›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
