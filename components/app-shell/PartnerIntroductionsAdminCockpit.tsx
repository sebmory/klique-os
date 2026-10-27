"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button } from "@/src/design-system/components";
import { TodayCollapsibleCard } from "@/components/app-shell/TodayCollapsibleCard";

type Summary = {
  id: string;
  partnerPublicName: string;
  athletePublicName: string;
  historical: boolean;
  reason: string;
  status: string;
  moderationStatus: string;
  createdAt: string;
  ageDays: number;
  stale: boolean;
  reported: boolean;
};

const statusLabels: Record<string, string> = {
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
};

const historicalStatusLabel = (status: string) => ({
  pending: "En attente de transition",
  resolved: "Résolue",
}[status] ?? (statusLabels[status] ?? status));

export function PartnerIntroductionsAdminCockpit() {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<Summary[]>([]);
  const [view, setView] = useState<"current" | "history">("current");
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const loadedItems: Summary[] = [];
      let page = 1;
      let total = 0;
      let workflowEnabled = false;
      do {
        const response = await fetch(
          `/api/admin/partner-introductions?page=${page}&limit=100`,
          { credentials: "include", cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Impossible de charger les mises en relation.");
        }
        workflowEnabled = payload.workflowEnabled === true;
        const pageItems = Array.isArray(payload.items) ? payload.items as Summary[] : [];
        loadedItems.push(...pageItems);
        total = Number(payload.total ?? loadedItems.length);
        if (pageItems.length === 0) total = loadedItems.length;
        page += 1;
      } while (loadedItems.length < total);
      if (active) {
        setError("");
        setEnabled(workflowEnabled);
        setItems(loadedItems);
      }
    })().catch((reason: unknown) => {
      if (active) {
        console.error("[partner_introductions_admin] Chargement impossible.", reason);
        setItems([]);
        setError("Impossible de charger les mises en relation.");
      }
    });
    return () => { active = false; };
  }, [loadAttempt]);

  if (!enabled && !error) return null;

  const currentItems = items.filter((item) =>
    !item.historical
    && (
      item.status === "awaiting_athlete"
      || item.reported
      || item.moderationStatus === "suspended"
    ));
  const historicalItems = items.filter((item) =>
    item.historical
    || (
      !item.reported
      && item.moderationStatus !== "suspended"
      && (item.status === "accepted" || item.status === "declined")
    ));
  const visibleItems = view === "current" ? currentItems : historicalItems;

  return (
    <TodayCollapsibleCard
      storageKey="partner-introductions"
      title="Supervision des mises en relation"
      description="Suivi uniquement : l’athlète reste seul décisionnaire."
      attentionCount={currentItems.length + (error ? 1 : 0)}
      className="partner-introductions-cockpit"
    >
      {error ? (
        <div className="introduction-load-error">
          <p className="introduction-feedback is-error" role="alert">{error}</p>
          <Button
            type="button"
            className="introduction-button is-secondary is-compact"
            onClick={() => setLoadAttempt((value) => value + 1)}
          >
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          <div className="today-view-switch" aria-label="Vue des mises en relation">
            <button type="button" aria-pressed={view === "current"} onClick={() => setView("current")}>
              À traiter ({currentItems.length})
            </button>
            <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>
              Historique ({historicalItems.length})
            </button>
          </div>
          {visibleItems.length === 0 ? (
            <p className="introduction-empty">
              {view === "current" ? "Aucune demande à traiter." : "Aucune demande dans l’historique."}
            </p>
          ) : null}
          {visibleItems.length > 0 ? (
            <ul className="introduction-admin-list">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <div className="introduction-admin-participants">
                    <span>Partenaire</span>
                    <strong>{item.partnerPublicName || "Partenaire non identifié"}</strong>
                    <span>Athlète</span>
                    <strong>{item.athletePublicName || "Athlète non identifié"}</strong>
                  </div>
                  <div className="introduction-admin-main">
                    <strong>{item.reason || "Motif non renseigné"}</strong>
                    <small>
                      {item.historical ? "Demande historique" : `Créée il y a ${item.ageDays} jour${item.ageDays === 1 ? "" : "s"}`}
                      {item.stale ? " · Sans réponse" : ""}
                      {item.reported ? " · Signalée" : ""}
                    </small>
                  </div>
                  <div className="introduction-admin-status">
                    <Badge className={`introduction-status-badge is-${item.status}`}>
                      {item.historical
                        ? historicalStatusLabel(item.status)
                        : statusLabels[item.status] ?? item.status}
                    </Badge>
                    {item.moderationStatus === "suspended" ? (
                      <Badge className="introduction-status-badge is-suspended">Suspendue</Badge>
                    ) : null}
                  </div>
                  <div className="introduction-admin-end">
                    <time dateTime={item.createdAt}>{new Intl.DateTimeFormat("fr-CH").format(new Date(item.createdAt))}</time>
                    <Link className="introduction-link-button" href={`/today/partner-introductions/${encodeURIComponent(item.id)}`}>
                      Voir le détail
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </TodayCollapsibleCard>
  );
}
