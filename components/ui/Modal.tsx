"use client";

import type { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">KLIQUE OS</p>
            <h3>{title}</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
