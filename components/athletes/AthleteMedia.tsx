"use client";

import type { Athlete } from "@/types/athlete";

const fmt = (value: number) => (value > 0 ? String(value) : "—");
const INVALID_DATES = ["30.12.1899", "1899-12-30"];
const fmtStr = (value: string | undefined) =>
  !value || !value.trim() || INVALID_DATES.includes(value.trim()) ? "—" : value;

export function AthleteMedia({
  stats,
  athlete,
}: {
  stats: {
    totalShootings: number;
    totalPhotos: number;
    totalVideos: number;
    completedShootings: number;
    toProcess: number;
    premiumRemaining: number;
  };
  athlete: Pick<Athlete, "lastPublication" | "lastPost" | "lastStory" | "daysWithoutVisibility">;
}) {
  return (
    <article className="panel premium-panel">
      <p className="eyebrow">Statistiques média</p>
      <div className="premium-info-list">
        <div><span>Shootings</span><strong>{fmt(stats.totalShootings)}</strong></div>
        <div><span>Photos totales</span><strong>{fmt(stats.totalPhotos)}</strong></div>
        <div><span>Vidéos totales</span><strong>{fmt(stats.totalVideos)}</strong></div>
        <div><span>Shootings terminés</span><strong>{fmt(stats.completedShootings)}</strong></div>
        <div><span>À traiter</span><strong>{fmt(stats.toProcess)}</strong></div>
        <div><span>Premium restants</span><strong>{fmt(stats.premiumRemaining)}</strong></div>
        <div><span>Dernière publication</span><strong>{fmtStr(athlete.lastPublication)}</strong></div>
        <div><span>Dernier post</span><strong>{fmtStr(athlete.lastPost)}</strong></div>
        <div><span>Dernière story</span><strong>{fmtStr(athlete.lastStory)}</strong></div>
        <div><span>Jours sans visibilité</span><strong>{athlete.daysWithoutVisibility > 0 ? String(athlete.daysWithoutVisibility) : "—"}</strong></div>
      </div>
    </article>
  );
}

