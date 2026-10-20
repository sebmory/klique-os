"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card } from "@/src/design-system/components";

type Introduction = {
  id: string;
  partnerPublicName: string;
  reason?: string;
  message?: string;
  status: string;
  createdAt: string;
};

export function PartnerIntroductionRequests() {
  const [requests, setRequests] = useState<Introduction[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/athlete/partner-contact-requests", {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de charger les demandes.");
      if (active) {
        setEnabled(payload.workflowEnabled === true);
        setRequests(
          Array.isArray(payload.contactRequests)
            ? payload.contactRequests.filter((request: Introduction) => request.status === "awaiting_athlete")
            : [],
        );
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Impossible de charger les demandes.");
    });
    return () => { active = false; };
  }, []);

  if (!enabled && !error) return null;

  return (
    <Card className="athlete-introduction-card">
      <header>
        <div>
          <span>Nouveau</span>
          <h2>Demandes de mise en relation</h2>
        </div>
        {requests.length > 0 ? <Badge>{requests.length}</Badge> : null}
      </header>
      {error ? <p className="introduction-feedback is-error" role="alert">{error}</p> : null}
      {!error && requests.length === 0 ? <p className="athlete-introduction-empty">Aucune nouvelle demande.</p> : null}
      {requests.length > 0 ? (
        <ul>
          {requests.map((request) => (
            <li key={request.id}>
              <div>
                <strong>{request.partnerPublicName || "Partenaire KLIQUE"}</strong>
                <p>{request.reason || "Mise en relation"}</p>
              </div>
              <Link className="introduction-link-button is-dark" href={`/athlete/partner-contact-requests/${encodeURIComponent(request.id)}`}>
                Voir et répondre
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
