"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { MediaAthletePublicProfile } from "@/types/athlete";

const instagramHref = (value: string): string => {
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.startsWith("@") ? value.slice(1) : value;
  return `https://instagram.com/${handle}`;
};

export function MediaAthleteProfileScreen({ athleteId }: { athleteId: string }) {
  const [athlete, setAthlete] = useState<MediaAthletePublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const response = await fetch(`/api/media/athletes/${encodeURIComponent(athleteId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as { athlete?: MediaAthletePublicProfile; error?: string };
        if (!response.ok || !payload.athlete) throw new Error(payload.error || "Impossible de charger cette fiche publique.");
        if (active) setAthlete(payload.athlete);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger cette fiche publique.");
      } finally {
        if (active) setLoading(false);
      }
    };
    if (athleteId) void loadProfile();
    return () => { active = false; };
  }, [athleteId]);

  if (loading) return <section className="partner-portal-state">Chargement de la fiche…</section>;
  if (error || !athlete) {
    return (
      <section className="partner-portal partner-athlete-profile">
        <Link href="/media/athletes" className="partner-athlete-back"><ArrowLeft size={16} aria-hidden /> Retour aux athlètes</Link>
        <section className="partner-portal-state" role="alert">{error || "Athlète public introuvable."}</section>
      </section>
    );
  }

  return (
    <section className="partner-portal partner-athlete-profile">
      <Link href="/media/athletes" className="partner-athlete-back"><ArrowLeft size={16} aria-hidden /> Retour aux athlètes</Link>
      <header className="partner-athlete-profile-hero">
        {athlete.portraitUrl ? <img src={athlete.portraitUrl} alt="" /> : null}
        <div>
          <h1>{athlete.name}</h1>
          <dl className="partner-athlete-profile-meta">
            {athlete.sport ? <div><dt>Sport</dt><dd>{athlete.sport}</dd></div> : null}
            {athlete.club ? <div><dt>Club / équipe</dt><dd>{athlete.club}</dd></div> : null}
            {athlete.age !== undefined ? <div><dt>Âge</dt><dd>{athlete.age} ans</dd></div> : null}
            {athlete.nationality ? <div><dt>Nationalité</dt><dd>{athlete.nationality}</dd></div> : null}
            {athlete.position ? <div><dt>Poste / spécialité</dt><dd>{athlete.position}</dd></div> : null}
          </dl>
        </div>
      </header>

      <div className="partner-athlete-profile-grid">
        {athlete.journey ? <section><span>Parcours sportif</span><p>{athlete.journey}</p></section> : null}
        {athlete.goals ? <section><span>Objectifs sportifs</span><p>{athlete.goals}</p></section> : null}
        {athlete.palmares ? <section><span>Palmarès</span><p>{athlete.palmares}</p></section> : null}
        {athlete.shortTermGoals ? <section><span>Objectifs à court terme</span><p>{athlete.shortTermGoals}</p></section> : null}
        {athlete.longTermGoals ? <section><span>Objectifs à long terme</span><p>{athlete.longTermGoals}</p></section> : null}
        {athlete.instagram ? (
          <section className="partner-athlete-profile-wide">
            <span>Instagram public</span>
            <div className="partner-athlete-socials">
              <a href={instagramHref(athlete.instagram)} target="_blank" rel="noreferrer">
                Instagram<ExternalLink size={14} aria-hidden />
              </a>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}