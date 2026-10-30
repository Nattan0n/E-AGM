"use client";
import { Children, Fragment, isValidElement, ReactElement, ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Opt { value: string; label: string; disabled: boolean }

const text = (n: ReactNode): string => (typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(text).join("") : "");

/** Flattens <option> children (also inside fragments / arrays) into a list. */
function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    if (el.type === Fragment) { collect(el.props.children, out); return; }
    if (el.type === "option") {
      const label = text(el.props.children);
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: !!el.props.disabled });
    }
  });
  return out;
}

interface Props {
  value: string;
  /** Same shape as a native select's change event, so existing `(e) => set(e.target.value)` handlers keep working. */
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/** Drop-in replacement for <select> with a themed dropdown (the browser's native popup cannot be styled). */
export function Select({ value, onChange, children, className = "", id, disabled, "aria-label": ariaLabel }: Props) {
  const opts = useMemo(() => collect(children), [children]);
  const cur = opts.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const uid = useId();

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const want = Math.min(opts.length * 40 + 12, 280);
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const down = below >= want || below >= above;
    const width = Math.max(r.width, 170);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    setPos(down
      ? { left, width, top: r.bottom + 6, maxH: Math.max(120, Math.min(280, below)) }
      : { left, width, bottom: window.innerHeight - r.top + 6, maxH: Math.max(120, Math.min(280, above)) });
  }, [opts.length]);

  const show = () => {
    if (disabled) return;
    setHi(Math.max(0, opts.findIndex((o) => o.value === value)));
    place();
    setOpen(true);
  };
  const close = useCallback(() => setOpen(false), []);
  const pick = (o: Opt) => { if (o.disabled) return; onChange({ target: { value: o.value } }); setOpen(false); btn.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", down);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("resize", close); window.removeEventListener("scroll", scroll, true); };
  }, [open, close]);

  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, hi]);

  const step = (d: 1 | -1) => {
    let i = hi;
    for (let n = 0; n < opts.length; n++) { i = (i + d + opts.length) % opts.length; if (!opts[i].disabled) break; }
    setHi(i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); step(1); break;
      case "ArrowUp": e.preventDefault(); step(-1); break;
      case "Home": e.preventDefault(); setHi(0); break;
      case "End": e.preventDefault(); setHi(opts.length - 1); break;
      case "Enter": case " ": e.preventDefault(); if (opts[hi]) pick(opts[hi]); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); close(); break;
      case "Tab": close(); break;
      default:
        if (e.key.length === 1) { // type-ahead
          const i = opts.findIndex((o, k) => k !== hi && !o.disabled && o.label.toLowerCase().startsWith(e.key.toLowerCase()));
          if (i >= 0) setHi(i);
        }
    }
  };

  return (
    <>
      <button ref={btn} type="button" id={id} className={`sx-btn ${open ? "sx-open" : ""} ${className}`} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${uid}-list`} aria-label={ariaLabel}
        aria-activedescendant={open ? `${uid}-o${hi}` : undefined}
        onClick={() => (open ? close() : show())} onKeyDown={onKey}>
        <span className="sx-val">{cur ? cur.label : " "}</span>
        <svg className="sx-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && pos && createPortal(
        <ul ref={menu} id={`${uid}-list`} role="listbox" className="sx-menu" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}>
          {opts.map((o, i) => (
            <li key={o.value + i} id={`${uid}-o${i}`} data-i={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
              className={`sx-opt${o.value === value ? " sel" : ""}${i === hi ? " hi" : ""}${o.disabled ? " dis" : ""}`}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
              <span>{o.label}</span>
              {o.value === value && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
