"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Card } from "@/src/design-system/components";

type Detail = {
  id: string;
  athletePublicName: string;
  historical: boolean;
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

const historicalStatusLabel = (status: string) => ({
  pending: "En attente de transition",
  resolved: "Résolue",
}[status] ?? statusLabel(status));

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
    <section className="introduction-page introduction-detail-page">
      <Link className="introduction-back-link" href="/partner/contact-requests">← Retour aux mises en relation</Link>
      {error ? <section className="introduction-feedback is-error" role="alert">{error}</section> : null}
      {!error && !detail ? <section className="introduction-feedback is-loading">Chargement…</section> : null}
      {detail ? (
        <Card className="introduction-detail-card">
          <header className="introduction-detail-header">
            <div>
              <p className="introduction-eyebrow">Mise en relation avec</p>
              <h1>{detail.athletePublicName || "Athlète KLIQUE"}</h1>
              {detail.historical ? <small>Demande historique</small> : null}
            </div>
            <Badge className={`introduction-status-badge is-${detail.status}`}>
              {detail.historical ? historicalStatusLabel(detail.status) : statusLabel(detail.status)}
            </Badge>
          </header>
          <section className="introduction-content-block">
            <h2>Motif</h2>
            <p>{detail.reason}</p>
          </section>
          {detail.message ? <section className="introduction-content-block"><h2>Message</h2><p>{detail.message}</p></section> : null}
          {detail.authorizedContact ? (
            <section className="introduction-contact-card">
              <h2>Contact autorisé</h2>
              <p>L’athlète a confirmé le partage de ce compte.</p>
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
            <p className="introduction-feedback">Le contact n’est pas accessible, notamment si la demande est suspendue.</p>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
