import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import s from "./page.module.css";

export default function Home() {
  return (
    <div className={s.root}>
      <div className={s.blob1} aria-hidden="true" /><div className={s.blob2} aria-hidden="true" />
      <main className={s.main}>
        <div className={s.brand}>
          <LogoMark size={72} tone="glass" />
          <h1>E-AGM</h1>
          <p className={s.tag}>ระบบประชุมผู้ถือหุ้น</p>
          <p className={s.co}>บริษัท ไทยรุ่งยูเนี่ยนคาร์ จำกัด (มหาชน)</p>
          <p className={s.sub}>ลงทะเบียนและลงคะแนนเสียงอย่างปลอดภัย ทั้งแบบ Onsite และ Online</p>
        </div>
        <div className={s.cards}>
          <Link href="/online" className={s.card}>
            <span className={`${s.icon} ${s.iconA}`} aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 010 6.8M18.5 14.4c1.9.8 3 2.7 3 5.6" /></svg>
            </span>
            <span className={s.ct}>
              <b>ผู้ถือหุ้น</b>
              <span>ลงทะเบียนด้วย OTP แล้วลงคะแนนด้วยตนเอง หรือให้เจ้าหน้าที่ลงคะแนนแทนก็ได้</span>
            </span>
            <span className={s.go} aria-hidden="true">เข้าสู่ระบบ →</span>
          </Link>
          <Link href="/staff/login" className={s.card}>
            <span className={`${s.icon} ${s.iconB}`} aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5l8 3v6c0 4.6-3.2 8.3-8 10-4.8-1.7-8-5.4-8-10v-6l8-3z" /><path d="M8.5 12l2.4 2.4 4.6-4.8" /></svg>
            </span>
            <span className={s.ct}>
              <b>เจ้าหน้าที่ / ผู้ดูแลระบบ</b>
              <span>ลงทะเบียนหน้างาน ลงคะแนนแทน และจัดการการประชุม</span>
            </span>
            <span className={s.go} aria-hidden="true">เข้าสู่ระบบ →</span>
          </Link>
        </div>
        <p className={s.foot}>© E-AGM · Thai Rung Union Car PCL</p>
      </main>
    </div>
  );
}
