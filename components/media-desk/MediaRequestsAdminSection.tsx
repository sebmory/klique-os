"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/src/design-system/components";
import { MEDIA_REQUEST_TYPE_LABELS, type MediaRequestType } from "./media-subject-presentation";

type MediaRequestStatus =
  | "submitted"
  | "reviewing"
  | "awaiting_athlete"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

type MediaRequestAthlete = {
  athleteId: string;
  consentStatus: "pending" | "approved" | "declined";
  respondedAt: string | null;
};

type MediaRequestItem = {
  id: string;
  subjectId: string;
  subjectTitle: string | null;
  requestedByClerkUserId: string;
  requesterEmail: string;
  mediaId: string | null;
  requestType: MediaRequestType;
  message: string;
  deadline: string | null;
  status: MediaRequestStatus;
  adminNote: string | null;
  athleteIds: string[];
  athletes: MediaRequestAthlete[];
  createdAt: string;
  updatedAt: string;
};

const STATUS_ORDER: readonly MediaRequestStatus[] = [
  "submitted",
  "reviewing",
  "awaiting_athlete",
  "accepted",
  "declined",
  "completed",
  "cancelled",
];

const STATUS_LABELS: Record<MediaRequestStatus, string> = {
  submitted: "Envoyée",
  reviewing: "En cours d’examen",
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const STATUS_COLORS: Record<MediaRequestStatus, { background: string; color: string }> = {
  submitted: { background: "#eff6ff", color: "#1d4ed8" },
  reviewing: { background: "#fef3c7", color: "#b45309" },
  awaiting_athlete: { background: "#fff7ed", color: "#c2410c" },
  accepted: { background: "#f0fdf4", color: "#15803d" },
  declined: { background: "#fef2f2", color: "#b91c1c" },
  completed: { background: "#f3f4f6", color: "#374151" },
  cancelled: { background: "#f3f4f6", color: "#6b7280" },
};

const CONSENT_LABELS: Record<MediaRequestAthlete["consentStatus"], string> = {
  pending: "en attente",
  approved: "accepté",
  declined: "refusé",
};

const formatDateLabel = (value: string | null): string => {
  if (typeof value !== "string") return "Non précisée";
  const isoPrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return isoPrefix ? `${isoPrefix[3]}.${isoPrefix[2]}.${isoPrefix[1]}` : "Non précisée";
};

const selectStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "0.6rem 0.8rem",
  color: "#111827",
  background: "white",
} as const;

const filterButtonStyle = (active: boolean) =>
  ({
    borderRadius: "999px",
    padding: "0.5rem 0.85rem",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: "pointer",
    border: active ? "1px solid #f59e0b" : "1px solid #efe3d4",
    background: active ? "#f59e0b" : "#fff",
    color: active ? "#fff" : "#6b7280",
  }) as const;

export function MediaRequestsAdminSection() {
  const [requests, setRequests] = useState<MediaRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MediaRequestStatus | "all">("all");
  const [drafts, setDrafts] = useState<Record<string, { status: MediaRequestStatus; adminNote: string }>>({});
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successLabel, setSuccessLabel] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadRequests = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/media-requests", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; requests?: MediaRequestItem[]; message?: string }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.requests)) {
          setLoadError(payload?.message || "Les demandes média n’ont pas pu être chargées.");
          setRequests([]);
          return;
        }

        setRequests(payload.requests);
      } catch {
        if (active) {
          setLoadError("Les demandes média n’ont pas pu être chargées. Vérifiez votre connexion.");
          setRequests([]);
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

  const counts = useMemo(() => {
    const index = new Map<MediaRequestStatus, number>();
    for (const mediaRequest of requests) {
      index.set(mediaRequest.status, (index.get(mediaRequest.status) ?? 0) + 1);
    }
    return index;
  }, [requests]);

  const visibleRequests = useMemo(
    () => (statusFilter === "all" ? requests : requests.filter((mediaRequest) => mediaRequest.status === statusFilter)),
    [requests, statusFilter],
  );

  const getDraft = (mediaRequest: MediaRequestItem) =>
    drafts[mediaRequest.id] ?? { status: mediaRequest.status, adminNote: mediaRequest.adminNote ?? "" };

  const updateDraft = (requestId: string, patch: Partial<{ status: MediaRequestStatus; adminNote: string }>) => {
    setDrafts((current) => {
      const source = requests.find((entry) => entry.id === requestId);
      const base = current[requestId] ?? { status: source?.status ?? "submitted", adminNote: source?.adminNote ?? "" };
      return { ...current, [requestId]: { ...base, ...patch } };
    });
  };

  const saveRequest = async (mediaRequest: MediaRequestItem) => {
    if (pendingRequestId) return;

    const draft = getDraft(mediaRequest);
    setPendingRequestId(mediaRequest.id);
    setActionError(null);
    setSuccessLabel(null);

    try {
      const response = await fetch("/api/media-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: mediaRequest.id,
          status: draft.status,
          adminNote: draft.adminNote.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; request?: MediaRequestItem; message?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.request) {
        setActionError(payload?.message || "La demande n’a pas pu être mise à jour.");
        return;
      }

      const updated = payload.request;
      setRequests((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[updated.id];
        return next;
      });
      setSuccessLabel(`Demande mise à jour : ${STATUS_LABELS[updated.status]}.`);
    } catch {
      setActionError("La demande n’a pas pu être mise à jour. Veuillez réessayer.");
    } finally {
      setPendingRequestId(null);
    }
  };

  return (
    <Card
      style={{
        padding: "1.15rem",
        display: "grid",
        gap: "1rem",
        border: "1px solid #f0e2d0",
        boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)",
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
          MEDIA DESK
        </p>
        <h2 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.2rem", color: "#111827" }}>Demandes reçues</h2>
        <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
          Suivez les demandes envoyées par les médias, ajustez leur statut et documentez le traitement interne.
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setStatusFilter("all")} style={filterButtonStyle(statusFilter === "all")}>
          Toutes ({requests.length})
        </button>
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            style={filterButtonStyle(statusFilter === status)}
          >
            {STATUS_LABELS[status]} ({counts.get(status) ?? 0})
          </button>
        ))}
      </div>

      {successLabel ? (
        <p
          role="status"
          style={{
            margin: 0,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#15803d",
            borderRadius: "12px",
            padding: "0.7rem 0.85rem",
            fontWeight: 600,
          }}
        >
          {successLabel}
        </p>
      ) : null}

      {actionError || loadError ? (
        <p
          role="alert"
          style={{
            margin: 0,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: "12px",
            padding: "0.7rem 0.85rem",
          }}
        >
          {actionError ?? loadError}
        </p>
      ) : null}

      {loading ? (
        <p style={{ margin: 0, color: "#6b7280" }}>Chargement des demandes…</p>
      ) : visibleRequests.length === 0 ? (
        <p style={{ margin: 0, color: "#6b7280" }}>Aucune demande dans cette vue pour le moment.</p>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleRequests.map((mediaRequest) => {
            const draft = getDraft(mediaRequest);
            const isPending = pendingRequestId === mediaRequest.id;
            const statusColors = STATUS_COLORS[mediaRequest.status];

            return (
              <Card
                key={mediaRequest.id}
                style={{
                  padding: "1rem",
                  display: "grid",
                  gap: "0.7rem",
                  border: "1px solid #efe3d4",
                  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.05)",
                  borderRadius: "20px",
                  background: "#fffdf9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <Badge style={{ ...statusColors, padding: "0.35rem 0.65rem" }}>{STATUS_LABELS[mediaRequest.status]}</Badge>
                    <Badge style={{ background: "#f3f4f6", color: "#374151", padding: "0.35rem 0.65rem" }}>
                      {MEDIA_REQUEST_TYPE_LABELS[mediaRequest.requestType]}
                    </Badge>
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 600 }}>
                    {formatDateLabel(mediaRequest.createdAt)}
                  </div>
                </div>

                <div style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.92rem" }}>
                  <div>
                    <strong style={{ color: "#111827" }}>Média :</strong>{" "}
                    {mediaRequest.mediaId ? `${mediaRequest.mediaId} — ` : ""}
                    {mediaRequest.requesterEmail}
                  </div>
                  <div>
                    <strong style={{ color: "#111827" }}>Sujet :</strong>{" "}
                    <Link href={`/media-desk/${mediaRequest.subjectId}`} style={{ color: "#b45309", fontWeight: 700, textDecoration: "none" }}>
                      {mediaRequest.subjectTitle || mediaRequest.subjectId}
                    </Link>
                  </div>
                  <div>
                    <strong style={{ color: "#111827" }}>Échéance :</strong> {formatDateLabel(mediaRequest.deadline)}
                  </div>
                  <div>
                    <strong style={{ color: "#111827" }}>Athlètes :</strong>{" "}
                    {mediaRequest.athletes.length > 0
                      ? mediaRequest.athletes
                          .map((athlete) => `${athlete.athleteId} (${CONSENT_LABELS[athlete.consentStatus]})`)
                          .join(", ")
                      : "Aucun"}
                  </div>
                </div>

                <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{mediaRequest.message}</p>

                <div style={{ display: "grid", gap: "0.6rem" }}>
                  <label style={{ display: "grid", gap: "0.35rem", maxWidth: "260px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>Statut</span>
                    <select
                      value={draft.status}
                      onChange={(event) => updateDraft(mediaRequest.id, { status: event.target.value as MediaRequestStatus })}
                      disabled={isPending}
                      style={selectStyle}
                    >
                      {STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>Note interne</span>
                    <textarea
                      value={draft.adminNote}
                      onChange={(event) => updateDraft(mediaRequest.id, { adminNote: event.target.value })}
                      disabled={isPending}
                      rows={3}
                      placeholder="Suivi interne, décisions, points de coordination…"
                      style={{
                        padding: "0.6rem 0.7rem",
                        borderRadius: "12px",
                        border: "1px solid #efe3d4",
                        fontFamily: "inherit",
                        fontSize: "0.92rem",
                        color: "#111827",
                        resize: "vertical",
                      }}
                    />
                  </label>

                  <Button
                    type="button"
                    onClick={() => void saveRequest(mediaRequest)}
                    disabled={isPending}
                    style={{
                      borderRadius: "999px",
                      padding: "0.6rem 1rem",
                      background: "#f59e0b",
                      color: "#fff",
                      border: "none",
                      justifySelf: "start",
                      opacity: isPending ? 0.6 : 1,
                      cursor: isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    {isPending ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Card>
  );
}
