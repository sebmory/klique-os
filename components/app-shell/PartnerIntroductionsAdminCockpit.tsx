"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/src/design-system/components";

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

type Filters = {
  status: string;
  moderationStatus: string;
  stale: boolean;
  reported: boolean;
  historical: boolean;
};

const initialFilters: Filters = {
  status: "",
  moderationStatus: "",
  stale: false,
  reported: false,
  historical: false,
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
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "10" });
    if (filters.status) params.set("status", filters.status);
    if (filters.moderationStatus) params.set("moderationStatus", filters.moderationStatus);
    if (filters.stale) params.set("stale", "true");
    if (filters.reported) params.set("reported", "true");
    if (filters.historical) params.set("historical", "true");
    return params.toString();
  }, [filters, page]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/admin/partner-introductions?${query}`, {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de charger les mises en relation.");
      if (active) {
        setError("");
        setEnabled(payload.workflowEnabled === true);
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setCounters(payload.counters ?? {});
        setTotal(Number(payload.total ?? 0));
      }
    }).catch((reason: unknown) => {
      if (active) {
        console.error("[partner_introductions_admin] Chargement impossible.", reason);
        setItems([]);
        setCounters({});
        setTotal(0);
        setError("Impossible de charger les mises en relation.");
      }
    });
    return () => { active = false; };
  }, [loadAttempt, query]);

  if (!enabled && !error) return null;

  const applyCounterFilter = (key: string) => {
    setPage(1);
    setFilters({
      status: ["awaiting", "accepted", "declined"].includes(key)
        ? (key === "awaiting" ? "awaiting_athlete" : key)
        : "",
      moderationStatus: key === "suspended" ? "suspended" : "",
      stale: key === "stale",
      reported: key === "reported",
      historical: key === "historical",
    });
  };

  return (
    <Card className="workspace-dashboard-card partner-introductions-cockpit">
      <header className="dashboard-card-head introduction-cockpit-head">
        <div>
          <h2>Supervision des mises en relation</h2>
          <p>Suivi uniquement : l’athlète reste seul décisionnaire.</p>
        </div>
        {!error ? (
          <Button type="button" className="introduction-button is-ghost is-compact" onClick={() => {
            setFilters(initialFilters);
            setPage(1);
          }}>
            Tous
          </Button>
        ) : null}
      </header>
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
          <div className="introduction-counters" aria-label="Filtres des mises en relation">
            {[
              ["awaiting", "En attente"],
              ["accepted", "Acceptées"],
              ["declined", "Refusées"],
              ["stale", "Sans réponse prolongée"],
              ["historical", "Historiques"],
              ["reported", "Signalées"],
              ["suspended", "Suspendues"],
            ].map(([key, label]) => (
              <Button key={key} type="button" className="introduction-counter" onClick={() => applyCounterFilter(key)}>
                <span>{label}</span>
                <strong>{counters[key] ?? 0}</strong>
              </Button>
            ))}
          </div>
          {items.length === 0 ? <p className="introduction-empty">Aucune demande pour ce filtre.</p> : null}
          {items.length > 0 ? (
            <ul className="introduction-admin-list">
              {items.map((item) => (
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
          {total > 10 ? (
            <div className="introduction-pagination">
              <Button className="introduction-button is-secondary is-compact" type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Précédent
              </Button>
              <span>Page {page} / {Math.ceil(total / 10)}</span>
              <Button className="introduction-button is-secondary is-compact" type="button" disabled={page * 10 >= total} onClick={() => setPage((value) => value + 1)}>
                Suivant
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
