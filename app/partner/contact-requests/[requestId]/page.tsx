"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Detail = {
  id: string;
  athletePublicName: string;
  reason: string;
  message: string;
  status: string;
  moderationStatus: string;
  createdAt: string;
  authorizedContact?: { channel: "instagram"; value: string; consentedAt: string };
};

const statusLabel = (status: string) => ({
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
}[status] ?? status);

export default function PartnerContactRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/partner/contact-requests/${encodeURIComponent(requestId)}`, {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de charger cette demande.");
      if (active) setDetail(payload.contactRequest);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Impossible de charger cette demande.");
    });
    return () => { active = false; };
  }, [requestId]);

  return (
    <section className="partner-portal partner-contact-requests">
      <Link href="/partner/contact-requests">Retour aux mises en relation</Link>
      {error ? <section className="partner-portal-state" role="alert">{error}</section> : null}
      {!error && !detail ? <section className="partner-portal-state">Chargement…</section> : null}
      {detail ? (
        <article className="partner-portal-state">
          <h1>{detail.athletePublicName || "Athlète KLIQUE"}</h1>
          <p><strong>Statut :</strong> {statusLabel(detail.status)}</p>
          <p><strong>Motif :</strong> {detail.reason}</p>
          {detail.message ? <p><strong>Message :</strong> {detail.message}</p> : null}
          {detail.authorizedContact ? (
            <section>
              <h2>Contact autorisé</h2>
              <a
                href={`https://instagram.com/${detail.authorizedContact.value.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                Instagram {detail.authorizedContact.value}
              </a>
            </section>
          ) : null}
          {detail.status === "accepted" && !detail.authorizedContact ? (
            <p>Le contact n’est pas accessible, notamment si la demande est suspendue.</p>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
