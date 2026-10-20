"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Detail = {
  id: string;
  partnerPublicName: string;
  reason?: string;
  message?: string;
  status: string;
  createdAt: string;
};

type ContactPresentation = {
  channel: "instagram";
  displayValue: string;
  contactReference: string;
};

export default function AthletePartnerContactRequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [contact, setContact] = useState<ContactPresentation | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");
  const responseKey = useRef("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/athlete/partner-contact-requests/${encodeURIComponent(requestId)}`, {
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

  const prepareContact = async () => {
    setError("");
    const response = await fetch(
      `/api/athlete/partner-contact-requests/${encodeURIComponent(requestId)}/contact`,
      { credentials: "include", cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Aucun compte Instagram valide n’est disponible.");
    setContact(payload.contact);
    setConfirmed(false);
  };

  const respond = async (decision: "accept" | "decline") => {
    setSubmitting(true);
    setError("");
    try {
      if (decision === "accept" && (!contact || !confirmed)) {
        throw new Error("Confirme le partage du compte Instagram affiché.");
      }
      if (!responseKey.current) responseKey.current = crypto.randomUUID();
      const response = await fetch(
        `/api/athlete/partner-contact-requests/${encodeURIComponent(requestId)}/response`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": responseKey.current,
          },
          body: JSON.stringify({
            decision,
            confirmedContact: decision === "accept" ? contact?.displayValue : null,
            contactReference: decision === "accept" ? contact?.contactReference : null,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’enregistrer ta réponse.");
      setDetail(payload.contactRequest);
      setSuccess(decision === "accept" ? "Mise en relation acceptée." : "Demande refusée.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d’enregistrer ta réponse.");
    } finally {
      setSubmitting(false);
    }
  };

  const reportRequest = async () => {
    setError("");
    const response = await fetch(
      `/api/athlete/partner-contact-requests/${encodeURIComponent(requestId)}/report`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ reason: reportReason, comment: reportComment }),
      },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Signalement impossible.");
    setReportReason("");
    setReportComment("");
    setReportSuccess("Ton signalement a été transmis à KLIQUE.");
  };

  return (
    <section style={{ maxWidth: "760px", margin: "0 auto", padding: "1.5rem", display: "grid", gap: "1rem" }}>
      <Link href="/athlete">Retour à l’accueil</Link>
      {error ? <p role="alert">{error}</p> : null}
      {success ? <p role="status">{success}</p> : null}
      {!detail && !error ? <p>Chargement…</p> : null}
      {detail ? (
        <article>
          <h1>{detail.partnerPublicName || "Partenaire KLIQUE"}</h1>
          <p><strong>Motif :</strong> {detail.reason || "Mise en relation"}</p>
          {detail.message ? <p><strong>Message :</strong> {detail.message}</p> : null}
          {detail.status === "awaiting_athlete" ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {!contact ? (
                <button type="button" onClick={() => void prepareContact().catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : "Instagram indisponible.");
                })}>
                  Préparer mon contact Instagram
                </button>
              ) : (
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />{" "}
                  J’autorise le partage de {contact.displayValue} avec ce partenaire.
                </label>
              )}
              {!contact ? (
                <p>Si Instagram est absent ou invalide, complète ton <Link href="/athlete/profile">profil</Link>. Tu peux toujours refuser.</p>
              ) : null}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button type="button" disabled={submitting || !contact || !confirmed} onClick={() => void respond("accept")}>
                  Accepter
                </button>
                <button type="button" disabled={submitting} onClick={() => void respond("decline")}>
                  Refuser
                </button>
              </div>
            </div>
          ) : <p>Cette demande a déjà reçu une réponse.</p>}
          <section>
            <h2>Signaler cette demande</h2>
            {reportSuccess ? <p role="status">{reportSuccess}</p> : null}
            <label>
              Motif
              <input value={reportReason} onChange={(event) => setReportReason(event.target.value)} />
            </label>
            <label>
              Commentaire facultatif
              <textarea value={reportComment} onChange={(event) => setReportComment(event.target.value)} />
            </label>
            <button type="button" disabled={!reportReason.trim()} onClick={() => {
              void reportRequest().catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : "Signalement impossible.");
              });
            }}>
              Envoyer le signalement
            </button>
          </section>
        </article>
      ) : null}
    </section>
  );
}
