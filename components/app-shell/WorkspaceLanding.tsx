"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/src/design-system/components";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import type { ShootingsResponse, Shooting } from "@/types/shooting";
import type { ContentDocument } from "@/types/content-document";

type WorkspaceLandingProps = {
  sectionTitle?: string;
};

type AthleteOfTheMonthNomination = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  nominatedAt: string;
  reason: string | null;
};

type AthleteOfTheMonthWinner = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  awardedAt: string;
  description: string | null;
};

const DRAFT_KEY_PREFIX = "klique.contents.document-editor.draft.v1";
const ATHLETE_OF_THE_MONTH_TYPE = "athlete_of_the_month";
const MONTH_LABELS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

const normalize = (value: unknown): string => String(value ?? "").trim();

const parseDateRank = (value: string): number => {
  const raw = normalize(value);
  if (!raw) return Number.MIN_SAFE_INTEGER;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? Number.MIN_SAFE_INTEGER : date.getTime();
  }

  const fr = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime();
    }
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? Number.MIN_SAFE_INTEGER : fallback.getTime();
};

const formatDate = (value: string): string => {
  const rank = parseDateRank(value);
  if (rank === Number.MIN_SAFE_INTEGER) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(rank));
};

const getDocumentTitle = (document: ContentDocument): string => {
  if (document.type === "interview") return normalize(document.sections.title) || "Interview sans titre";
  if (document.type === "publication") return normalize(document.sections.title) || "Publication sans titre";
  return normalize(document.sections.title) || "Reel sans titre";
};

const isMeaningfulAppointment = (value: string): boolean => {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return false;
  if (["non", "aucun", "aucune", "rien", "nothing", "none"].includes(normalized)) return false;
  if (/^(non|aucun|aucune|rien|nothing|none)(\s*[:\-].*)?$/.test(normalized)) return false;
  return true;
};

export function WorkspaceLanding({ sectionTitle = "Aujourd'hui" }: WorkspaceLandingProps) {
  const now = new Date();
  const currentAwardMonth = now.getMonth() + 1;
  const currentAwardYear = now.getFullYear();
  const [loading, setLoading] = useState(true);
  const [athletesAvailable, setAthletesAvailable] = useState(false);
  const [productionsAvailable, setProductionsAvailable] = useState(false);
  const [athletes, setAthletes] = useState<AthletesResponse["athletes"]>([]);
  const [shootings, setShootings] = useState<Shooting[]>([]);
  const [savedDocuments, setSavedDocuments] = useState<ContentDocument[]>([]);
  const [monthlyNominations, setMonthlyNominations] = useState<AthleteOfTheMonthNomination[]>([]);
  const [monthlyWinner, setMonthlyWinner] = useState<AthleteOfTheMonthWinner | null>(null);
  const [selectedNomineeAthleteId, setSelectedNomineeAthleteId] = useState("");
  const [selectedWinnerAthleteId, setSelectedWinnerAthleteId] = useState("");
  const [winnerDescription, setWinnerDescription] = useState("");
  const [nominationLoading, setNominationLoading] = useState(false);
  const [nominationError, setNominationError] = useState<string | null>(null);

  const loadAthleteOfTheMonth = async () => {
    const response = await fetch(
      `/api/athlete-distinctions?type=${encodeURIComponent(ATHLETE_OF_THE_MONTH_TYPE)}&awardMonth=${currentAwardMonth}&awardYear=${currentAwardYear}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("Impossible de charger les nominations du mois.");
    }

    const payload = (await response.json()) as {
      nominations?: AthleteOfTheMonthNomination[];
      winner?: AthleteOfTheMonthWinner | null;
    };

    return {
      nominations: Array.isArray(payload.nominations) ? payload.nominations : [],
      winner: payload.winner ?? null,
    };
  };

  useEffect(() => {
    let active = true;

    const loadDashboardData = async () => {
      setLoading(true);

      try {
        const [athletesResponse, shootingsResponse, awardResponse] = await Promise.all([
          fetch("/api/athletes", { cache: "no-store" }),
          fetch("/api/shootings", { cache: "no-store" }),
          loadAthleteOfTheMonth(),
        ]);

        const athletesPayload = (await athletesResponse.json()) as AthletesResponse | { error?: string };
        const shootingsPayload = (await shootingsResponse.json()) as ShootingsResponse | { error?: string };

        if (!active) return;

        if (athletesResponse.ok && "source" in athletesPayload && athletesPayload.source === "google-sheets") {
          setAthletesAvailable(true);
          setAthletes(athletesPayload.athletes);
        } else {
          setAthletesAvailable(false);
          setAthletes([]);
        }

        if (shootingsResponse.ok && "source" in shootingsPayload && shootingsPayload.source === "google-sheets") {
          setProductionsAvailable(true);
          setShootings(shootingsPayload.shootings);
        } else {
          setProductionsAvailable(false);
          setShootings([]);
        }

        const drafts: ContentDocument[] = [];
        const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(`${DRAFT_KEY_PREFIX}:`));
        for (const key of keys) {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          try {
            drafts.push(JSON.parse(raw) as ContentDocument);
          } catch {
            // Ignore malformed saved entries.
          }
        }
        setSavedDocuments(
          drafts.sort((a, b) => {
            const aRank = parseDateRank(a.updatedAt || a.createdAt);
            const bRank = parseDateRank(b.updatedAt || b.createdAt);
            return bRank - aRank;
          })
        );

        setMonthlyNominations(awardResponse.nominations);
        setMonthlyWinner(awardResponse.winner);
      } catch {
        if (!active) return;
        setAthletesAvailable(false);
        setProductionsAvailable(false);
        setAthletes([]);
        setShootings([]);
        setSavedDocuments([]);
        setMonthlyNominations([]);
        setMonthlyWinner(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadDashboardData();

    return () => {
      active = false;
    };
  }, []);

  const activeAthletesCount = useMemo(() => {
    return athletes.filter((athlete) => normalize(athlete.status).toLowerCase().includes("actif")).length;
  }, [athletes]);

  const latestAthletes = useMemo(() => {
    return [...athletes]
      .sort((a, b) => parseDateRank(b.adhesionDate) - parseDateRank(a.adhesionDate))
      .slice(0, 4);
  }, [athletes]);

  const importantAppointments = useMemo(() => {
    return athletes
      .filter((athlete) => isMeaningfulAppointment(athlete.importantRendezVousThisWeek ?? ""))
      .map((athlete) => ({
        athlete,
        appointment: normalize(athlete.importantRendezVousThisWeek ?? ""),
        responseDate: normalize(athlete.lastResponseWeekly),
      }))
      .sort((a, b) => parseDateRank(b.responseDate) - parseDateRank(a.responseDate))
      .slice(0, 4);
  }, [athletes]);

  const pendingProductionsCount = useMemo(() => {
    return shootings.filter((item) => !item.published).length;
  }, [shootings]);

  const latestProductions = useMemo(() => {
    return [...shootings]
      .sort((a, b) => parseDateRank(b.date) - parseDateRank(a.date))
      .slice(0, 4);
  }, [shootings]);

  const recentDocuments = useMemo(() => savedDocuments.slice(0, 4), [savedDocuments]);

  const monthLabel = useMemo(() => {
    const monthText = MONTH_LABELS[currentAwardMonth - 1] ?? "mois";
    return `${monthText} ${currentAwardYear}`;
  }, [currentAwardMonth, currentAwardYear]);

  const nominatedAthleteIds = useMemo(
    () => new Set(monthlyNominations.map((nomination) => nomination.athleteId)),
    [monthlyNominations],
  );

  const nomineeCandidates = useMemo(() => {
    return athletes.filter((athlete) => !nominatedAthleteIds.has(athlete.key));
  }, [athletes, nominatedAthleteIds]);

  const winnerCandidates = useMemo(() => {
    const byId = new Map(athletes.map((athlete) => [athlete.key, athlete]));
    return monthlyNominations
      .map((nomination) => byId.get(nomination.athleteId))
      .filter((athlete): athlete is Athlete => Boolean(athlete));
  }, [athletes, monthlyNominations]);

  const getAthleteName = (athleteId: string): string => {
    const athlete = athletes.find((item) => item.key === athleteId);
    return athlete?.name || athleteId;
  };

  const refreshAthleteOfTheMonth = async () => {
    const payload = await loadAthleteOfTheMonth();
    setMonthlyNominations(payload.nominations);
    setMonthlyWinner(payload.winner);
  };

  const addNomination = async () => {
    if (!selectedNomineeAthleteId || monthlyWinner || monthlyNominations.length >= 3) {
      return;
    }

    setNominationLoading(true);
    setNominationError(null);

    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "nominate",
          athleteId: selectedNomineeAthleteId,
          type: ATHLETE_OF_THE_MONTH_TYPE,
          awardMonth: currentAwardMonth,
          awardYear: currentAwardYear,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Impossible d'ajouter le nomine.");
      }

      setSelectedNomineeAthleteId("");
      await refreshAthleteOfTheMonth();
    } catch (error) {
      setNominationError(error instanceof Error ? error.message : "Impossible d'ajouter le nomine.");
    } finally {
      setNominationLoading(false);
    }
  };

  const removeNomination = async (nominationId: string) => {
    if (!nominationId || monthlyWinner) {
      return;
    }

    setNominationLoading(true);
    setNominationError(null);

    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-nomination",
          nominationId,
          type: ATHLETE_OF_THE_MONTH_TYPE,
          awardMonth: currentAwardMonth,
          awardYear: currentAwardYear,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Impossible de supprimer le nomine.");
      }

      await refreshAthleteOfTheMonth();
    } catch (error) {
      setNominationError(error instanceof Error ? error.message : "Impossible de supprimer le nomine.");
    } finally {
      setNominationLoading(false);
    }
  };

  const designateWinner = async () => {
    if (!selectedWinnerAthleteId || monthlyWinner || monthlyNominations.length !== 3) {
      return;
    }

    setNominationLoading(true);
    setNominationError(null);

    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "designate-winner",
          athleteId: selectedWinnerAthleteId,
          type: ATHLETE_OF_THE_MONTH_TYPE,
          awardMonth: currentAwardMonth,
          awardYear: currentAwardYear,
          description: winnerDescription,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Impossible de designer le vainqueur.");
      }

      setWinnerDescription("");
      await refreshAthleteOfTheMonth();
    } catch (error) {
      setNominationError(error instanceof Error ? error.message : "Impossible de designer le vainqueur.");
    } finally {
      setNominationLoading(false);
    }
  };

  return (
    <section className="workspace-landing">
      <header className="workspace-hero-banner">
        <div className="workspace-hero-background" aria-hidden />
        <div className="workspace-hero-overlay" aria-hidden />
        <div className="workspace-hero-content">
          <p className="workspace-kicker">{sectionTitle.toUpperCase()}</p>
          <h1>Tableau de bord operationnel</h1>
          <p>Vue en temps reel des donnees disponibles dans KLIQUE OS.</p>
        </div>
      </header>

      <section className="workspace-dashboard-grid" aria-label="Apercu du dashboard">
        {athletesAvailable ? (
          <Card className="workspace-dashboard-card card-priorities">
            <header className="dashboard-card-head">
              <h2>Athletes CRM</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{activeAthletesCount} actifs</span>
              </div>
            </header>

            <ul className="priority-list">
              {latestAthletes.map((athlete) => (
                <li key={athlete.key} className="priority-item">
                  <span className="priority-check" aria-hidden />
                  <div className="priority-main">
                    <strong>{athlete.name}</strong>
                    <small>{normalize(athlete.sport) || "Sport non renseigne"}</small>
                  </div>
                  <small className="priority-date">{formatDate(athlete.adhesionDate)}</small>
                </li>
              ))}
            </ul>

            <Link href="/crm/personnes" className="card-link-button">
              Ouvrir le CRM Athletes
            </Link>
          </Card>
        ) : null}

        {athletesAvailable ? (
          <Card className="workspace-dashboard-card card-priorities">
            <header className="dashboard-card-head">
              <h2>Athlete KLIQUE du mois</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{monthlyNominations.length} / 3 nomines</span>
              </div>
            </header>

            <p style={{ marginTop: 0, color: "#4b5563" }}>Periode en cours: {monthLabel}</p>

            {monthlyWinner ? (
              <div style={{ border: "1px solid #d1fae5", background: "#ecfdf5", borderRadius: "12px", padding: "0.7rem", marginBottom: "0.7rem" }}>
                <strong style={{ color: "#065f46" }}>Vainqueur: {getAthleteName(monthlyWinner.athleteId)}</strong>
                <p style={{ margin: "0.25rem 0 0", color: "#047857" }}>
                  {monthlyWinner.description || "Distinction athlete_of_the_month enregistree."}
                </p>
              </div>
            ) : null}

            {monthlyNominations.length > 0 ? (
              <ul className="priority-list">
                {monthlyNominations.map((nomination) => (
                  <li key={nomination.id} className="priority-item">
                    <span className="priority-check" aria-hidden />
                    <div className="priority-main">
                      <strong>{getAthleteName(nomination.athleteId)}</strong>
                      <small>{nomination.reason || "Nomination athlete_of_the_month"}</small>
                    </div>
                    {!monthlyWinner ? (
                      <button
                        type="button"
                        onClick={() => void removeNomination(nomination.id)}
                        disabled={nominationLoading}
                        style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: "999px", padding: "0.25rem 0.6rem", cursor: "pointer" }}
                      >
                        Retirer
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun nomine enregistre pour cette periode.</p>
            )}

            {!monthlyWinner && monthlyNominations.length < 3 ? (
              <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <select
                    value={selectedNomineeAthleteId}
                    onChange={(event) => setSelectedNomineeAthleteId(event.target.value)}
                    style={{ minWidth: "220px", border: "1px solid #d1d5db", borderRadius: "10px", padding: "0.45rem 0.6rem" }}
                  >
                    <option value="">Selectionner un athlete</option>
                    {nomineeCandidates.map((athlete) => (
                      <option key={athlete.key} value={athlete.key}>
                        {athlete.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void addNomination()}
                    disabled={!selectedNomineeAthleteId || nominationLoading}
                    className="card-link-button"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            ) : null}

            {!monthlyWinner && monthlyNominations.length === 3 ? (
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.55rem" }}>
                <strong>Designer le vainqueur</strong>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <select
                    value={selectedWinnerAthleteId}
                    onChange={(event) => setSelectedWinnerAthleteId(event.target.value)}
                    style={{ minWidth: "220px", border: "1px solid #d1d5db", borderRadius: "10px", padding: "0.45rem 0.6rem" }}
                  >
                    <option value="">Choisir parmi les 3 nomines</option>
                    {winnerCandidates.map((athlete) => (
                      <option key={athlete.key} value={athlete.key}>
                        {athlete.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void designateWinner()}
                    disabled={!selectedWinnerAthleteId || nominationLoading}
                    className="card-link-button"
                  >
                    Designer le vainqueur
                  </button>
                </div>
                <input
                  type="text"
                  value={winnerDescription}
                  onChange={(event) => setWinnerDescription(event.target.value)}
                  placeholder="Description optionnelle"
                  style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "0.45rem 0.6rem" }}
                />
              </div>
            ) : null}

            {nominationError ? <p style={{ color: "#b91c1c", marginBottom: 0 }}>{nominationError}</p> : null}
          </Card>
        ) : null}

        {athletesAvailable && importantAppointments.length > 0 ? (
          <Card className="workspace-dashboard-card card-priorities">
            <header className="dashboard-card-head">
              <h2>Rendez-vous importants cette semaine</h2>
            </header>

            <ul className="priority-list">
              {importantAppointments.map(({ athlete, appointment, responseDate }) => (
                <li key={`${athlete.key}-${responseDate}`} className="priority-item">
                  <span className="priority-check" aria-hidden />
                  <div className="priority-main">
                    <strong>
                      <Link href={`/crm/personnes/${athlete.key}`}>{athlete.name}</Link>
                    </strong>
                    <small>{appointment}</small>
                  </div>
                  <small className="priority-date">{formatDate(responseDate)}</small>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {athletesAvailable && importantAppointments.length === 0 ? (
          <Card className="workspace-dashboard-card card-priorities">
            <header className="dashboard-card-head">
              <h2>Rendez-vous importants cette semaine</h2>
            </header>
            <p>Aucun rendez-vous important signalé cette semaine</p>
          </Card>
        ) : null}

        {productionsAvailable ? (
          <Card className="workspace-dashboard-card card-projects">
            <header className="dashboard-card-head">
              <h2>Productions</h2>
              <div className="dashboard-card-head-right">
                <span className="card-pill">{pendingProductionsCount} a finaliser</span>
              </div>
            </header>

            <ul className="project-list">
              {latestProductions.map((shooting, index) => (
                <li key={`${shooting.row ?? index}-${shooting.date}-${shooting.athlete}`} className="project-item">
                  <div className="project-main-row">
                    <span className="project-thumbnail" aria-hidden />
                    <div>
                      <strong>{normalize(shooting.athlete) || "Athlete non renseigne"}</strong>
                      <small>{normalize(shooting.type) || "Type non renseigne"}</small>
                    </div>
                  </div>
                  <div className="project-meta-row">
                    <small>{formatDate(shooting.date)}</small>
                    <small>{shooting.published ? "Publie" : "En cours"}</small>
                  </div>
                </li>
              ))}
            </ul>

            <Link href="/production" className="card-link-button">
              Ouvrir les productions
            </Link>
          </Card>
        ) : null}

        <Card className="workspace-dashboard-card card-activity">
          <header className="dashboard-card-head">
            <h2>Contenus sauvegardes</h2>
            <div className="dashboard-card-head-right">
              <span className="card-pill">{savedDocuments.length} brouillons</span>
            </div>
          </header>

          {recentDocuments.length > 0 ? (
            <ul className="activity-list">
              {recentDocuments.map((document) => (
                <li key={document.id} className="activity-item">
                  <span className="activity-icon" aria-hidden>
                    {document.type.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="activity-content">
                    <p>{getDocumentTitle(document)}</p>
                    <small>{formatDate(document.updatedAt || document.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucun contenu sauvegarde localement pour le moment.</p>
          )}

          <Link href="/contents" className="card-link-button">
            Ouvrir Contenus
          </Link>
        </Card>

        <Card className="workspace-dashboard-card card-events">
          <header className="dashboard-card-head">
            <h2>Raccourcis</h2>
          </header>

          <ul className="events-list">
            <li className="event-item">
              <span className="event-line" aria-hidden>
                <span className="event-dot" />
              </span>
              <div className="event-content">
                <strong>CRM Athletes</strong>
                <span>Gestion des personnes et statuts</span>
              </div>
              <Link href="/crm/personnes" className="card-link-button">Ouvrir</Link>
            </li>
            <li className="event-item">
              <span className="event-line" aria-hidden>
                <span className="event-dot" />
              </span>
              <div className="event-content">
                <strong>Productions</strong>
                <span>Suivi des shootings et livrables</span>
              </div>
              <Link href="/production" className="card-link-button">Ouvrir</Link>
            </li>
            <li className="event-item">
              <span className="event-line" aria-hidden>
                <span className="event-dot" />
              </span>
              <div className="event-content">
                <strong>Contenus</strong>
                <span>Assistant et documents editoriaux</span>
              </div>
              <Link href="/contents" className="card-link-button">Ouvrir</Link>
            </li>
          </ul>
        </Card>

        {!loading && !athletesAvailable && !productionsAvailable ? (
          <Card className="workspace-dashboard-card card-messages">
            <header className="dashboard-card-head">
              <h2>Sources indisponibles</h2>
            </header>
            <p>Les blocs dependants des donnees CRM/Productions ont ete masques temporairement car les sources reelles ne sont pas disponibles.</p>
          </Card>
        ) : null}
      </section>
    </section>
  );
}
