"use client";

import { useEffect, useState } from "react";

type ContactRequestStatus = "open" | "pending" | "in_progress" | "resolved";

type PartnerContactRequest = {
  id: string;
  athleteId: string;
  athleteName: string;
  subject: string;
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
    <section className="partner-portal partner-contact-requests">
      <header className="partner-portal-hero">
        <p>Suivi</p>
        <h1>Mes mises en relation</h1>
      </header>

      {loading ? <section className="partner-portal-state">Chargement de vos demandes…</section> : null}
      {!loading && error ? <section className="partner-portal-state" role="alert">{error}</section> : null}
      {!loading && !error && requests.length === 0 ? (
        <section className="partner-portal-state">Vous n’avez encore aucune demande de mise en relation.</section>
      ) : null}

      {!loading && !error && requests.length > 0 ? (
        <ul className="partner-contact-requests-list" aria-label="Mes demandes de mise en relation">
          {requests.map((request) => {
            const visibleReply = request.response?.trim() || request.note?.trim() || "";
            return (
              <li key={request.id}>
                <article>
                  <header>
                    <div>
                      <span>Athlète</span>
                      <h2>{request.athleteName}</h2>
                    </div>
                    <span className={`partner-contact-request-status is-${request.status}`}>
                      {statusLabels[request.status] ?? request.status}
                    </span>
                  </header>
                  <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
                  {request.subject ? <section><h3>Motif</h3><p>{request.subject}</p></section> : null}
                  {request.message ? <section><h3>Message</h3><p>{request.message}</p></section> : null}
                  {visibleReply ? <section className="partner-contact-request-reply"><h3>Réponse</h3><p>{visibleReply}</p></section> : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}