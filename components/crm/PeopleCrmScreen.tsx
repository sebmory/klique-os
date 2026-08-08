"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, LayoutList, MoreHorizontal, Search } from "lucide-react";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import { CrmModuleNav } from "@/components/crm/CrmModuleNav";

type ContactType = "Athletes" | "Partenaires" | "Clubs" | "Medias" | "Journalistes" | "Sponsors";
type ContactStatus = "Actif" | "Prospect" | "Inactif";
type SortKey = "name" | "lastActivity" | "createdAt" | "clubName";
type ViewMode = "list" | "cards";

type Person = {
  id: string;
  name: string;
  sport: string;
  organization: string;
  clubName: string;
  type: ContactType;
  status: ContactStatus;
  lastActivity: string;
  lastActivityRank: number;
  createdAt: string;
  createdAtRank: number;
  projects: number;
  media: number;
};

const parseDateRank = (value: string): number => {
  if (!value) return 0;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
};

const statusFromAthlete = (status: string): ContactStatus => {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("inactif")) return "Inactif";
  if (normalized.includes("prospect") || normalized.includes("valider") || normalized.includes("nouveau")) {
    return "Prospect";
  }
  return "Actif";
};

const activityFromAthlete = (athlete: Athlete): string => {
  if (athlete.lastContact) return athlete.lastContact;
  if (athlete.lastShoot) return athlete.lastShoot;
  if (athlete.nextContact) return `Prochain: ${athlete.nextContact}`;
  return "Aucune activite recente";
};

const projectCountFromAthlete = (athlete: Athlete): number => {
  const segments = athlete.plannedContents
    .split(/[\n,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length > 0) return segments.length;
  if (athlete.premium > 0) return athlete.premium;
  return 0;
};

const mapAthleteToPerson = (athlete: Athlete): Person => ({
  id: athlete.key,
  name: athlete.name,
  sport: athlete.sport || "Non renseigne",
  organization: athlete.club || "Organisation non renseignee",
  clubName: athlete.club || "Club non renseigne",
  type: "Athletes",
  status: statusFromAthlete(athlete.status),
  lastActivity: activityFromAthlete(athlete),
  lastActivityRank: athlete.daysWithoutVisibility > 0 ? athlete.daysWithoutVisibility : Number.MAX_SAFE_INTEGER,
  createdAt: athlete.adhesionDate || "Non renseigné",
  createdAtRank: parseDateRank(athlete.adhesionDate),
  projects: projectCountFromAthlete(athlete),
  media: athlete.media,
});

const filterOptions: Array<{ label: string; value: "Tous" | ContactType }> = [
  { label: "Tous", value: "Tous" },
  { label: "Athletes", value: "Athletes" },
  { label: "Partenaires", value: "Partenaires" },
  { label: "Clubs", value: "Clubs" },
  { label: "Medias", value: "Medias" },
  { label: "Journalistes", value: "Journalistes" },
  { label: "Sponsors", value: "Sponsors" },
];

export function PeopleCrmScreen() {
  const [rawAthletes, setRawAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filterOptions)[number]["value"]>("Tous");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAthletes = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/athletes", { cache: "no-store" });
        const payload = (await response.json()) as AthletesResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error || "Chargement impossible." : "Chargement impossible.");
        }

        if (!("source" in payload) || payload.source !== "google-sheets") {
          const details = "message" in payload && payload.message ? ` (${payload.message})` : "";
          throw new Error(`Les donnees CRM reelles (Google Sheets) sont indisponibles.${details}`);
        }

        if (!active) return;
        const athletes = "athletes" in payload ? payload.athletes : [];
        setRawAthletes(athletes);
        setActiveRowId(athletes[0]?.key ?? null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les personnes.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAthletes();

    return () => {
      active = false;
    };
  }, [retryToken]);

  const peopleSource = useMemo(() => rawAthletes.map(mapAthleteToPerson), [rawAthletes]);

  const people = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = peopleSource.filter((person) => {
      if (filter !== "Tous" && person.type !== filter) return false;
      if (!normalizedQuery) return true;

      return [person.name, person.sport, person.organization, person.clubName, person.type]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "lastActivity") return a.lastActivityRank - b.lastActivityRank;
      if (sortBy === "createdAt") return b.createdAtRank - a.createdAtRank;
      return a.clubName.localeCompare(b.clubName);
    });
  }, [filter, peopleSource, query, sortBy]);

  const isEmpty = !loading && people.length === 0;

  return (
    <section className="crm-people-screen">
      <CrmModuleNav />

      <header className="crm-people-header">
        <div>
          <h1>Personnes</h1>
          <p>Retrouvez tous vos contacts, athletes, partenaires et organisations.</p>
        </div>
        <button type="button" className="crm-primary-action">
          + Nouvelle personne
        </button>
      </header>

      <section className="crm-actions-bar" aria-label="Actions CRM">
        <label className="crm-search" htmlFor="crm-search">
          <Search size={18} aria-hidden />
          <input
            id="crm-search"
            type="search"
            placeholder="Rechercher une personne..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="crm-filter-scroller" role="tablist" aria-label="Filtres personnes">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={option.value === filter}
              className={option.value === filter ? "crm-filter-chip is-active" : "crm-filter-chip"}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="crm-actions-right">
          <label className="crm-select-wrap">
            <span>Trier</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
              <option value="name">Nom</option>
              <option value="lastActivity">Derniere activite</option>
              <option value="createdAt">Date de creation</option>
              <option value="clubName">Nom du club</option>
            </select>
          </label>

          <div className="crm-view-toggle" role="group" aria-label="Choix de vue">
            <button
              type="button"
              className={viewMode === "list" ? "is-active" : undefined}
              onClick={() => setViewMode("list")}
              aria-label="Vue liste"
            >
              <LayoutList size={18} aria-hidden />
              <span>Liste</span>
            </button>
            <button
              type="button"
              className={viewMode === "cards" ? "is-active" : undefined}
              onClick={() => setViewMode("cards")}
              aria-label="Vue cartes"
            >
              <LayoutGrid size={18} aria-hidden />
              <span>Cartes</span>
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="crm-skeleton-shell" aria-live="polite" aria-busy="true">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement des athletes...</span>
        </section>
      ) : null}

      {!loading && errorMessage ? (
        <section className="crm-error-state" aria-live="assertive">
          <h2>Impossible de charger les personnes</h2>
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setRetryToken((value) => value + 1);
            }}
          >
            Reessayer
          </button>
        </section>
      ) : null}

      {!loading && !errorMessage && isEmpty ? (
        <section className="crm-empty-state" aria-live="polite">
          <div className="crm-empty-icon" aria-hidden>
            <Search size={20} />
          </div>
          <h2>Aucun contact ne correspond a votre recherche</h2>
          <p>Essayez un autre filtre ou ajustez les mots-cles pour retrouver une personne rapidement.</p>
          <button
            type="button"
            onClick={() => {
              setFilter("Tous");
              setQuery("");
            }}
          >
            Reinitialiser les filtres
          </button>
        </section>
      ) : !loading && !errorMessage ? (
        <>
          <section className={viewMode === "cards" ? "crm-list-shell is-hidden" : "crm-list-shell"}>
            <div className="crm-list-head" role="row">
              <span>Personne</span>
              <span>Sport</span>
              <span>Organisation</span>
              <span>Statut</span>
              <span>Derniere activite</span>
              <span>Projets</span>
              <span>Medias</span>
              <span aria-hidden>Actions</span>
            </div>

            <ul className="crm-list-body">
              {people.map((person) => (
                <li key={person.id}>
                  <div
                    className={person.id === activeRowId ? "crm-row is-active" : "crm-row"}
                  >
                    <Link
                      href={`/crm/personnes/${person.id}`}
                      className="crm-row-link-overlay"
                      aria-label={`Ouvrir la fiche de ${person.name}`}
                      onClick={() => {
                        setActiveRowId(person.id);
                        setOpenMenuId(null);
                      }}
                    />
                    <span className="crm-person-cell">
                      <span className="crm-avatar" aria-hidden>
                        {person.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <span className="crm-name-stack">
                        <strong>{person.name}</strong>
                        <small>{person.type}</small>
                      </span>
                    </span>
                    <span>{person.sport}</span>
                    <span>{person.organization}</span>
                    <span>
                      <small className={`crm-status-badge is-${person.status.toLowerCase()}`}>{person.status}</small>
                    </span>
                    <span>{person.lastActivity}</span>
                    <span>{person.projects}</span>
                    <span>{person.media}</span>
                    <span className="crm-row-menu-shell">
                      <button
                        type="button"
                        className="crm-row-menu-trigger"
                        aria-label={`Actions ${person.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId((current) => (current === person.id ? null : person.id));
                        }}
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                      {openMenuId === person.id ? (
                        <div
                          className="crm-row-menu"
                          role="menu"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button type="button" role="menuitem">
                            Voir
                          </button>
                          <button type="button" role="menuitem">
                            Modifier
                          </button>
                          <button type="button" role="menuitem">
                            Archiver
                          </button>
                        </div>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={viewMode === "list" ? "crm-cards-grid desktop-hidden-by-mode" : "crm-cards-grid"}>
            {people.map((person) => (
              <article key={person.id} className="crm-person-card">
                <Link
                  href={`/crm/personnes/${person.id}`}
                  className="crm-card-link-overlay"
                  aria-label={`Ouvrir la fiche de ${person.name}`}
                  onClick={() => setActiveRowId(person.id)}
                />
                <header>
                  <span className="crm-avatar" aria-hidden>
                    {person.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <h3>{person.name}</h3>
                    <p>{person.organization}</p>
                  </div>
                </header>

                <dl>
                  <div>
                    <dt>Sport</dt>
                    <dd>{person.sport}</dd>
                  </div>
                  <div>
                    <dt>Club</dt>
                    <dd>{person.clubName}</dd>
                  </div>
                  <div>
                    <dt>Activite</dt>
                    <dd>{person.lastActivity}</dd>
                  </div>
                  <div>
                    <dt>Statut</dt>
                    <dd>
                      <small className={`crm-status-badge is-${person.status.toLowerCase()}`}>{person.status}</small>
                    </dd>
                  </div>
                </dl>

                <footer>
                  <span>{person.projects} projets</span>
                  <span>{person.media} medias</span>
                </footer>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </section>
  );
}
