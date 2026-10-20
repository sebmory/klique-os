"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    <article style={{ border: "1px solid #2a2d34", borderRadius: "18px", padding: "1rem", color: "#f8fafc" }}>
      <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Demandes de mise en relation</h2>
      {error ? <p role="alert">{error}</p> : null}
      {!error && requests.length === 0 ? <p style={{ color: "#9ca3af" }}>Aucune nouvelle demande.</p> : null}
      {requests.length > 0 ? (
        <ul style={{ display: "grid", gap: "0.75rem", listStyle: "none", padding: 0 }}>
          {requests.map((request) => (
            <li key={request.id} style={{ borderTop: "1px solid #2a2d34", paddingTop: "0.75rem" }}>
              <strong>{request.partnerPublicName || "Partenaire KLIQUE"}</strong>
              <p>{request.reason || "Mise en relation"}</p>
              <Link href={`/athlete/partner-contact-requests/${encodeURIComponent(request.id)}`}>
                Voir et répondre
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
