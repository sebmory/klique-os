"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/src/design-system/components";
import type { AthletesResponse } from "@/types/athlete";
import type { ShootingsResponse, Shooting } from "@/types/shooting";
import type { ContentDocument } from "@/types/content-document";

type WorkspaceLandingProps = {
  sectionTitle?: string;
};

const DRAFT_KEY_PREFIX = "klique.contents.document-editor.draft.v1";

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

export function WorkspaceLanding({ sectionTitle = "Aujourd'hui" }: WorkspaceLandingProps) {
  const [loading, setLoading] = useState(true);
  const [athletesAvailable, setAthletesAvailable] = useState(false);
  const [productionsAvailable, setProductionsAvailable] = useState(false);
  const [athletes, setAthletes] = useState<AthletesResponse["athletes"]>([]);
  const [shootings, setShootings] = useState<Shooting[]>([]);
  const [savedDocuments, setSavedDocuments] = useState<ContentDocument[]>([]);

  useEffect(() => {
    let active = true;

    const loadDashboardData = async () => {
      setLoading(true);

      try {
        const [athletesResponse, shootingsResponse] = await Promise.all([
          fetch("/api/athletes", { cache: "no-store" }),
          fetch("/api/shootings", { cache: "no-store" }),
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
      } catch {
        if (!active) return;
        setAthletesAvailable(false);
        setProductionsAvailable(false);
        setAthletes([]);
        setShootings([]);
        setSavedDocuments([]);
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

  const pendingProductionsCount = useMemo(() => {
    return shootings.filter((item) => !item.published).length;
  }, [shootings]);

  const latestProductions = useMemo(() => {
    return [...shootings]
      .sort((a, b) => parseDateRank(b.date) - parseDateRank(a.date))
      .slice(0, 4);
  }, [shootings]);

  const recentDocuments = useMemo(() => savedDocuments.slice(0, 4), [savedDocuments]);

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
