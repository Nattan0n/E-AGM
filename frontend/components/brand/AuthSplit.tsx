"use client";
import type { ReactNode } from "react";
import { Icon, IconName } from "./Icon";
import { LogoMark } from "./Logo";
import s from "./AuthSplit.module.css";

const FEATURES: { icon: IconName; text: string }[] = [
  { icon: "shield", text: "ยืนยันตัวตนด้วยรหัส OTP อย่างปลอดภัย" },
  { icon: "vote", text: "ลงคะแนนด้วยตนเอง หรือให้เจ้าหน้าที่ลงคะแนนแทนก็ได้" },
  { icon: "file", text: "รับใบยืนยันผลการลงคะแนนทันที" },
  { icon: "lock", text: "ข้อมูลถูกเข้ารหัสและเก็บบันทึกการใช้งาน (Audit Log)" },
];

/**
 * Web (desktop) split screen shared by the shareholder register / OTP pages:
 * brand + description on the left, form card on the right (same look as the staff login).
 * Desktop only - phones keep the app-style layout of each page.
 */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className={s.root}>
      <section className={s.brand}>
        <div className={s.brandIn}>
          <div className={s.logo}><LogoMark size={72} /></div>
          <h1>E-AGM</h1>
          <p className={s.company}>บริษัท ไทยรุ่งยูเนี่ยนคาร์ จำกัด (มหาชน)</p>
          <p className={s.tag}>ระบบประชุมผู้ถือหุ้น — สำหรับผู้ถือหุ้น</p>
          <p className={s.lead}>ลงทะเบียนเข้าร่วมประชุมและลงคะแนนเสียงได้สะดวก ไม่ว่าจะลงคะแนนด้วยตนเองผ่านระบบ หรือให้เจ้าหน้าที่ลงคะแนนแทนที่หน้างาน</p>
          <ul className={s.feats}>
            {FEATURES.map((f) => (
              <li key={f.text}><span className={s.ic}><Icon name={f.icon} size={19} /></span>{f.text}</li>
            ))}
          </ul>
        </div>
        <div className={s.brandFoot}>© Thai Rung Union Car Public Company Limited</div>
      </section>
      <section className={s.panel}>
        <div className={s.card}>{children}</div>
        <p className={s.support}>หากมีปัญหาการเข้าสู่ระบบ กรุณาติดต่อเจ้าหน้าที่ ณ จุดลงทะเบียน</p>
      </section>
    </div>
  );
}
