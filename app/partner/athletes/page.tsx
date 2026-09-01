"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { PublicAthleteDirectoryEntry } from "@/types/athlete";
import { normalizePublicSportLabel } from "@/lib/public-athletes";

const normalize = (value: unknown): string => String(value ?? "").trim();

export default function PartnerAthletesPage() {
  const [athletes, setAthletes] = useState<PublicAthleteDirectoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("Tous");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadAthletes = async () => {
      try {
        const response = await fetch("/api/partner/athletes", { credentials: "include", cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Impossible de charger l’annuaire des athlètes.");
        if (active) setAthletes(Array.isArray(payload.athletes) ? payload.athletes : []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger l’annuaire des athlètes.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAthletes();
    return () => {
      active = false;
    };
  }, []);

  const normalizedAthletes = useMemo(
    () => athletes.map((athlete) => ({ ...athlete, sport: normalizePublicSportLabel(athlete.sport) })),
    [athletes],
  );

  const sports = useMemo(() => {
    const values = Array.from(new Set(normalizedAthletes.map((athlete) => athlete.sport).filter(Boolean)));
    return ["Tous", ...values.sort((left, right) => left.localeCompare(right, "fr"))];
  }, [normalizedAthletes]);

  const visibleAthletes = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("fr");
    return normalizedAthletes.filter((athlete) => {
      const matchesName = !search || athlete.name.toLocaleLowerCase("fr").includes(search);
      const matchesSport = sport === "Tous" || athlete.sport === sport;
      return matchesName && matchesSport;
    });
  }, [normalizedAthletes, query, sport]);

  return (
    <section className="partner-portal partner-athletes-directory">
      <header className="partner-portal-hero">
        <p>Communauté KLIQUE</p>
        <h1>Athlètes</h1>
      </header>

      <section className="partner-athletes-tools" aria-label="Filtres de l’annuaire">
        <label className="partner-athletes-search">
          <Search size={18} aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un athlète" />
        </label>
        <label className="partner-athletes-sport">
          <span>Sport</span>
          <select value={sport} onChange={(event) => setSport(event.target.value)}>
            {sports.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </section>

      {loading ? <section className="partner-portal-state">Chargement de l’annuaire…</section> : null}
      {!loading && error ? <section className="partner-portal-state" role="alert">{error}</section> : null}
      {!loading && !error && visibleAthletes.length === 0 ? <section className="partner-portal-state">Aucun athlète ne correspond à ces critères.</section> : null}

      {!loading && !error && visibleAthletes.length > 0 ? (
        <section className="partner-athletes-grid" aria-label="Annuaire des athlètes">
          {visibleAthletes.map((athlete) => (
            <Link key={athlete.athleteId} href={`/partner/athletes/${encodeURIComponent(athlete.athleteId)}`} className="partner-athlete-card">
              <div className="partner-athlete-portrait">
                {athlete.portraitUrl ? <img src={athlete.portraitUrl} alt="" /> : <span aria-hidden>{athlete.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div>
                <p>{athlete.sport || "Sport non renseigné"}</p>
                <h2>{athlete.name}</h2>
                <span>{athlete.club || "Club ou équipe non renseigné"}</span>
              </div>
            </Link>
          ))}
        </section>
      ) : null}
    </section>
  );
}