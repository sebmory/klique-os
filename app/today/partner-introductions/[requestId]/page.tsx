"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Checkbox, Textarea } from "@/src/design-system/components";

type Detail = {
  id: string;
  partnerId: string;
  partnerPublicName: string;
  athletePublicName: string;
  historical: boolean;
  reason: string;
  message: string;
  status: string;
  moderationStatus: string;
  createdAt: string;
  respondedAt: string | null;
  ageDays: number;
  solicitationAllowed: boolean;
  events: Array<{
    id: string;
    eventType: string;
    actorRole: string;
    requestStatus: string;
    moderationStatus: string;
    occurredAt: string;
  }>;
  reports: Array<{
    id: string;
    reason: string;
    comment: string;
    status: string;
    reportedAt: string;
    handlingNote: string;
  }>;
  solicitationEvents: Array<{
    id: string;
    canSolicit: boolean;
    reason: string;
    occurredAt: string;
  }>;
};

const historicalStatusLabel = (status: string) => ({
  pending: "En attente de transition",
  resolved: "Résolue",
}[status] ?? status);

const statusLabel = (status: string) => ({
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
}[status] ?? status);

export default function AdminPartnerIntroductionDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const actionKey = useRef("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/partner-introductions/${encodeURIComponent(requestId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Chargement impossible.");
    return payload.contactRequest as Detail;
  }, [requestId]);

  useEffect(() => {
    let active = true;
    void load()
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Chargement impossible.");
      });
    return () => { active = false; };
  }, [load]);

  const mutate = async (body: Record<string, unknown>) => {
    if (isMutating) return;
    setIsMutating(true);
    setError("");
    if (!actionKey.current) actionKey.current = crypto.randomUUID();
    try {
      const response = await fetch(`/api/admin/partner-introductions/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": actionKey.current },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action impossible.");
      actionKey.current = "";
      setActivationConfirmed(false);
      setMessage(
        body.action === "activate_historical"
          ? "La demande a été transmise à l’athlète."
          : "Action enregistrée.",
      );
      setDetail(await load());
    } finally {
      setIsMutating(false);
    }
  };

  const handleReport = async (reportId: string, status: "reviewing" | "resolved" | "dismissed") => {
    const note = reason.trim();
    if (!note) {
      setError("Un motif ou une note d’audit est obligatoire.");
      return;
    }
    const response = await fetch(
      `/api/admin/partner-introductions/${encodeURIComponent(requestId)}/reports/${encodeURIComponent(reportId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ status, note }),
      },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Traitement impossible.");
    setReason("");
    setMessage("Signalement mis à jour.");
    setDetail(await load());
  };

  return (
    <section className="introduction-page introduction-detail-page">
      <Link className="introduction-back-link" href="/today">← Retour à Aujourd’hui</Link>
      {error ? <p className="introduction-feedback is-error" role="alert">{error}</p> : null}
      {message ? <p className="introduction-feedback is-success" role="status">{message}</p> : null}
      {!detail && !error ? <p className="introduction-feedback is-loading">Chargement…</p> : null}
      {detail ? (
        <>
          <Card className="introduction-detail-card">
            <header className="introduction-detail-header">
              <div>
                <p className="introduction-eyebrow">Supervision de la demande</p>
                <h1>{detail.partnerPublicName || "Partenaire non identifié"} <span>→</span> {detail.athletePublicName || "Athlète non identifié"}</h1>
                {detail.historical ? <small>Demande historique</small> : null}
              </div>
              <div className="introduction-badge-group">
                <Badge className={`introduction-status-badge is-${detail.status}`}>
                  {detail.historical ? historicalStatusLabel(detail.status) : statusLabel(detail.status)}
                </Badge>
                {detail.moderationStatus === "suspended" ? (
                  <Badge className="introduction-status-badge is-suspended">Suspendue</Badge>
                ) : null}
              </div>
            </header>
            <div className="introduction-detail-grid">
              <section className="introduction-content-block">
                <h2>Motif</h2>
                <p>{detail.reason || "Motif non renseigné"}</p>
              </section>
              {detail.message ? <section className="introduction-content-block"><h2>Message</h2><p>{detail.message}</p></section> : null}
            </div>
            <footer className="introduction-detail-meta">
              <span>Créée le {new Date(detail.createdAt).toLocaleString("fr-CH")}</span>
              <span>{detail.ageDays} jour{detail.ageDays === 1 ? "" : "s"}</span>
            </footer>
          </Card>

          {detail.historical ? (
            <Card className="introduction-action-card introduction-historical-action">
              <header>
                <div>
                  <p className="introduction-eyebrow">Ancien parcours</p>
                  <h2>{detail.status === "pending" ? "Transmission à l’athlète" : "Demande résolue"}</h2>
                </div>
              </header>
              {detail.status === "pending" ? (
                <>
                  <p>
                    Cette demande appartient à l’ancien parcours. Elle n’a pas été transmise à
                    l’athlète dans le nouveau système.
                  </p>
                  <label className="introduction-confirmation">
                    <Checkbox
                      checked={activationConfirmed}
                      onChange={(event) => setActivationConfirmed(event.target.checked)}
                    />
                    <span>
                      Je confirme que cette action avertira l’athlète et lui permettra
                      d’accepter ou de refuser la demande.
                    </span>
                  </label>
                  <div className="introduction-actions">
                    <Button
                      className="introduction-button is-primary"
                      type="button"
                      disabled={!activationConfirmed || isMutating}
                      onClick={() => {
                        void mutate({ action: "activate_historical" })
                          .catch((cause: unknown) => setError(
                            cause instanceof Error ? cause.message : "Transmission impossible.",
                          ));
                      }}
                    >
                      {isMutating ? "Transmission…" : "Valider et transmettre à l’athlète"}
                    </Button>
                  </div>
                </>
              ) : (
                <p>
                  Cette demande a été résolue dans l’ancien parcours. Elle reste consultable
                  et ne sera pas transmise à l’athlète dans le nouveau système.
                </p>
              )}
            </Card>
          ) : (
          <Card className="introduction-action-card">
            <header>
              <div>
                <p className="introduction-eyebrow">Prochaine action</p>
                <h2>Actions de supervision</h2>
              </div>
              <p>Ces actions ne modifient jamais la décision ni le consentement de l’athlète.</p>
            </header>
            <label className="introduction-field">
              <span>Motif obligatoire</span>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
            </label>
            <div className="introduction-actions">
              <>
                  <Button className="introduction-button is-danger" type="button" disabled={isMutating || !reason.trim() || detail.moderationStatus === "suspended"} onClick={() => {
                    void mutate({ action: "suspend", reason }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Action impossible."));
                  }}>Suspendre</Button>
                  <Button className="introduction-button is-secondary" type="button" disabled={isMutating || !reason.trim() || detail.moderationStatus !== "suspended"} onClick={() => {
                    void mutate({ action: "reactivate", reason }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Action impossible."));
                  }}>Réactiver</Button>
                </>
              <Button className="introduction-button is-primary" type="button" disabled={isMutating || !reason.trim()} onClick={() => {
                void mutate({ action: "set_solicitation", canSolicit: !detail.solicitationAllowed, reason })
                  .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Action impossible."));
              }}>
                {detail.solicitationAllowed ? "Désactiver les sollicitations" : "Rétablir les sollicitations"}
              </Button>
            </div>
          </Card>
          )}

          <details className="introduction-disclosure">
            <summary>Signalements <span>{detail.reports.length}</span></summary>
            <div>
              {detail.reports.length === 0 ? <p>Aucun signalement.</p> : detail.reports.map((report) => (
                <article key={report.id} className="introduction-report">
                  <header><strong>{report.reason}</strong><Badge className="introduction-status-badge">{report.status}</Badge></header>
                  {report.comment ? <p>{report.comment}</p> : null}
                  {report.handlingNote ? <p>Note : {report.handlingNote}</p> : null}
                  <div className="introduction-actions">
                    {(["reviewing", "resolved", "dismissed"] as const).map((status) => (
                      <Button className="introduction-button is-secondary is-compact" key={status} type="button" disabled={!reason.trim()} onClick={() => {
                        void handleReport(report.id, status).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Traitement impossible."));
                      }}>{status}</Button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </details>

          <details className="introduction-disclosure">
            <summary>Historique et droit de sollicitation <span>{detail.events.length + detail.solicitationEvents.length}</span></summary>
            <div>
              {detail.events.length === 0 ? <p>Aucun événement d’audit.</p> : (
                <ol className="introduction-timeline">
                  {detail.events.map((event) => (
                    <li key={event.id}>
                      <time>{new Date(event.occurredAt).toLocaleString("fr-CH")}</time>
                      <span>{event.eventType} par {event.actorRole}</span>
                    </li>
                  ))}
                </ol>
              )}
              <h3>Droit de sollicitation</h3>
              {detail.solicitationEvents.length === 0 ? <p>Aucun changement enregistré.</p> : (
                <ol className="introduction-timeline">
                  {detail.solicitationEvents.map((event) => (
                    <li key={event.id}>
                      <time>{new Date(event.occurredAt).toLocaleString("fr-CH")}</time>
                      <span>{event.canSolicit ? "Rétabli" : "Désactivé"} : {event.reason}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
