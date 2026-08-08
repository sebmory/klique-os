"use client";

import type { Athlete } from "@/types/athlete";

const safeValue = (value: string | number | undefined) => String(value ?? "").trim() || "—";

export function AthleteObjectives({ athlete }: { athlete: Athlete }) {
  return (
    <article className="panel">
      <p className="eyebrow">Objectifs & profil</p>
      <div className="premium-info-list">
        <div><span>Palmarès</span><strong>{safeValue(athlete.palmares)}</strong></div>
        <div><span>Objectif court terme</span><strong>{safeValue(athlete.objective)}</strong></div>
        <div><span>Objectif long terme</span><strong>{safeValue(athlete.longTerm)}</strong></div>
        <div><span>Domaines souhaités</span><strong>{safeValue(athlete.desiredAreas)}</strong></div>
      </div>
    </article>
  );
}

