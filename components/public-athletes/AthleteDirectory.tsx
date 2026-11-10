"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PublicAthleteCard } from "@/lib/public-athletes";
import AthletePortrait from "./AthletePortrait";
import styles from "./public-athletes.module.css";

type AthleteDirectoryProps = {
  athletes: readonly PublicAthleteCard[];
};

const ATHLETES_PER_PAGE = 12;

const normalizeSearch = (value: string): string =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

export default function AthleteDirectory({ athletes }: AthleteDirectoryProps) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("");
  const [visibleCount, setVisibleCount] = useState(ATHLETES_PER_PAGE);
  const sports = useMemo(
    () => [...new Set(athletes.map((athlete) => athlete.sport))]
      .sort((left, right) => left.localeCompare(right, "fr")),
    [athletes],
  );
  const visibleAthletes = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return athletes.filter((athlete) =>
      (!sport || athlete.sport === sport)
      && (!normalizedQuery || normalizeSearch(athlete.name).includes(normalizedQuery)));
  }, [athletes, query, sport]);
  const displayedAthletes = visibleAthletes.slice(0, visibleCount);

  return (
    <>
      <div className={styles.filters} role="search" aria-label="Rechercher un athlète">
        <label>
          <span>Nom</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(ATHLETES_PER_PAGE);
            }}
            placeholder="Rechercher par nom"
          />
        </label>
        <label>
          <span>Sport</span>
          <select
            value={sport}
            onChange={(event) => {
              setSport(event.target.value);
              setVisibleCount(ATHLETES_PER_PAGE);
            }}
          >
            <option value="">Tous les sports</option>
            {sports.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <p className={styles.resultCount} aria-live="polite">
        {visibleAthletes.length} {visibleAthletes.length > 1 ? "athlètes" : "athlète"}
      </p>
      {visibleAthletes.length ? (
        <>
          <ul id="athlete-directory-results" className={styles.cardGrid}>
            {displayedAthletes.map((athlete) => (
              <li key={athlete.slug}>
                <Link className={styles.card} href={`/athletes/${athlete.slug}`}>
                  <AthletePortrait
                    name={athlete.name}
                    sport={athlete.sport}
                    portrait={athlete.portrait}
                    colorCategory={athlete.colorCategory}
                    decorative
                  />
                  <div>
                    <p>{athlete.sport}</p>
                    <h2>{athlete.name}</h2>
                    {athlete.club ? <span>{athlete.club}</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {displayedAthletes.length < visibleAthletes.length ? (
            <div className={styles.loadMore}>
              <button
                type="button"
                aria-controls="athlete-directory-results"
                onClick={() => setVisibleCount((count) => count + ATHLETES_PER_PAGE)}
              >
                Afficher plus d’athlètes
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.emptyState} role="status">
          <h2>Aucun profil ne correspond</h2>
          <p>Essayez un autre nom ou affichez tous les sports.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSport("");
              setVisibleCount(ATHLETES_PER_PAGE);
            }}
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </>
  );
}
