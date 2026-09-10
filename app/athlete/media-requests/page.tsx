"use client";

import { useEffect, useMemo, useState } from "react";

const GOLD = "#e8b84b";
const BORDER = "rgba(255, 255, 255, 0.09)";
const MUTED = "#9ca3af";

type MediaRequestStatus =
  | "submitted"
  | "reviewing"
  | "awaiting_athlete"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

type ConsentStatus = "pending" | "approved" | "declined";

type MediaRequestAthlete = {
  athleteId: string;
  consentStatus: ConsentStatus;
  respondedAt: string | null;
};

type MediaRequestItem = {
  id: string;
  subjectId: string;
  subjectTitle: string | null;
  requesterEmail: string;
  mediaId: string | null;
  requestType: "interview" | "reaction" | "reportage" | "images" | "podcast";
  message: string;
  deadline: string | null;
  status: MediaRequestStatus;
  athletes: MediaRequestAthlete[];
  createdAt: string;
};

const TYPE_LABELS: Record<MediaRequestItem["requestType"], string> = {
  interview: "Interview",
  reaction: "Réaction",
  reportage: "Reportage",
  images: "Images",
  podcast: "Podcast",
};

const STATUS_LABELS: Record<MediaRequestStatus, string> = {
  submitted: "Envoyée",
  reviewing: "En cours d’examen",
  awaiting_athlete: "Votre réponse est attendue",
  accepted: "Acceptée",
  declined: "Refusée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const CONSENT_LABELS: Record<ConsentStatus, string> = {
  pending: "En attente de votre réponse",
  approved: "Vous avez accepté",
  declined: "Vous avez refusé",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "long", year: "numeric" });

const formatDate = (value: string | null): string => {
  if (typeof value !== "string" || !value.trim()) return "Non précisée";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
};

const chipStyle = {
  borderRadius: "999px",
  padding: "0.2rem 0.6rem",
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "#d1d5db",
  border: `1px solid ${BORDER}`,
  background: "rgba(255, 255, 255, 0.04)",
} as const;

export default function AthleteMediaRequestsPage() {
  const [requests, setRequests] = useState<MediaRequestItem[]>([]);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [accessResponse, requestsResponse] = await Promise.all([
          fetch("/api/clerk/access", { credentials: "include", cache: "no-store" }),
          fetch("/api/media-requests", { credentials: "include", cache: "no-store" }),
        ]);

        const accessPayload = (await accessResponse.json().catch(() => null)) as
          | { userAccess?: { athleteId?: string | null } | null }
          | null;
        const payload = (await requestsResponse.json().catch(() => null)) as
          | { ok?: boolean; requests?: MediaRequestItem[]; message?: string }
          | null;

        if (!active) return;

        if (!requestsResponse.ok || !payload?.ok || !Array.isArray(payload.requests)) {
          setErrorMessage(payload?.message || "Impossible de charger vos demandes médias.");
          setRequests([]);
          return;
        }

        setAthleteId(accessPayload?.userAccess?.athleteId?.trim() || null);
        setRequests(payload.requests);
      } catch {
        if (active) {
          setErrorMessage("Impossible de charger vos demandes médias. Vérifiez votre connexion.");
          setRequests([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const consentByRequestId = useMemo(() => {
    const index = new Map<string, ConsentStatus>();
    for (const mediaRequest of requests) {
      const own = athleteId ? mediaRequest.athletes.find((entry) => entry.athleteId === athleteId) : undefined;
      if (own) index.set(mediaRequest.id, own.consentStatus);
    }
    return index;
  }, [athleteId, requests]);

  const respond = async (mediaRequest: MediaRequestItem, consent: "approved" | "declined") => {
    if (pendingRequestId) return;

    setPendingRequestId(mediaRequest.id);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/media-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "athlete_consent", requestId: mediaRequest.id, consent }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; request?: MediaRequestItem; message?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.request) {
        setActionError(payload?.message || "Votre réponse n’a pas pu être enregistrée.");
        return;
      }

      const updated = payload.request;
      setRequests((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setSuccessMessage(consent === "approved" ? "Votre accord a été enregistré." : "Votre refus a été enregistré.");
    } catch {
      setActionError("Votre réponse n’a pas pu être enregistrée. Veuillez réessayer.");
    } finally {
      setPendingRequestId(null);
    }
  };

  return (
    <section
      style={{
        padding: "1.5rem",
        maxWidth: "1180px",
        margin: "0 auto",
        display: "grid",
        gap: "1.25rem",
        background: "#0a0b0f",
        borderRadius: "24px",
      }}
    >
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, fontWeight: 700 }}>
          Espace Athlète
        </p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Demandes médias</h1>
        <p style={{ margin: 0, color: MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "68ch" }}>
          Les demandes envoyées par les médias qui vous concernent. Vous répondez uniquement lorsque KLIQUE sollicite
          votre accord.
        </p>
      </header>

      {successMessage ? (
        <p
          role="status"
          style={{
            margin: 0,
            border: "1px solid rgba(74, 222, 128, 0.35)",
            background: "rgba(74, 222, 128, 0.12)",
            color: "#bbf7d0",
            borderRadius: "8px",
            padding: "0.8rem 0.9rem",
          }}
        >
          {successMessage}
        </p>
      ) : null}

      {errorMessage || actionError ? (
        <p
          role="alert"
          style={{
            margin: 0,
            border: "1px solid rgba(248, 113, 113, 0.35)",
            background: "rgba(248, 113, 113, 0.12)",
            color: "#fecaca",
            borderRadius: "8px",
            padding: "0.8rem 0.9rem",
          }}
        >
          {actionError ?? errorMessage}
        </p>
      ) : null}

      {loading ? (
        <p style={{ margin: 0, color: MUTED }} aria-live="polite">
          Chargement de vos demandes médias…
        </p>
      ) : requests.length === 0 && !errorMessage ? (
        <p style={{ margin: 0, color: MUTED }}>Aucune demande média ne vous concerne pour le moment.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.7rem" }}>
          {requests.map((mediaRequest) => {
            const consent = consentByRequestId.get(mediaRequest.id) ?? "pending";
            const isPending = pendingRequestId === mediaRequest.id;
            const canRespond = mediaRequest.status === "awaiting_athlete";

            return (
              <article
                key={mediaRequest.id}
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: "8px",
                  background: "rgba(255, 255, 255, 0.025)",
                  padding: "0.95rem 1rem",
                  display: "grid",
                  gap: "0.6rem",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                    <span style={chipStyle}>{TYPE_LABELS[mediaRequest.requestType]}</span>
                    <span
                      style={{
                        ...chipStyle,
                        color: canRespond ? "#fde68a" : "#d1d5db",
                        border: canRespond ? `1px solid rgba(232, 184, 75, 0.35)` : chipStyle.border,
                        background: canRespond ? "rgba(232, 184, 75, 0.08)" : chipStyle.background,
                      }}
                    >
                      {STATUS_LABELS[mediaRequest.status]}
                    </span>
                  </div>
                  <span style={{ color: MUTED, fontSize: "0.82rem" }}>{formatDate(mediaRequest.createdAt)}</span>
                </div>

                <strong style={{ color: "#f8fafc", fontSize: "1rem" }}>
                  {mediaRequest.subjectTitle || "Sujet KLIQUE"}
                </strong>

                <p style={{ margin: 0, color: "#d1d5db", fontSize: "0.9rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {mediaRequest.message}
                </p>

                <div style={{ display: "grid", gap: "0.25rem", color: MUTED, fontSize: "0.85rem" }}>
                  <span>Média : {mediaRequest.mediaId ? `${mediaRequest.mediaId} — ` : ""}{mediaRequest.requesterEmail}</span>
                  <span>Échéance : {formatDate(mediaRequest.deadline)}</span>
                  <span style={{ color: consent === "pending" ? MUTED : "#d1d5db" }}>{CONSENT_LABELS[consent]}</span>
                </div>

                {canRespond ? (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void respond(mediaRequest, "approved")}
                      disabled={isPending}
                      style={{
                        borderRadius: "999px",
                        padding: "0.5rem 0.95rem",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        border: `1px solid rgba(232, 184, 75, 0.35)`,
                        background: GOLD,
                        color: "#0a0b0f",
                        cursor: isPending ? "not-allowed" : "pointer",
                        opacity: isPending ? 0.6 : 1,
                      }}
                    >
                      {isPending ? "Envoi…" : "Accepter"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void respond(mediaRequest, "declined")}
                      disabled={isPending}
                      style={{
                        borderRadius: "999px",
                        padding: "0.5rem 0.95rem",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        border: `1px solid ${BORDER}`,
                        background: "rgba(255, 255, 255, 0.04)",
                        color: "#e5e7eb",
                        cursor: isPending ? "not-allowed" : "pointer",
                        opacity: isPending ? 0.6 : 1,
                      }}
                    >
                      Refuser
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
