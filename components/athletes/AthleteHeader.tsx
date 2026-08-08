"use client";

import type { Athlete } from "@/types/athlete";

export function AthleteHeader({
  athlete,
  lastShootingLabel,
  onBack,
}: {
  athlete: Athlete;
  lastShootingLabel: string;
  onBack: () => void;
}) {
  return (
    <>
      <button className="back-button" onClick={onBack}>← Retour aux athlètes</button>
      <section className="premium-athlete-hero">
        <div className="premium-hero-main">
          <div className="athlete-avatar premium">{athlete.initials}</div>
          <div className="premium-identity">
            <div className="premium-kicker"><span className="status-badge">{athlete.status}</span><span>{athlete.sport}</span></div>
            <h2>{athlete.name}</h2>
            <p>{athlete.club}</p>
          </div>
        </div>
        <div className="premium-score-card">
          <span>Indice KLIQUE</span><strong>{athlete.coverage}</strong><small>Couverture média</small>
          <div className="premium-score-track"><span style={{ width: `${athlete.coverage}%` }} /></div>
        </div>
      </section>
      <section className="premium-command-bar">
        <div><span>Médias</span><strong>{athlete.media}</strong></div>
        <div><span>Premium</span><strong>{athlete.premium}</strong></div>
        <div><span>Dernier shooting</span><strong>{lastShootingLabel}</strong></div>
        <div><span>Instagram</span><strong>{athlete.instagram || "À compléter"}</strong></div>
      </section>
    </>
  );
}
