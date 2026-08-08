"use client";

import type { Athlete } from "@/types/athlete";

const safeValue = (value: string | number | undefined) => String(value ?? "").trim() || "—";

export function AthleteFollowUp({ athlete }: { athlete: Athlete }) {
  return (
    <article className="panel">
      <p className="eyebrow">Suivi manuel</p>
      <div className="premium-info-list">
        <div><span>Dernier contact</span><strong>{safeValue(athlete.lastContact)}</strong></div>
        <div><span>Prochaine action</span><strong>{safeValue(athlete.nextAction)}</strong></div>
        <div><span>Notes de suivi</span><strong>{safeValue(athlete.followUpNotes)}</strong></div>
      </div>
    </article>
  );
}

