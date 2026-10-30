// Types mirror the Go API responses (backend/internal/api). Amounts are share counts.
export type Role = "admin" | "staff" | "viewer";
export type Choice = "agree" | "disagree" | "abstain" | "spoiled";
export type VoteType = "ordinary" | "special" | "unanimous" | "info";
export type AgendaStatus = "pending" | "open" | "closed";

export interface Meeting { id: number; year: string; detail: string; date: string; closed_at: string | null; online_enabled: boolean; advance_entry: boolean; room_open: boolean; quorum_pct: number; documents_url: string; announcement: string;
  /** Admin switch: holders may see the totals of CLOSED agendas on /online/results. Absent on a backend that does not know it yet. */
  results_published?: boolean }
export interface Stats {
  holders: number; total_shares: number; onsite_count: number; onsite_shares: number;
  online_count: number; online_shares: number; late_count: number; late_shares: number;
  quorum_pct: number; quorum_required_pct: number; quorum_reached: boolean;
  // onsite registrations by type: self = person, proxy = proxy, group = fund / juristic group (optional until the backend sends them)
  self_count?: number; self_shares?: number; proxy_count?: number; proxy_shares?: number; group_count?: number; group_shares?: number;
}
export interface Agenda { id: number; term_id: string; name: string; name_en: string; status: AgendaStatus; vote_type: VoteType }
export interface Tally { agree: number; disagree: number; abstain: number; spoiled: number }
export interface TermResult {
  id: number; term_id: string; name: string; status: AgendaStatus; vote_type: VoteType;
  onsite: Tally; online: Tally; total: Tally;
  agree_pct: number; disagree_pct: number; abstain_pct: number; spoiled_pct: number;
  voted_count: number; // holders who actively cast a vote
  eligible: number; // SHARES entitled to vote on this agenda
  eligible_holders: number; // HOLDERS (head count) entitled to vote on this agenda; use this for "x of y ราย"
  novote_holders?: number; novote_shares?: number; // registered holders / shares flagged "no voting right" on this agenda
  result: "pending" | "in_progress" | "pass" | "fail" | "info";
}
export interface Summary { meeting: Meeting; stats: Stats; terms: TermResult[] }
export interface HolderItem {
  account_id: string; name: string; shares: number; masked_id: string; phone: string;
  status: "none" | "onsite" | "online"; vote_mode?: "self" | "staff"; group_name?: string; reg_type?: "person" | "proxy" | "group"; late: boolean; novote_any: boolean;
}
export interface GroupItem { id: number; code: string; name: string; members: number; shares: number }
export interface GroupMember { account_id: string; name: string; shares: number }
export interface VoteRow {
  term_id: string; name: string; status: AgendaStatus; voted: boolean; choice: Choice | "split" | ""; shares: number;
  agree: number; disagree: number; abstain: number; spoiled: number; // per-choice shares once voted (custodian split)
}
export interface LateRow { account_id: string; name: string; shares: number; arrived_at: string; term_id: string }
export interface NovoteRow { id: number; term_id: string; account_id: string; name: string; shares: number }
export interface UserRow { id: number; username: string; fullname: string; dept: string; role: Role; active: boolean }
export interface AttendeeRow { key: string; channel: "onsite" | "online"; account_id: string; name: string; shares: number; phone: string; email: string; status: string; reg_type: "person" | "proxy" | "group"; otp_verified: boolean; ip: string; vote_mode: "self" | "staff"; registered_at: string }
export interface OnlineRegRow { id: number; account_id: string; name: string; shares: number; phone: string; email: string; status: string; vote_mode: "self" | "staff"; otp_verified: boolean; ip: string; registered_at: string }
export interface AuditRow { id: number; acc_id: string; action: string; detail: string; ip: string; created_at: string }
export interface OnlineAgenda { term_id: string; name: string; status: AgendaStatus; vote_type: VoteType; novote: boolean; choice: Choice | "" }
export interface Receipt {
  reference: string; name: string; account_id: string; shares: number; ip: string; registered_at: string; last_vote_at: string;
  votes: { term_id: string; name: string; choice: Choice; auto: boolean }[];
}

export interface HolderAdminRow { account_id: string; title: string; first: string; last: string; shares: number; masked_id: string; phone: string; email: string; security: string; registered: boolean }
export interface HolderAdminList { total: number; items: HolderAdminRow[] }

/** GET /api/online/results - totals of OPEN and CLOSED agendas (pending ones excluded), and only once an admin published them (meeting.results_published). No verdict, no per-holder data. */
export interface HolderResultRow { term_id: string; name: string; vote_type: VoteType; status?: AgendaStatus; eligible_holders?: number; eligible?: number; novote_holders?: number; novote_shares?: number; total: Tally; agree_pct: number; disagree_pct: number; abstain_pct: number; spoiled_pct: number }
export interface HolderResults { published: boolean; terms: HolderResultRow[] }

/** GET /api/vote/roll?term_id= - every registered holder (onsite + online) with the vote they hold on that agenda.
 *  state: voted = a vote was recorded; not_voted = counts as "agree" automatically; no_right = flagged in novote (shares count 0). */
export interface RollRow {
  account_id: string; name: string; shares: number; channel: "onsite" | "online";
  state: "voted" | "not_voted" | "no_right";
  agree: number; disagree: number; abstain: number; spoiled: number; // shares per choice (a custodian split has several > 0)
  by: string; at: string; // who recorded it ("online" for a holder's own vote) and when; empty if not voted
}
