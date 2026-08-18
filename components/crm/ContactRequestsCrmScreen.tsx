"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import type { Athlete, AthletesResponse } from "@/types/athlete";

type ContactRequestStatus = "open" | "in_progress" | "resolved";

type ContactRequest = {
  id: string;
  athleteId: string;
  category: string;
  subject: string;
  message: string;
  status: ContactRequestStatus;
  createdAt: string;
};

type ContactRequestsResponse = {
  contactRequests?: ContactRequest[];
  error?: string;
};

type StatusFilter = "all" | ContactRequestStatus;

const categoryLabels: Record<string, string> = {
  content_photo: "Photo et contenu",
  support: "Accompagnement KLIQUE",
  partner_benefit: "Avantage partenaire",
  technical: "Problème technique",
  other: "Autre demande",
};

const statusLabels: Record<ContactRequestStatus, string> = {
  open: "Nouvelle",
  in_progress: "En cours",
  resolved: "Traitée",
};

const statusBadgeModifier: Record<ContactRequestStatus, string> = {
  open: "is-prospect",
  in_progress: "is-actif",
  resolved: "is-inactif",
};

const filters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "open", label: "Nouvelles" },
  { value: "in_progress", label: "En cours" },
  { value: "resolved", label: "Traitées" },
];

const statusOptions: ContactRequestStatus[] = ["open", "in_progress", "resolved"];

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDate = (value: string): string => {
  if (!value) return "Date inconnue";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date inconnue";
  return dateFormatter.format(parsed);
};

const parseDateRank = (value: string): number => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

export function ContactRequestsCrmScreen() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      setUpdateError(null);

      try {
        const [requestsResponse, athletesResponse] = await Promise.all([
          fetch("/api/contact-requests", { credentials: "include", cache: "no-store" }),
          fetch("/api/athletes", { credentials: "include", cache: "no-store" }),
        ]);

        const requestsPayload = (await requestsResponse.json().catch(() => null)) as ContactRequestsResponse | null;

        if (!requestsResponse.ok) {
          throw new Error(requestsPayload?.error || "Impossible de charger les demandes.");
        }

        let names: Record<string, string> = {};
        if (athletesResponse.ok) {
          const athletesPayload = (await athletesResponse.json().catch(() => null)) as AthletesResponse | null;
          const athletes: Athlete[] = athletesPayload?.athletes ?? [];
          names = athletes.reduce<Record<string, string>>((accumulator, athlete) => {
            if (athlete.key && athlete.name) {
              accumulator[athlete.key] = athlete.name;
            }
            return accumulator;
          }, {});
        }

        if (!active) return;

        setRequests(requestsPayload?.contactRequests ?? []);
        setAthleteNames(names);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les demandes.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [retryToken]);

  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => parseDateRank(b.createdAt) - parseDateRank(a.createdAt)),
    [requests],
  );

  const visibleRequests = useMemo(
    () => (statusFilter === "all" ? sortedRequests : sortedRequests.filter((request) => request.status === statusFilter)),
    [sortedRequests, statusFilter],
  );

  const resolveAthleteLabel = useCallback(
    (athleteId: string) => athleteNames[athleteId] || athleteId || "Athlète inconnu",
    [athleteNames],
  );

  const handleStatusChange = async (requestId: string, nextStatus: ContactRequestStatus) => {
    setUpdatingId(requestId);
    setUpdateError(null);

    try {
      const response = await fetch("/api/contact-requests", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, status: nextStatus }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { contactRequest?: ContactRequest; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Le statut n’a pas pu être mis à jour.");
      }

      const updatedStatus = payload?.contactRequest?.status ?? nextStatus;
      setRequests((current) =>
        current.map((request) => (request.id === requestId ? { ...request, status: updatedStatus } : request)),
      );
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "Le statut n’a pas pu être mis à jour.");
    } finally {
      setUpdatingId(null);
    }
  };

  const isEmpty = !loading && !errorMessage && visibleRequests.length === 0;

  return (
    <section className="crm-people-screen">
      <header className="crm-people-header">
        <div style={{ textAlign: "center", width: "100%" }}>
          <h1>Demandes KLIQUE</h1>
          <p>Suivez les demandes envoyées par les athlètes et mettez à jour leur statut.</p>
        </div>
      </header>

      <section className="crm-actions-bar" aria-label="Filtres des demandes">
        <div className="crm-filter-scroller" role="group" aria-label="Filtrer par statut">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={statusFilter === filter.value ? "crm-filter-chip is-active" : "crm-filter-chip"}
              onClick={() => setStatusFilter(filter.value)}
              aria-pressed={statusFilter === filter.value}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {updateError ? (
        <p className="crm-requests-inline-error" role="alert">
          {updateError}
        </p>
      ) : null}

      {loading ? (
        <section className="crm-skeleton-shell" aria-live="polite" aria-busy="true">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement des demandes...</span>
        </section>
      ) : null}

      {!loading && errorMessage ? (
        <section className="crm-error-state" aria-live="assertive">
          <h2>Impossible de charger les demandes</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={() => setRetryToken((value) => value + 1)}>
            Reessayer
          </button>
        </section>
      ) : null}

      {isEmpty ? (
        <section className="crm-empty-state" aria-live="polite">
          <div className="crm-empty-icon" aria-hidden>
            <Inbox size={20} />
          </div>
          <h2>Aucune demande pour ce filtre</h2>
          <p>Les demandes envoyées par les athlètes depuis leur espace apparaitront ici.</p>
        </section>
      ) : null}

      {!loading && !errorMessage && visibleRequests.length > 0 ? (
        <>
          <section className="crm-list-shell">
            <div className="crm-requests-head" role="row">
              <span>Athlète</span>
              <span>Catégorie</span>
              <span>Demande</span>
              <span>Date</span>
              <span>Statut</span>
              <span>Changer le statut</span>
            </div>

            <ul className="crm-list-body">
              {visibleRequests.map((request) => (
                <li key={request.id}>
                  <div className="crm-requests-row">
                    <span>
                      <strong>{resolveAthleteLabel(request.athleteId)}</strong>
                    </span>
                    <span>{categoryLabels[request.category] ?? request.category}</span>
                    <span className="crm-requests-message-cell">
                      <strong>{request.subject}</strong>
                      <small>{request.message}</small>
                    </span>
                    <span>{formatDate(request.createdAt)}</span>
                    <span>
                      <small className={`crm-status-badge ${statusBadgeModifier[request.status]}`}>
                        {statusLabels[request.status]}
                      </small>
                    </span>
                    <span>
                      <label className="crm-select-wrap">
                        <span className="crm-requests-select-label">Statut</span>
                        <select
                          value={request.status}
                          disabled={updatingId === request.id}
                          onChange={(event) =>
                            handleStatusChange(request.id, event.target.value as ContactRequestStatus)
                          }
                          aria-label={`Modifier le statut de la demande ${request.subject}`}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="crm-cards-grid desktop-hidden-by-mode">
            {visibleRequests.map((request) => (
              <article key={request.id} className="crm-person-card">
                <header>
                  <div>
                    <h3>{resolveAthleteLabel(request.athleteId)}</h3>
                    <p>{categoryLabels[request.category] ?? request.category}</p>
                  </div>
                </header>

                <dl>
                  <div>
                    <dt>Sujet</dt>
                    <dd>{request.subject}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{formatDate(request.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Statut</dt>
                    <dd>
                      <small className={`crm-status-badge ${statusBadgeModifier[request.status]}`}>
                        {statusLabels[request.status]}
                      </small>
                    </dd>
                  </div>
                </dl>

                <p className="crm-requests-card-message">{request.message}</p>

                <footer>
                  <label className="crm-select-wrap">
                    <span>Statut</span>
                    <select
                      value={request.status}
                      disabled={updatingId === request.id}
                      onChange={(event) => handleStatusChange(request.id, event.target.value as ContactRequestStatus)}
                      aria-label={`Modifier le statut de la demande ${request.subject}`}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </footer>
              </article>
            ))}
          </section>
        </>
      ) : null}

      <style>{`
        .crm-requests-head,
        .crm-requests-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1.6fr) 150px 110px 150px;
          gap: 10px;
          align-items: center;
        }

        .crm-requests-head {
          height: 52px;
          padding: 0 18px;
          border-bottom: 1px solid #f1f1f1;
          color: #818181;
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .crm-requests-row {
          width: 100%;
          min-height: 74px;
          border-radius: 14px;
          background: #ffffff;
          padding: 12px 10px;
          color: inherit;
          font-size: 0.86rem;
        }

        .crm-requests-message-cell {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .crm-requests-message-cell small {
          color: #7b7b7b;
          font-size: 0.8rem;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .crm-requests-select-label {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }

        .crm-requests-card-message {
          margin: 0;
          color: #4b4b4b;
          font-size: 0.86rem;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .crm-requests-inline-error {
          margin: 0;
          border: 1px solid #f0c2c2;
          border-radius: 14px;
          background: #fdecec;
          color: #a12727;
          padding: 12px 14px;
          font-size: 0.86rem;
        }
      `}</style>
    </section>
  );
}
