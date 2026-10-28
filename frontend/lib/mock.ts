// Demo mode (NEXT_PUBLIC_MOCK=1): answers /api/* calls from in-memory data so the UI can be tried without the Go backend.
import type {
  Agenda, AuditRow, Choice, GroupItem, GroupMember, HolderItem, LateRow, Meeting, NovoteRow, OnlineAgenda, OnlineRegRow,
  Receipt, Stats, Summary, Tally, TermResult, UserRow, VoteRow,
} from "./types";

export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

interface Holder { account_id: string; name: string; shares: number; id_card: string; phone: string }
interface Vote { choice: Choice | "split"; agree: number; disagree: number; abstain: number; spoiled: number }
interface Reg { type: "person" | "proxy" | "group"; channel: "onsite" | "online"; vote_mode: "self" | "staff"; group?: string; shares: number; at: string }
interface State {
  meeting: Meeting; agendas: Agenda[]; regs: Record<string, Reg>; late: Record<string, string>; novote: NovoteRow[];
  groups: { id: number; name: string; members: GroupMember[] }[]; users: UserRow[]; votes: Record<string, Record<string, Vote>>; seq: number;
}

const NAMES = ["สมชาย ใจดี", "สมหญิง รักไทย", "วิชัย มั่นคง", "ประเสริฐ ศรีสุข", "มาลี สุขสันต์", "อนันต์ เจริญผล", "กัญญา วงศ์ไทย", "ธนากร พัฒนา",
  "สุรชัย แก้วมณี", "นภา ทองดี", "พิมพ์ใจ ชัยชนะ", "ณัฐพล บุญมา", "รัตนา สายสุวรรณ", "ชาตรี เลิศล้ำ", "อรุณี ศรีสวัสดิ์", "บริษัท ไทยพัฒนา จำกัด",
  "กองทุนรวมเพื่อการลงทุน A", "สมศักดิ์ ยิ่งยง", "วรรณา จันทร์เพ็ญ", "ปรีชา อินทรา"];
const HOLDERS: Holder[] = NAMES.map((name, i) => ({
  account_id: String(1001 + i), name, shares: [120000, 85000, 50000, 250000, 30000, 18000, 400000, 72000, 9000, 150000][i % 10] + i * 1000,
  id_card: `1${String(100000000000 + i * 7919).slice(0, 12)}`, phone: `08${String(10000000 + i * 12345).slice(0, 8)}`,
}));
const hold = (id: string) => HOLDERS.find((h) => h.account_id === id);
const maskId = (c: string) => `${c[0]}-${c.slice(1, 3)}XX-XXXXX-${c.slice(10, 12)}-${c[12]}`;
const empty = (): Tally => ({ agree: 0, disagree: 0, abstain: 0, spoiled: 0 });

function seed(): State {
  const mk = (id: number, term_id: string, name: string, status: Agenda["status"], vote_type: Agenda["vote_type"]): Agenda => ({ id, term_id, name, name_en: "", status, vote_type });
  const agendas: Agenda[] = [
    mk(1, "1", "รับรองรายงานการประชุมสามัญผู้ถือหุ้นครั้งที่ผ่านมา", "closed", "ordinary"),
    mk(2, "2", "รับทราบผลการดำเนินงานของบริษัทในรอบปีที่ผ่านมา", "closed", "info"),
    mk(3, "3", "พิจารณาอนุมัติงบแสดงฐานะการเงินและงบกำไรขาดทุน", "open", "ordinary"),
    mk(4, "4", "พิจารณาอนุมัติการจัดสรรกำไรและการจ่ายเงินปันผล", "pending", "ordinary"),
    mk(5, "5", "พิจารณาเลือกตั้งกรรมการแทนกรรมการที่ออกตามวาระ", "pending", "ordinary"),
    mk(6, "6", "พิจารณาแก้ไขเพิ่มเติมข้อบังคับของบริษัท", "pending", "special"),
  ];
  const meeting: Meeting = { id: 1, year: "2569", detail: "การประชุมสามัญผู้ถือหุ้น ประจำปี 2569 (ตัวอย่าง)", date: new Date().toISOString(), closed_at: null, online_enabled: true, advance_entry: false, room_open: true, quorum_pct: 25 };
  const regs: Record<string, Reg> = {};
  const now = new Date().toISOString();
  HOLDERS.slice(0, 8).forEach((h, i) => { regs[h.account_id] = { type: i === 2 ? "proxy" : "person", channel: "onsite", vote_mode: "self", shares: h.shares, at: now }; });
  HOLDERS.slice(8, 13).forEach((h, i) => { regs[h.account_id] = { type: "person", channel: "online", vote_mode: i === 1 ? "staff" : "self", shares: h.shares, at: now }; });
  const votes: State["votes"] = { "1": {}, "2": {}, "3": {} };
  Object.keys(regs).forEach((id, i) => {
    const c: Choice = i % 7 === 5 ? "disagree" : i % 9 === 4 ? "abstain" : "agree";
    const sh = regs[id].shares;
    const v: Vote = { choice: c, agree: 0, disagree: 0, abstain: 0, spoiled: 0 }; v[c] = sh;
    votes["1"][id] = v;
    if (i < 6) votes["3"][id] = { ...v };
  });
  return {
    meeting, agendas, regs, late: {}, novote: [{ id: 1, term_id: "3", account_id: "1020", name: hold("1020")!.name, shares: hold("1020")!.shares }],
    groups: [{ id: 1, name: "กองทุนตัวอย่าง (กลุ่ม)", members: [{ account_id: "1016", name: hold("1016")!.name, shares: 30000 }, { account_id: "1017", name: hold("1017")!.name, shares: 20000 }] }],
    users: [
      { id: 1, username: "admin", fullname: "ผู้ดูแลระบบ (ตัวอย่าง)", dept: "ITD", role: "admin", active: true },
      { id: 2, username: "staff1", fullname: "เจ้าหน้าที่ ตัวอย่าง", dept: "OMD", role: "staff", active: true },
      { id: 3, username: "viewer1", fullname: "ผู้สังเกตการณ์", dept: "ACC", role: "viewer", active: true },
    ],
    votes, seq: 100,
  };
}

const KEY = "eagm_mock_state";
let st: State | null = null;
function S(): State {
  if (st) return st;
  try { const raw = sessionStorage.getItem(KEY); if (raw) { st = JSON.parse(raw) as State; return st; } } catch { /* ignore */ }
  st = seed();
  return st;
}
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } };

const sum = (m: Tally[]): Tally => m.reduce((a, t) => ({ agree: a.agree + t.agree, disagree: a.disagree + t.disagree, abstain: a.abstain + t.abstain, spoiled: a.spoiled + t.spoiled }), empty());

function stats(): Stats {
  const s = S();
  const regs = Object.entries(s.regs);
  const on = regs.filter(([, r]) => r.channel === "onsite"), onl = regs.filter(([, r]) => r.channel === "online");
  const total = HOLDERS.reduce((a, h) => a + h.shares, 0);
  const onsite_shares = on.reduce((a, [, r]) => a + r.shares, 0), online_shares = onl.reduce((a, [, r]) => a + r.shares, 0);
  const late_ids = Object.keys(s.late);
  const pct = total ? ((onsite_shares + online_shares) / total) * 100 : 0;
  return {
    holders: HOLDERS.length, total_shares: total, onsite_count: on.length, onsite_shares, online_count: onl.length, online_shares,
    late_count: late_ids.length, late_shares: late_ids.reduce((a, id) => a + (s.regs[id]?.shares ?? 0), 0),
    quorum_pct: Math.round(pct * 100) / 100, quorum_required_pct: s.meeting.quorum_pct, quorum_reached: pct >= s.meeting.quorum_pct,
  };
}

function termResult(a: Agenda): TermResult {
  const s = S();
  const rows = Object.entries(s.votes[a.term_id] ?? {});
  const t = (ch: "onsite" | "online") => sum(rows.filter(([id]) => s.regs[id]?.channel === ch).map(([, v]) => v));
  const onsite = t("onsite"), online = t("online"), total = sum([onsite, online]);
  const all = total.agree + total.disagree + total.abstain + total.spoiled;
  const p = (n: number) => (all ? Math.round((n / all) * 10000) / 100 : 0);
  const denom = total.agree + total.disagree + (a.vote_type === "special" ? total.abstain : 0);
  const need = a.vote_type === "special" ? 2 / 3 : a.vote_type === "unanimous" ? 1 : 0.5;
  const result: TermResult["result"] = a.vote_type === "info" ? "info" : a.status !== "closed" ? (a.status === "open" ? "in_progress" : "pending") : denom && total.agree / denom > need - 1e-9 && total.agree / denom >= need ? "pass" : "fail";
  return {
    id: a.id, term_id: a.term_id, name: a.name, status: a.status, vote_type: a.vote_type, onsite, online, total,
    agree_pct: p(total.agree), disagree_pct: p(total.disagree), abstain_pct: p(total.abstain), spoiled_pct: p(total.spoiled),
    voted_count: rows.length, eligible: Object.keys(s.regs).length, result,
  };
}
const summary = (): Summary => ({ meeting: S().meeting, stats: stats(), terms: S().agendas.map(termResult) });

function holderItem(h: Holder): HolderItem {
  const s = S(), r = s.regs[h.account_id];
  return {
    account_id: h.account_id, name: h.name, shares: h.shares, masked_id: maskId(h.id_card), phone: h.phone,
    status: r ? r.channel : "none", vote_mode: r?.vote_mode, group_name: r?.group, reg_type: r?.type, late: !!s.late[h.account_id],
    novote_any: s.novote.some((n) => n.account_id === h.account_id),
  };
}

function voteRows(acc: string): VoteRow[] {
  const s = S();
  return s.agendas.map((a) => {
    const v = s.votes[a.term_id]?.[acc];
    return { term_id: a.term_id, name: a.name, status: a.status, voted: !!v, choice: v?.choice ?? "", shares: s.regs[acc]?.shares ?? hold(acc)?.shares ?? 0, agree: v?.agree ?? 0, disagree: v?.disagree ?? 0, abstain: v?.abstain ?? 0, spoiled: v?.spoiled ?? 0 };
  });
}

function audit(): AuditRow[] {
  const acts = [["login", "เข้าสู่ระบบ"], ["register", "ลงทะเบียนผู้ถือหุ้น 1003"], ["vote", "ลงคะแนนวาระ 3"], ["agenda_open", "เปิดวาระ 3"], ["register", "ลงทะเบียนผู้ถือหุ้น 1005"], ["export", "ส่งออกสรุปผล"]];
  return acts.map(([action, detail], i) => ({ id: i + 1, acc_id: i % 2 ? "staff1" : "admin", action, detail, ip: "10.0.0.5", created_at: new Date(Date.now() - i * 600000).toISOString() }));
}

const HOLDER_TOKEN_ACC = () => { try { return (JSON.parse(sessionStorage.getItem("eagm_holder") ?? "{}") as { account_id?: string }).account_id ?? "1009"; } catch { return "1009"; } };

export async function mockApi(path: string, method: string, body: Record<string, unknown> | undefined): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  const s = S();
  const url = new URL(path, "http://x");
  const p = url.pathname, q = url.searchParams;
  const seg = p.split("/").filter(Boolean).slice(1); // drop "api"
  const out = (v: unknown) => { save(); return v; };
  const err = (status: number, message: string): never => { throw Object.assign(new Error(message), { __mockStatus: status }); };

  if (method === "GET") {
    switch (seg[0]) {
      case "meeting": return s.meeting;
      case "stats": return stats();
      case "summary": return summary();
      case "agendas": return s.agendas;
      case "holders": {
        const t = (q.get("q") ?? "").trim().toLowerCase();
        return HOLDERS.filter((h) => !t || h.name.toLowerCase().includes(t) || h.account_id.includes(t) || h.id_card.includes(t)).slice(0, 20).map(holderItem);
      }
      case "registration": {
        if (seg[1] === "groups" && seg[2]) return s.groups.find((g) => String(g.id) === seg[2])?.members ?? [];
        if (seg[1] === "groups") return s.groups.map((g): GroupItem => ({ id: g.id, code: `G${g.id}`, name: g.name, members: g.members.length, shares: g.members.reduce((a, m) => a + m.shares, 0) }));
        break;
      }
      case "vote": if (seg[1] === "onsite" && seg[2]) return voteRows(seg[2]); break;
      case "late": return Object.entries(s.late).map(([id, at]): LateRow => ({ account_id: id, name: hold(id)?.name ?? id, shares: s.regs[id]?.shares ?? 0, arrived_at: at, term_id: "3" }));
      case "novote": return s.novote.filter((n) => !q.get("term_id") || n.term_id === q.get("term_id"));
      case "online": {
        const acc = HOLDER_TOKEN_ACC(), h = hold(acc) ?? HOLDERS[8];
        if (seg[1] === "me") return { account_id: h.account_id, name: h.name, shares: h.shares, meeting: s.meeting, stats: stats(), vote_mode: s.regs[h.account_id]?.vote_mode ?? "self" };
        if (seg[1] === "agendas") return s.agendas.map((a): OnlineAgenda => ({ term_id: a.term_id, name: a.name, status: a.status, vote_type: a.vote_type, novote: s.novote.some((n) => n.term_id === a.term_id && n.account_id === h.account_id), choice: (s.votes[a.term_id]?.[h.account_id]?.choice as Choice) ?? "" }));
        if (seg[1] === "receipt") {
          const votes = s.agendas.filter((a) => s.votes[a.term_id]?.[h.account_id]).map((a) => ({ term_id: a.term_id, name: a.name, choice: s.votes[a.term_id][h.account_id].choice as Choice, auto: false }));
          const r: Receipt = { reference: "EAGM-DEMO-0001", name: h.name, account_id: h.account_id, shares: h.shares, ip: "10.0.0.5", registered_at: s.regs[h.account_id]?.at ?? new Date().toISOString(), last_vote_at: new Date().toISOString(), votes };
          return r;
        }
        break;
      }
      case "admin": {
        if (seg[1] === "users") return s.users;
        if (seg[1] === "audit") { const items = audit(); return { total: items.length, items: items.slice(0, Number(q.get("limit") ?? 50)) }; }
        if (seg[1] === "meetings" && seg[3] === "summary") return summary();
        if (seg[1] === "meetings") return [s.meeting, { ...s.meeting, id: 0, year: "2568", closed_at: new Date().toISOString() }];
        if (seg[1] === "online-registrations") {
          return Object.entries(s.regs).filter(([, r]) => r.channel === "online").map(([id, r], i): OnlineRegRow => {
            const h = hold(id)!;
            return { id: i + 1, account_id: id, name: h.name, shares: r.shares, phone: h.phone, email: `holder${id}@example.com`, status: "registered", vote_mode: r.vote_mode, otp_verified: true, ip: "10.0.0.5", registered_at: r.at };
          });
        }
        break;
      }
    }
    return [];
  }

  // writes
  const b = body ?? {};
  switch (seg[0]) {
    case "auth": return { token: "mock", role: String(b.username).toLowerCase().includes("admin") ? "admin" : "staff", name: "ผู้ใช้ตัวอย่าง", username: String(b.username || "demo") };
    case "online": {
      if (seg[1] === "register") return { sent: true, channel: "sms", expires_in: 300, masked_to: "08X-XXX-1234", dev_otp: "123456" };
      if (seg[1] === "verify-otp") {
        const acc = String(b.account_id || "1009");
        if (!s.regs[acc]) { const h = hold(acc) ?? HOLDERS[8]; s.regs[h.account_id] = { type: "person", channel: "online", vote_mode: "self", shares: h.shares, at: new Date().toISOString() }; }
        return out({ token: "mock" });
      }
      if (seg[1] === "vote-mode") { const acc = HOLDER_TOKEN_ACC(); if (s.regs[acc]) s.regs[acc].vote_mode = (b.mode as "self" | "staff") ?? "self"; return out({}); }
      if (seg[1] === "vote") {
        const acc = HOLDER_TOKEN_ACC(), c = b.choice as Choice, term = String(b.term_id);
        const v: Vote = { choice: c, agree: 0, disagree: 0, abstain: 0, spoiled: 0 }; v[c] = s.regs[acc]?.shares ?? 0;
        (s.votes[term] ??= {})[acc] = v;
        return out({});
      }
      break;
    }
    case "registration": {
      if (seg[1] === "group") {
        const members = (b.members as { account_id: string; shares: number }[]) ?? [];
        const gid = ++s.seq;
        s.groups.push({ id: gid, name: String(b.name), members: members.map((m) => ({ account_id: m.account_id, name: hold(m.account_id)?.name ?? m.account_id, shares: m.shares })) });
        members.forEach((m) => { s.regs[m.account_id] = { type: "group", channel: "onsite", vote_mode: "self", group: String(b.name), shares: m.shares, at: new Date().toISOString() }; });
        return out({ id: gid });
      }
      if (seg[1] === "groups" && seg[2]) {
        const g = s.groups.find((x) => String(x.id) === seg[2]);
        if (g && method === "POST") { const h = hold(String(b.account_id)); g.members.push({ account_id: String(b.account_id), name: h?.name ?? "", shares: Number(b.shares) }); s.regs[String(b.account_id)] = { type: "group", channel: "onsite", vote_mode: "self", group: g.name, shares: Number(b.shares), at: new Date().toISOString() }; }
        if (g && method === "DELETE" && seg[3] === "members") { g.members = g.members.filter((m) => m.account_id !== seg[4]); delete s.regs[seg[4]]; }
        return out({});
      }
      if (method === "POST" && !seg[1]) { s.regs[String(b.account_id)] = { type: (b.type as Reg["type"]) ?? "person", channel: "onsite", vote_mode: "self", shares: Number(b.shares) || hold(String(b.account_id))?.shares || 0, at: new Date().toISOString() }; return out({}); }
      if (method === "POST" && seg[2] === "convert") { const r = s.regs[seg[1]]; if (r) { r.channel = "onsite"; r.vote_mode = "self"; } return out({}); }
      if (method === "DELETE" && seg[1]) { delete s.regs[seg[1]]; Object.values(s.votes).forEach((m) => delete m[seg[1]]); return out({}); }
      break;
    }
    case "late": s.late[String(b.account_id)] = new Date().toISOString(); return out({});
    case "novote": {
      if (method === "POST") { const h = hold(String(b.account_id)); s.novote.push({ id: ++s.seq, term_id: String(b.term_id), account_id: String(b.account_id), name: h?.name ?? "", shares: h?.shares ?? 0 }); }
      else s.novote = s.novote.filter((n) => String(n.id) !== seg[1]);
      return out({});
    }
    case "vote": {
      const acc = String(b.account_id), term = String(b.term_id);
      const h = hold(acc);
      if (!s.regs[acc] && !h) err(404, "ไม่พบผู้ถือหุ้น");
      const sh = s.regs[acc]?.shares ?? h?.shares ?? 0;
      let v: Vote;
      if (b.split) { const sp = b.split as Partial<Record<Choice, number>>; v = { choice: "split", agree: sp.agree ?? 0, disagree: sp.disagree ?? 0, abstain: sp.abstain ?? 0, spoiled: sp.spoiled ?? 0 }; }
      else { const c = b.choice as Choice; v = { choice: c, agree: 0, disagree: 0, abstain: 0, spoiled: 0 }; v[c] = sh; }
      (s.votes[term] ??= {})[acc] = v;
      return out({});
    }
    case "admin": {
      if (seg[1] === "agendas") {
        if (seg[3] === "status") { const a = s.agendas.find((x) => String(x.id) === seg[2]); if (a) a.status = b.status as Agenda["status"]; }
        else if (method === "POST") { const n = s.agendas.length + 1; s.agendas.push({ id: ++s.seq, term_id: String(b.term_id ?? n), name: String(b.name), name_en: String(b.name_en ?? ""), status: "pending", vote_type: (b.vote_type as Agenda["vote_type"]) ?? "ordinary" }); }
        else if (method === "PUT") { const a = s.agendas.find((x) => String(x.id) === seg[2]); if (a) Object.assign(a, b); }
        else if (method === "DELETE") s.agendas = s.agendas.filter((x) => String(x.id) !== seg[2]);
        return out({});
      }
      if (seg[1] === "users") {
        if (method === "POST") s.users.push({ id: ++s.seq, username: String(b.username), fullname: String(b.fullname ?? ""), dept: String(b.dept ?? ""), role: (b.role as UserRow["role"]) ?? "staff", active: true });
        else if (method === "PUT") { const u = s.users.find((x) => String(x.id) === seg[2]); if (u) Object.assign(u, { ...b, password: undefined }); }
        else if (method === "DELETE") s.users = s.users.filter((x) => String(x.id) !== seg[2]);
        return out({});
      }
      if (seg[1] === "meeting") {
        if (seg[2] === "room") s.meeting.room_open = !!(b.open ?? b.room_open ?? !s.meeting.room_open);
        else if (seg[2] === "close") s.meeting.closed_at = new Date().toISOString();
        else Object.assign(s.meeting, b);
        return out({});
      }
      break;
    }
  }
  return out({});
}

/** Demo sign-in for the landing page: sets a session without going through any form. */
export function mockSignIn(kind: "holder" | "staff" | "admin") {
  if (kind === "holder") {
    const h = HOLDERS[8], s = S();
    if (!s.regs[h.account_id]) s.regs[h.account_id] = { type: "person", channel: "online", vote_mode: "self", shares: h.shares, at: new Date().toISOString() };
    save();
    sessionStorage.setItem("eagm_holder", JSON.stringify({ token: "mock", account_id: h.account_id }));
  } else {
    sessionStorage.setItem("eagm_staff", JSON.stringify(kind === "admin"
      ? { token: "mock", role: "admin", name: "ผู้ดูแลระบบ (ตัวอย่าง)", username: "admin" }
      : { token: "mock", role: "staff", name: "เจ้าหน้าที่ (ตัวอย่าง)", username: "staff1" }));
  }
}

export const mockReset = () => { st = null; try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };
