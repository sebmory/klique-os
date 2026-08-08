"use client";

import type { Athlete } from "@/types/athlete";

const safeValue = (value: string | number | undefined) => String(value ?? "").trim() || "—";

export function AthleteMainInfo({ athlete }: { athlete: Athlete }) {
  return (
    <section className="athlete-section-grid">
      <article className="panel">
        <p className="eyebrow">Informations principales</p>
        <div className="premium-info-list">
          <div><span>Nom</span><strong>{safeValue(athlete.name)}</strong></div>
          <div><span>Sport</span><strong>{safeValue(athlete.sport)}</strong></div>
          <div><span>Club</span><strong>{safeValue(athlete.club)}</strong></div>
          <div><span>Instagram</span><strong>{safeValue(athlete.instagram)}</strong></div>
          <div><span>Téléphone</span><strong>{safeValue(athlete.phone)}</strong></div>
          <div><span>E-mail</span><strong>{safeValue(athlete.email)}</strong></div>
          <div><span>Statut</span><strong>{safeValue(athlete.status)}</strong></div>
          <div><span>Date d'adhésion KLIQUE</span><strong>{safeValue(athlete.adhesionDate)}</strong></div>
          <div><span>Prochain contact</span><strong>{safeValue(athlete.nextContact)}</strong></div>
          <div><span>Date de naissance</span><strong>{safeValue(athlete.birthDate)}</strong></div>
          <div><span>Nationalité</span><strong>{safeValue(athlete.nationality)}</strong></div>
          <div><span>Taille / Poids</span><strong>{safeValue(athlete.heightWeight)}</strong></div>
          <div><span>Position / Spécialité</span><strong>{safeValue(athlete.position)}</strong></div>
          <div><span>Photo compétition</span><strong>{athlete.competitionPhoto ? "Oui" : "—"}</strong></div>
          <div><span>Notes</span><strong>{safeValue(athlete.notes)}</strong></div>
        </div>
      </article>
    </section>
  );
}
