"use client";
import { ReactNode, useEffect } from "react";

/** Admin dialog: bottom sheet on phones/tablets, centered dialog on desktop (CSS, see .ad-modal in globals.css). */
export function AdModal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="ad-modal-back" onClick={onClose}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="ad-grab" aria-hidden />
        <h3>{title}</h3>
        {children}
        {actions && <div className="ad-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
