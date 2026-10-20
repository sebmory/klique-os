"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/src/design-system/components";

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
};

const initialFilters: Filters = { status: "", moderationStatus: "", stale: false, reported: false };

const statusLabels: Record<string, string> = {
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
};

const historicalStatusLabel = (status: string) => ({
  pending: "Ancienne demande — en attente de transition",
  resolved: "Ancienne demande — résolue",
}[status] ?? `Ancienne demande — ${statusLabels[status] ?? status}`);

export function PartnerIntroductionsAdminCockpit() {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<Summary[]>([]);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "10" });
    if (filters.status) params.set("status", filters.status);
    if (filters.moderationStatus) params.set("moderationStatus", filters.moderationStatus);
    if (filters.stale) params.set("stale", "true");
    if (filters.reported) params.set("reported", "true");
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
      if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible.");
    });
    return () => { active = false; };
  }, [query]);

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
    });
  };

  return (
    <Card className="workspace-dashboard-card card-priorities">
      <header className="dashboard-card-head">
        <div>
          <h2>Supervision des mises en relation</h2>
          <p>Suivi uniquement : l’athlète reste seul décisionnaire.</p>
        </div>
        <button type="button" className="card-link-button" onClick={() => {
          setFilters(initialFilters);
          setPage(1);
        }}>
          Tous
        </button>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        {[
          ["awaiting", "En attente"],
          ["accepted", "Acceptées"],
          ["declined", "Refusées"],
          ["stale", "Anciennes"],
          ["reported", "Signalées"],
          ["suspended", "Suspendues"],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => applyCounterFilter(key)}>
            {label} : {counters[key] ?? 0}
          </button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {!error && items.length === 0 ? <p>Aucune demande pour ce filtre.</p> : null}
      {items.length > 0 ? (
        <ul className="priority-list">
          {items.map((item) => (
            <li key={item.id} className="priority-item">
              <div className="priority-main">
                <strong>
                  {item.partnerPublicName || "Partenaire KLIQUE"} → {item.athletePublicName || "Athlète KLIQUE"}
                </strong>
                <span>{item.reason || "Motif non renseigné"}</span>
                <small>
                  {item.historical
                    ? historicalStatusLabel(item.status)
                    : statusLabels[item.status] ?? item.status}
                  {" · "}Modération : {item.moderationStatus === "suspended" ? "Suspendue" : "Active"}
                  {" · "}{item.ageDays} jour{item.ageDays === 1 ? "" : "s"}
                  {item.stale ? " · Sans réponse ancienne" : ""}
                  {item.reported ? " · Signalée" : ""}
                </small>
              </div>
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat("fr-CH").format(new Date(item.createdAt))}
              </time>
              <Link className="card-link-button" href={`/today/partner-introductions/${encodeURIComponent(item.id)}`}>
                Détail
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {total > 10 ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Précédent
          </button>
          <span>Page {page} / {Math.ceil(total / 10)}</span>
          <button type="button" disabled={page * 10 >= total} onClick={() => setPage((value) => value + 1)}>
            Suivant
          </button>
        </div>
      ) : null}
    </Card>
  );
}
