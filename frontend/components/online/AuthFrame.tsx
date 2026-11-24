"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthSplit } from "@/components/brand/AuthSplit";
import { LogoMark } from "@/components/brand/Logo";
import { useIsDesktop } from "@/lib/media";
import a from "./auth.module.css";

/** The 4 steps of the shareholder entry flow (flow pages 2-4). */
export const LOGIN_STEPS = ["User", "OTP", "ยืนยันข้อมูล", "ห้องประชุม"];
/** Steps of "request a User" (flow page 1). */
export const REQUEST_STEPS = ["เลขบัตร", "ข้อมูลติดต่อ", "ยืนยัน OTP", "ส่งคำขอ"];

export interface AuthFrameProps {
  title: string;
  subtitle?: string;
  /** Step labels and the current step (1-based). */
  steps?: string[];
  step?: number;
  /** Back target; a string is a route, a function is called. */
  back?: string | (() => void);
  backLabel?: string;
  /** Desktop: a wider card (long forms laid out in two columns). */
  wide?: boolean;
  children: ReactNode;
}

const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);

/**
 * Frame of the shareholder entry screens (login, OTP, request a User, first visit).
 * Phone: brand hero with step dots and an overlapping card. Web: the AuthSplit card with a numbered stepper.
 */
export function AuthFrame({ title, subtitle, steps, step, back, backLabel = "ย้อนกลับ", wide, children }: AuthFrameProps) {
  const desktop = useIsDesktop();
  const router = useRouter();
  const goBack = back ? () => (typeof back === "string" ? router.push(back) : back()) : undefined;

  if (desktop) {
    return (
      <AuthSplit wide={wide}>
        <div className={`${a.dwrap} ${wide ? a.dwrapWide : ""}`}>
          {goBack && <button type="button" className={a.dback} onClick={goBack}>← {backLabel}</button>}
          {steps && step ? (
            <ol className={a.stepper} aria-label={`ขั้นที่ ${step} จาก ${steps.length}`}>
              {steps.map((l, i) => (
                <li key={l} className={i + 1 < step ? a.sDone : i + 1 === step ? a.sCur : ""} aria-current={i + 1 === step ? "step" : undefined}>
                  <b>{i + 1 < step ? "✓" : i + 1}</b>{l}
                </li>
              ))}
            </ol>
          ) : null}
          <div className={a.dhead}><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          {children}
        </div>
      </AuthSplit>
    );
  }

  return (
    <div className={a.root}>
      <header className={a.hero}>
        <div className={a.heroTop}>
          {goBack ? <button type="button" className={a.back} onClick={goBack} aria-label={backLabel}><Arrow /></button> : <span />}
          {steps && step ? <span className={a.stepPill}>ขั้นที่ {step}/{steps.length} · {steps[step - 1]}</span> : null}
        </div>
        <div className={a.heroBody}>
          <LogoMark size={52} />
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {steps && step ? <div className={a.dots} aria-hidden="true">{steps.map((l, i) => <i key={l} className={i < step ? a.on : ""} />)}</div> : null}
      </header>
      <div className={a.card}>{children}</div>
      <div className={a.foot}>© Thai Rung Union Car Public Company Limited</div>
    </div>
  );
}
