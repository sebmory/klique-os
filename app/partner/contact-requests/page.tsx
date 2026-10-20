"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/src/design-system/components";

type ContactRequestStatus =
  | "open"
  | "pending"
  | "in_progress"
  | "resolved"
  | "awaiting_athlete"
  | "accepted"
  | "declined";

type PartnerContactRequest = {
  id: string;
  athleteId: string;
  athleteName: string;
  athletePublicName?: string;
  historical?: boolean;
  subject: string;
  reason?: string;
  message: string;
  status: ContactRequestStatus;
  createdAt: string;
  response?: string;
  note?: string;
};

const statusLabels: Record<ContactRequestStatus, string> = {
  open: "Nouvelle",
  pending: "En attente",
  in_progress: "En cours",
  resolved: "Traitée",
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
};

const historicalStatusLabels: Partial<Record<ContactRequestStatus, string>> = {
  pending: "En attente de transition",
  resolved: "Résolue",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : dateFormatter.format(date);
};

export default function PartnerContactRequestsPage() {
  const [requests, setRequests] = useState<PartnerContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workflowEnabled, setWorkflowEnabled] = useState(false);

  useEffect(() => {
    let active = true;

    const loadRequests = async () => {
      try {
        const response = await fetch("/api/partner/contact-requests", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Impossible de charger vos mises en relation.");
        }
        if (active) {
          setRequests(Array.isArray(payload.contactRequests) ? payload.contactRequests : []);
          setWorkflowEnabled(payload.workflowEnabled === true);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Impossible de charger vos mises en relation.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadRequests();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="introduction-page introduction-list-page">
      <header className="introduction-page-header">
        <div>
          <p className="introduction-eyebrow">Suivi</p>
          <h1>Mes mises en relation</h1>
          <p>Retrouvez vos demandes, leur statut et les prochaines étapes.</p>
        </div>
      </header>

      {loading ? <section className="introduction-feedback is-loading">Chargement de vos demandes…</section> : null}
      {!loading && error ? <section className="introduction-feedback is-error" role="alert">{error}</section> : null}
      {!loading && !error && requests.length === 0 ? (
        <section className="introduction-empty">Vous n’avez encore aucune demande de mise en relation.</section>
      ) : null}

      {!loading && !error && requests.length > 0 ? (
        <ul className="partner-contact-requests-list" aria-label="Mes demandes de mise en relation">
          {requests.map((request) => {
            const visibleReply = request.response?.trim() || request.note?.trim() || "";
            return (
              <li key={request.id}>
                <Card className="introduction-list-card">
                  <header className="introduction-list-card-head">
                    <div>
                      <span className="introduction-eyebrow">Athlète</span>
                      <h2>{request.athletePublicName || request.athleteName || "Athlète KLIQUE"}</h2>
                    </div>
                    <Badge className={`introduction-status-badge is-${request.status}`}>
                      {request.historical
                        ? historicalStatusLabels[request.status] ?? statusLabels[request.status] ?? request.status
                        : statusLabels[request.status] ?? request.status}
                    </Badge>
                  </header>
                  <div className="introduction-list-card-body">
                    {request.reason || request.subject ? <section><h3>Motif</h3><p>{request.reason || request.subject}</p></section> : null}
                    {request.message ? <section><h3>Message</h3><p>{request.message}</p></section> : null}
                  </div>
                  {visibleReply ? <section className="partner-contact-request-reply"><h3>Réponse</h3><p>{visibleReply}</p></section> : null}
                  <footer className="introduction-list-card-footer">
                    <div>
                      <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
                      {request.historical ? <small>Demande historique</small> : null}
                    </div>
                    {workflowEnabled ? (
                      <Link className="introduction-link-button" href={`/partner/contact-requests/${encodeURIComponent(request.id)}`}>
                        Voir le détail
                      </Link>
                    ) : null}
                  </footer>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}