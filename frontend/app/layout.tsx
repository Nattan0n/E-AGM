import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { GradientBg } from "@/components/brand/GradientBg";
import { Ready } from "@/components/brand/Ready";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "E-AGM — ระบบประชุมผู้ถือหุ้น",
  description: "ระบบลงทะเบียนและลงคะแนนเสียงผู้ถือหุ้น (Onsite + Online)",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b2a8f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={prompt.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('eagm_sidebar_collapsed')==='1')document.documentElement.dataset.sidebar='collapsed'}catch(e){}setTimeout(function(){document.documentElement.dataset.ready='1'},5000)" }} />
      </head>
      <body>
        <Suspense fallback={null}><GradientBg /></Suspense>
        <div id="app-root">{children}</div>
        <Suspense fallback={null}><Ready /></Suspense>
        <noscript><style>{"#app-root{opacity:1!important}"}</style></noscript>
      </body>
    </html>
  );
}
