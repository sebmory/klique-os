"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Checkbox, Input, Textarea } from "@/src/design-system/components";

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

const statusLabel = (status: string) => ({
  awaiting_athlete: "Réponse attendue",
  accepted: "Acceptée",
  declined: "Refusée",
}[status] ?? status);

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
    <section className="introduction-page introduction-detail-page">
      <Link className="introduction-back-link" href="/athlete">← Retour à l’accueil</Link>
      {error ? <p className="introduction-feedback is-error" role="alert">{error}</p> : null}
      {success ? <p className="introduction-feedback is-success" role="status">{success}</p> : null}
      {!detail && !error ? <p className="introduction-feedback is-loading">Chargement…</p> : null}
      {detail ? (
        <>
          <Card className="introduction-detail-card">
            <header className="introduction-detail-header">
              <div>
                <p className="introduction-eyebrow">Demande de</p>
                <h1>{detail.partnerPublicName || "Partenaire KLIQUE"}</h1>
              </div>
              <Badge className={`introduction-status-badge is-${detail.status}`}>{statusLabel(detail.status)}</Badge>
            </header>
            <div className="introduction-detail-grid">
              <section className="introduction-content-block">
                <h2>Motif</h2>
                <p>{detail.reason || "Mise en relation"}</p>
              </section>
              {detail.message ? <section className="introduction-content-block"><h2>Message</h2><p>{detail.message}</p></section> : null}
            </div>
            <footer className="introduction-detail-meta">
              <span>Reçue le {new Date(detail.createdAt).toLocaleDateString("fr-CH")}</span>
            </footer>
          </Card>

          {detail.status === "awaiting_athlete" ? (
            <Card className="introduction-action-card">
              <header>
                <div>
                  <p className="introduction-eyebrow">Prochaine action</p>
                  <h2>Répondre à la demande</h2>
                </div>
                <p>Ton contact n’est transmis qu’après une confirmation explicite.</p>
              </header>
              {!contact ? (
                <Button className="introduction-button is-secondary" type="button" onClick={() => void prepareContact().catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : "Instagram indisponible.");
                })}>
                  Vérifier le compte Instagram à partager
                </Button>
              ) : (
                <label className="introduction-confirmation">
                  <Checkbox
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>J’autorise le partage de <strong>{contact.displayValue}</strong> avec ce partenaire.</span>
                </label>
              )}
              {!contact ? (
                <p className="introduction-help">Si Instagram est absent ou invalide, complète ton <Link href="/athlete/profile">profil</Link>. Tu peux toujours refuser.</p>
              ) : null}
              <div className="introduction-actions">
                <Button className="introduction-button is-primary" type="button" disabled={submitting || !contact || !confirmed} onClick={() => void respond("accept")}>
                  {submitting ? "Enregistrement…" : "Accepter et partager"}
                </Button>
                <Button className="introduction-button is-secondary" type="button" disabled={submitting} onClick={() => void respond("decline")}>
                  Refuser
                </Button>
              </div>
            </Card>
          ) : <p className="introduction-feedback">Cette demande a déjà reçu une réponse.</p>}

          <details className="introduction-disclosure">
            <summary>Signaler cette demande</summary>
            <div>
              {reportSuccess ? <p className="introduction-feedback is-success" role="status">{reportSuccess}</p> : null}
              <label className="introduction-field">
                <span>Motif</span>
                <Input value={reportReason} onChange={(event) => setReportReason(event.target.value)} />
              </label>
              <label className="introduction-field">
                <span>Commentaire facultatif</span>
                <Textarea value={reportComment} onChange={(event) => setReportComment(event.target.value)} rows={4} />
              </label>
              <Button className="introduction-button is-danger" type="button" disabled={!reportReason.trim()} onClick={() => {
                void reportRequest().catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : "Signalement impossible.");
                });
              }}>
                Envoyer le signalement
              </Button>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
