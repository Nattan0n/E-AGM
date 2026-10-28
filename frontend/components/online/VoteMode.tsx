"use client";
import { Icon } from "@/components/brand/Icon";
import s from "./online.module.css";

export type VoteMode = "self" | "staff";

const OPTS: { v: VoteMode; icon: "vote" | "users"; title: string; desc: string }[] = [
  { v: "self", icon: "vote", title: "ลงคะแนนออนไลน์ด้วยตนเอง", desc: "กดลงคะแนนผ่านระบบ E-AGM บนมือถือหรือคอมพิวเตอร์ ในแต่ละวาระ" },
  { v: "staff", icon: "users", title: "ลงคะแนนผ่านบัตรลงคะแนน", desc: "รับบัตรลงคะแนนที่หน้างาน กาเลือกในบัตร แล้วเจ้าหน้าที่บันทึกคะแนนเข้าระบบให้" },
];

/** "Who casts the votes on meeting day" - used by the register form and the waiting room. */
export function VoteModePicker({ value, onChange, disabled }: { value: VoteMode; onChange: (v: VoteMode) => void; disabled?: boolean }) {
  return (
    <div className={s.vmodes} role="radiogroup" aria-label="วิธีลงคะแนนในวันประชุม">
      {OPTS.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} disabled={disabled}
          className={`${s.vmode} ${value === o.v ? s.vmodeOn : ""}`} onClick={() => onChange(o.v)}>
          <i aria-hidden="true"><Icon name={o.icon} size={20} /></i>
          <span><b>{o.title}</b><small>{o.desc}</small></span>
          <em aria-hidden="true">{value === o.v && <Icon name="check" size={14} />}</em>
        </button>
      ))}
    </div>
  );
}
