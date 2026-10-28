"use client";
import { ReactNode, useEffect } from "react";

/** Admin dialog: bottom sheet on phones/tablets, centered dialog on desktop (CSS, see .adm-modal in globals.css). */
export function AdModal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="adm-modal-back" onClick={onClose}>
      <div className="adm-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="adm-grab" aria-hidden />
        <h3>{title}</h3>
        {children}
        {actions && <div className="adm-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
