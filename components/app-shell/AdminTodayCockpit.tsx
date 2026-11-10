"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TodayActionsSummary,
  TodayDeadline,
} from "@/lib/admin-today-summary";
import {
  creativeApplicationStatusPresentation,
  sportsWatchStatusPresentation,
} from "@/lib/status-presentation";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error" };

const loadZone = async <T,>(zone: string): Promise<T> => {
  const response = await fetch(`/api/admin/today-summary/${zone}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Zone indisponible");
  return response.json() as Promise<T>;
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

const formatDeadline = (value: string): string =>
  new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function ZoneError({ retry }: { retry: () => void }) {
  return (
    <div className="today-zone-error" role="alert">
      <span>Impossible de charger cette zone.</span>
      <button type="button" onClick={retry}>Réessayer</button>
    </div>
  );
}

const quickLinks = [
  { label: "Athlètes", description: "Gérer les profils Athlètes.", href: "/crm/personnes" },
  { label: "Créatifs", description: "Suivre le réseau créatif.", href: "/crm/creatifs" },
  { label: "Partenaires & experts", description: "Piloter les relations partenaires.", href: "/ecosysteme" },
  { label: "Médias", description: "Accéder à la banque médias.", href: "/media" },
  { label: "Missions", description: "Organiser les missions créatives.", href: "/missions" },
  { label: "Sports Watch", description: "Examiner la veille sportive.", href: "/sports-watch" },
  { label: "Création de contenu", description: "Créer et gérer les contenus.", href: "/contents" },
  { label: "Production", description: "Suivre les productions.", href: "/production" },
] as const;

export function AdminTodayCockpit() {
  const [actions, setActions] = useState<LoadState<TodayActionsSummary>>({ status: "loading" });
  const [deadlines, setDeadlines] = useState<LoadState<{ items: TodayDeadline[] }>>({ status: "loading" });
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const refreshActions = useCallback(async () => {
    setActions({ status: "loading" });
    try {
      setActions({ status: "ready", data: await loadZone<TodayActionsSummary>("actions") });
    } catch {
      setActions({ status: "error" });
    }
  }, []);

  const refreshDeadlines = useCallback(async () => {
    setDeadlines({ status: "loading" });
    try {
      setDeadlines({ status: "ready", data: await loadZone<{ items: TodayDeadline[] }>("deadlines") });
    } catch {
      setDeadlines({ status: "error" });
    }
  }, []);

  const refreshAll = useCallback(() => {
    void Promise.all([refreshActions(), refreshDeadlines()]).finally(() => setRefreshedAt(new Date()));
  }, [refreshActions, refreshDeadlines]);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      loadZone<TodayActionsSummary>("actions"),
      loadZone<{ items: TodayDeadline[] }>("deadlines"),
    ]).then(([actionsResult, deadlinesResult]) => {
      if (!active) return;
      setActions(actionsResult.status === "fulfilled"
        ? { status: "ready", data: actionsResult.value }
        : { status: "error" });
      setDeadlines(deadlinesResult.status === "fulfilled"
        ? { status: "ready", data: deadlinesResult.value }
        : { status: "error" });
      setRefreshedAt(new Date());
    });
    return () => {
      active = false;
    };
  }, []);

  const actionTotal = useMemo(() => actions.status === "ready"
    ? actions.data.items.reduce((total, item) => total + (item.actionCount ?? item.count), 0)
    : null, [actions]);
  const visibleActions = actions.status === "ready"
    ? actions.data.items.filter((item) => item.count > 0)
    : [];

  return (
    <main className="admin-today">
      <header className="admin-today-header">
        <div>
          <p className="admin-today-kicker">Aujourd’hui</p>
          <h1>{formatDate(new Date())}</h1>
        </div>
        <div className="admin-today-header-meta">
          <strong>{actionTotal ?? "—"} action{actionTotal === 1 ? "" : "s"}</strong>
          <button type="button" onClick={refreshAll} aria-label="Réactualiser le cockpit">
            Réactualiser
          </button>
          {refreshedAt ? (
            <small>Mis à jour à {refreshedAt.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</small>
          ) : null}
        </div>
      </header>

      <section className="admin-today-zone" aria-labelledby="today-actions-title">
        <div className="admin-today-zone-heading">
          <div>
            <span>01</span>
            <h2 id="today-actions-title">À traiter maintenant</h2>
          </div>
        </div>
        {actions.status === "loading" ? <p className="today-zone-placeholder">Chargement…</p> : null}
        {actions.status === "error" ? <ZoneError retry={refreshActions} /> : null}
        {actions.status === "ready" ? (
          <>
            {visibleActions.length > 0 ? (
              <div className="today-action-grid">
                {visibleActions.map((item) => {
                  const details = item.details?.filter((detail) => detail.count > 0) ?? [];
                  const statusLabel = item.id === "creative-applications"
                    ? creativeApplicationStatusPresentation.pending.label
                    : item.id === "sports-watch"
                      ? sportsWatchStatusPresentation.pending.label
                      : null;
                  return (
                    <Link href={item.href} className="today-action-card" key={item.id}>
                      <span className="today-action-count">{item.count}</span>
                      <span className="today-action-label">{item.label}</span>
                      <span className={`today-action-priority is-${item.priority}`}>
                        Priorité {item.priority}
                      </span>
                      {item.ageLabel ? (
                        <time dateTime={item.oldestAt ?? undefined}>{item.ageLabel}</time>
                      ) : <small>Aucune ancienneté disponible</small>}
                      {statusLabel ? <small>{statusLabel}</small> : null}
                      {details.length > 0 ? (
                        <span className="today-action-details">
                          {details.map((detail) => (
                            <span key={detail.label}>{detail.label} <strong>{detail.count}</strong></span>
                          ))}
                        </span>
                      ) : null}
                      <span className="today-action-link">Voir les éléments</span>
                    </Link>
                  );
                })}
              </div>
            ) : <p className="today-zone-empty">Aucune action immédiate.</p>}
            {actions.data.errors.length > 0 ? (
              <div className="today-source-errors" role="status">
                {actions.data.errors.map((error) => (
                  <span key={error.source}>{error.source} indisponible</span>
                ))}
                <button type="button" onClick={refreshActions}>Réessayer</button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="admin-today-zone" aria-labelledby="today-deadlines-title">
        <div className="admin-today-zone-heading">
          <div>
            <span>02</span>
            <h2 id="today-deadlines-title">Prochaines échéances</h2>
          </div>
          <Link href="/calendar">Tout voir</Link>
        </div>
        {deadlines.status === "loading" ? <p className="today-zone-placeholder">Chargement…</p> : null}
        {deadlines.status === "error" ? <ZoneError retry={refreshDeadlines} /> : null}
        {deadlines.status === "ready" ? (
          deadlines.data.items.length > 0 ? (
            <ul className="today-deadline-list">
              {deadlines.data.items.slice(0, 5).map((deadline) => (
                <li key={deadline.id}>
                  <Link href={deadline.href}>
                    <span><small>{deadline.kind}</small>{deadline.label}</span>
                    <time dateTime={deadline.date}>{formatDeadline(deadline.date)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="today-zone-empty">Aucune échéance datée à venir.</p>
        ) : null}
      </section>

      <section className="admin-today-zone" aria-labelledby="today-quick-title">
        <div className="admin-today-zone-heading">
          <div>
            <span>03</span>
            <h2 id="today-quick-title">Accès rapides</h2>
          </div>
        </div>
        <nav className="today-quick-links" aria-label="Accès rapides Admin">
          {quickLinks.map((link) => (
            <Link href={link.href} key={link.href}>
              <strong>{link.label}</strong>
              <span>{link.description}</span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
