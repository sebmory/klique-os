"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown } from "./icons";
import type { ModuleGuideDefinition } from "./module-guide-config";
import { resolveModuleGuide } from "./module-guide-config";

type ModuleGuideProps = {
  guide: ModuleGuideDefinition;
};

export function ModuleGuide({ guide }: ModuleGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const detailsId = useId();

  return (
    <section className="module-guide" aria-labelledby={titleId}>
      <div className="module-guide-heading">
        <p className="module-guide-eyebrow">Guide du module</p>
        <h2 id={titleId}>{guide.name}</h2>
        <p>{guide.purpose}</p>
      </div>

      <aside className="module-guide-start" aria-labelledby={`${titleId}-start`}>
        <h3 id={`${titleId}-start`}>Par où commencer&nbsp;?</h3>
        <p>{guide.start}</p>
      </aside>

      <div className="module-guide-usage">
        <button
          type="button"
          className="module-guide-toggle"
          aria-expanded={isOpen}
          aria-controls={detailsId}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span>Comment utiliser cet espace&nbsp;?</span>
          <ChevronDown
            className={isOpen ? "module-guide-toggle-icon is-open" : "module-guide-toggle-icon"}
            aria-hidden
          />
        </button>

        {isOpen ? (
          <ol id={detailsId} className="module-guide-actions">
            {guide.actions.map((action) => (
              <li key={`${action.href}-${action.label}`}>
                <Link href={action.href}>{action.label}</Link>
                <p>{action.description}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

export function ModuleGuideForRoute({ route, role }: { route: string; role: string | null | undefined }) {
  const guide = resolveModuleGuide(route, role);
  return guide ? <ModuleGuide guide={guide} /> : null;
}
