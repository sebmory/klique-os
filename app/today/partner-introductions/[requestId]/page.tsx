"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Detail = {
  id: string;
  partnerId: string;
  partnerPublicName: string;
  athletePublicName: string;
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

export default function AdminPartnerIntroductionDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
    if (!actionKey.current) actionKey.current = crypto.randomUUID();
    const response = await fetch(`/api/admin/partner-introductions/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": actionKey.current },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Action impossible.");
    actionKey.current = "";
    setMessage("Action enregistrée.");
    setDetail(await load());
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
    <section style={{ maxWidth: "960px", margin: "0 auto", padding: "1.5rem", display: "grid", gap: "1rem" }}>
      <Link href="/today">Retour à Aujourd’hui</Link>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {!detail && !error ? <p>Chargement…</p> : null}
      {detail ? (
        <>
          <header>
            <h1>{detail.partnerPublicName || "Partenaire KLIQUE"} → {detail.athletePublicName || "Athlète KLIQUE"}</h1>
            <p>{detail.reason}</p>
            {detail.message ? <p>{detail.message}</p> : null}
            <p>Demande : {detail.status} · Modération : {detail.moderationStatus} · Ancienneté : {detail.ageDays} jour(s)</p>
            <p>Créée le {new Date(detail.createdAt).toLocaleString("fr-CH")}</p>
          </header>
          <section>
            <h2>Actions de supervision</h2>
            <label>
              Motif obligatoire
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button type="button" disabled={!reason.trim() || detail.moderationStatus === "suspended"} onClick={() => {
                void mutate({ action: "suspend", reason }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Action impossible."));
              }}>Suspendre</button>
              <button type="button" disabled={!reason.trim() || detail.moderationStatus !== "suspended"} onClick={() => {
                void mutate({ action: "reactivate", reason }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Action impossible."));
              }}>Réactiver</button>
              <button type="button" disabled={!reason.trim()} onClick={() => {
                void mutate({ action: "set_solicitation", canSolicit: !detail.solicitationAllowed, reason })
                  .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Action impossible."));
              }}>
                {detail.solicitationAllowed ? "Désactiver les sollicitations" : "Rétablir les sollicitations"}
              </button>
            </div>
            <p>Ces actions ne modifient jamais la décision ni le consentement de l’athlète.</p>
          </section>
          <section>
            <h2>Signalements</h2>
            {detail.reports.length === 0 ? <p>Aucun signalement.</p> : detail.reports.map((report) => (
              <article key={report.id}>
                <strong>{report.reason}</strong> · {report.status}
                {report.comment ? <p>{report.comment}</p> : null}
                {report.handlingNote ? <p>Note : {report.handlingNote}</p> : null}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {(["reviewing", "resolved", "dismissed"] as const).map((status) => (
                    <button key={status} type="button" disabled={!reason.trim()} onClick={() => {
                      void handleReport(report.id, status).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Traitement impossible."));
                    }}>{status}</button>
                  ))}
                </div>
              </article>
            ))}
          </section>
          <section>
            <h2>Historique d’audit</h2>
            <ol>
              {detail.events.map((event) => (
                <li key={event.id}>
                  {new Date(event.occurredAt).toLocaleString("fr-CH")} — {event.eventType} par {event.actorRole}
                  {" · "}{event.requestStatus} / {event.moderationStatus}
                </li>
              ))}
            </ol>
            <h3>Droit de sollicitation</h3>
            {detail.solicitationEvents.length === 0 ? <p>Aucun changement enregistré.</p> : (
              <ol>
                {detail.solicitationEvents.map((event) => (
                  <li key={event.id}>
                    {new Date(event.occurredAt).toLocaleString("fr-CH")} — {event.canSolicit ? "Rétabli" : "Désactivé"} : {event.reason}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
