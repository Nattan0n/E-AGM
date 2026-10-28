import type { ReactNode, SVGProps } from "react";

/** Consistent 24px line icons (stroke 1.8, rounded) used instead of emoji across the app. */
const P: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></>,
  edit: <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 7.5 3 3" /></>,
  register: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 8.5h6M9 12.5h6M9 16.5h3.5" /></>,
  vote: <><path d="M5 13.5h14l1.5 6.5h-17L5 13.5Z" /><path d="M8 13.5V6.8L11 4l5 4.2-3 5.3" /><path d="m10.5 9.2 2 2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7.5" y="11" width="3" height="6" rx=".8" /><rect x="13" y="7" width="3" height="10" rx=".8" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.7" cy="6.5" r="1" /><circle cx="4.7" cy="12" r="1" /><circle cx="4.7" cy="17.5" r="1" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  phone: <><rect x="7" y="2.8" width="10" height="18.4" rx="2.5" /><path d="M10.8 18h2.4" /></>,
  users: <><circle cx="9" cy="8.5" r="3.3" /><path d="M2.8 19.5c.4-3.3 3-5.2 6.2-5.2s5.8 1.9 6.2 5.2" /><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M18.5 14.6c1.6.6 2.5 2.1 2.7 4.4" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20c.5-3.6 3.5-5.6 7.5-5.6s7 2 7.5 5.6" /></>,
  shield: <><path d="M12 3.2 5 6v5.6c0 4.2 2.9 7.4 7 9.2 4.1-1.8 7-5 7-9.2V6l-7-2.8Z" /><path d="m9 12 2.2 2.2L15.2 10" /></>,
  upload: <><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  download: <><path d="M12 4.5v11M7.5 11 12 15.5 16.5 11" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4.2l2.8 1.6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.6 5.6l1.7 1.7M17.7 16.7l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.6 18.4l1.7-1.7M17.7 7.3l1.7-1.7" /></>,
  building: <><rect x="5" y="3.5" width="14" height="17" rx="1.6" /><path d="M9 8h1.5M13.5 8H15M9 12h1.5M13.5 12H15M10 20.5v-4h4v4" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2.4" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  file: <><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z" /><path d="M14 3.5V8h4M9 13h6M9 16.5h4" /></>,
  trash: <><path d="M4.5 7h15M10 7V4.8h4V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" /><path d="M10 11v5.5M14 11v5.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 6A9.7 9.7 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3.2 4M6.4 7.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.100-1" /><path d="M9.9 9.9a3 3 0 0 0 4.200 4.200" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  print: <><path d="M7 8.5V4h10v4.5" /><rect x="4" y="8.5" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.4" /><path d="m4 7 8 6 8-6" /></>,
  activity: <path d="M3 12h4l2.5-6.5 4 13L16 12h5" />,
  warn: <><path d="M12 4 3 19.5h18L12 4Z" /><path d="M12 10v4.2M12 17.2v.2" /></>,
  thumbUp: <><path d="M8 11v8H4.5v-8H8Z" /><path d="M8 11l3.2-6.5c1.3 0 2.3 1 2.1 2.4L12.8 10h5.2a2 2 0 0 1 2 2.4l-1.2 5.6a2 2 0 0 1-2 1.6H8" /></>,
  thumbDown: <><path d="M8 13V5H4.5v8H8Z" /><path d="M8 13l3.2 6.5c1.3 0 2.3-1 2.1-2.4L12.8 14h5.2a2 2 0 0 0 2-2.4l-1.2-5.6a2 2 0 0 0-2-1.6H8" /></>,
  hand: <><path d="M8 12V6.5a1.3 1.3 0 0 1 2.6 0V11M10.6 10.5V4.8a1.3 1.3 0 0 1 2.6 0v6M13.2 10.5V6a1.3 1.3 0 0 1 2.6 0v6.5M15.8 9a1.3 1.3 0 0 1 2.6 0v5.5c0 3.6-2.2 6-5.7 6-2.6 0-4-1.3-5.4-3.4L4.6 13c-.6-1 .6-2.2 1.7-1.4L8 13.2" /></>,
  ballotX: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  power: <><path d="M12 3.5v8" /><path d="M6.6 6.8a8 8 0 1 0 10.8 0" /></>,
  dashboard: <><rect x="3.5" y="3.5" width="7" height="8.5" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.6" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.6" /><rect x="3.5" y="15" width="7" height="5.5" rx="1.6" /></>,
  broom: <><path d="M14.5 3.5 10 10" /><path d="M8.5 9.5 14 15l-3 5.5c-3.2 0-6.5-2-7.5-5.5L8.5 9.5Z" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {P[name]}
    </svg>
  );
}
