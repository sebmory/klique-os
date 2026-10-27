"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Card } from "@/src/design-system/components";

const STORAGE_PREFIX = "klique.today.card-open.v1";

export function TodayCollapsibleCard({
  storageKey,
  title,
  description,
  attentionCount,
  countLabel = "à traiter",
  className = "",
  children,
}: {
  storageKey: string;
  title: string;
  description?: string;
  attentionCount: number;
  countLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const contentId = useId();
  const preferenceLoaded = useRef(false);
  const [open, setOpen] = useState(attentionCount > 0);

  useEffect(() => {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}:${storageKey}`);
    preferenceLoaded.current = true;
    if (stored === "true" || stored === "false") {
      setOpen(stored === "true");
    } else {
      setOpen(attentionCount > 0);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!preferenceLoaded.current) return;
    const storageId = `${STORAGE_PREFIX}:${storageKey}`;
    if (window.localStorage.getItem(storageId) === null) {
      setOpen(attentionCount > 0);
    }
  }, [attentionCount, storageKey]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      window.localStorage.setItem(`${STORAGE_PREFIX}:${storageKey}`, String(next));
      return next;
    });
  };

  return (
    <Card className={`workspace-dashboard-card today-collapsible-card ${className}`.trim()}>
      <header className="dashboard-card-head today-collapsible-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="dashboard-card-head-right">
          <span className="card-pill">
            {attentionCount} {countLabel}
          </span>
          <button
            type="button"
            className="today-card-toggle"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={toggle}
          >
            {open ? "Replier" : "Ouvrir"}
          </button>
        </div>
      </header>
      <div id={contentId} hidden={!open} className="today-collapsible-content">
        {children}
      </div>
    </Card>
  );
}
