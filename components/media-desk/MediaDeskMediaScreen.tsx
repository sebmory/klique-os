"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Badge, Button, Card, Input, Textarea } from "@/src/design-system/components";
import type { MediaAthleteDirectoryEntry } from "@/types/athlete";
import { MediaBankPanel } from "./MediaBankPanel";
import {
  MEDIA_REQUEST_TYPE_LABELS,
  MEDIA_REQUEST_TYPE_ORDER,
  type MediaRequestType,
  type MediaSubject,
  collectSubjectSports,
  filterMediaSubjects,
  formatSubjectDateLabel,
  getSubjectAthleteNames,
  sortRequestTypes,
} from "./media-subject-presentation";

const inputStyle = { width: "100%", borderRadius: "14px" } as const;

const selectStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "0.75rem 0.9rem",
  color: "#111827",
  background: "white",
} as const;

type MediaDeskTab = "subjects" | "requests" | "bank";

type MediaRequestStatus =
  | "submitted"
  | "reviewing"
  | "awaiting_athlete"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

type MediaRequestOrigin = "klique_proposal" | "free";

type MediaRequestItem = {
  id: string;
  origin: MediaRequestOrigin;
  subjectId: string | null;
  title: string | null;
  subjectTitle: string | null;
  requestType: MediaRequestType;
  message: string;
  deadline: string | null;
  status: MediaRequestStatus;
  createdAt: string;
};

const MEDIA_REQUEST_STATUS_LABELS: Record<MediaRequestStatus, string> = {
  submitted: "Envoyée",
  reviewing: "En cours d’examen",
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const MEDIA_REQUEST_STATUS_COLORS: Record<MediaRequestStatus, { background: string; color: string }> = {
  submitted: { background: "#eff6ff", color: "#1d4ed8" },
  reviewing: { background: "#fef3c7", color: "#b45309" },
  awaiting_athlete: { background: "#fff7ed", color: "#c2410c" },
  accepted: { background: "#f0fdf4", color: "#15803d" },
  declined: { background: "#fef2f2", color: "#b91c1c" },
  completed: { background: "#f3f4f6", color: "#374151" },
  cancelled: { background: "#f3f4f6", color: "#6b7280" },
};

const getRequestStatusLabel = (status: MediaRequestStatus): string =>
  MEDIA_REQUEST_STATUS_LABELS[status] ?? "Envoyée";

const getRequestStatusColors = (status: MediaRequestStatus) =>
  MEDIA_REQUEST_STATUS_COLORS[status] ?? MEDIA_REQUEST_STATUS_COLORS.submitted;

const tabStyle = (active: boolean) =>
  ({
    borderRadius: "999px",
    padding: "0.55rem 1rem",
    fontWeight: 700,
    fontSize: "0.9rem",
    cursor: "pointer",
    border: active ? "1px solid #f59e0b" : "1px solid #efe3d4",
    background: active ? "#f59e0b" : "#fff",
    color: active ? "#fff" : "#6b7280",
  }) as const;

export const SubjectCover = ({ url, width }: { url: string; width: number }) => (
  <div
    style={{
      position: "relative",
      width: `${width}px`,
      flex: `0 0 ${width}px`,
      aspectRatio: "3 / 4",
      borderRadius: "6px 14px 14px 6px",
      overflow: "hidden",
      background: "#f3f4f6",
      boxShadow: "0 18px 32px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.12)",
    }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    <span
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "6px 14px 14px 6px",
        background:
          "linear-gradient(90deg, rgba(15,23,42,0.34) 0%, rgba(15,23,42,0.10) 4%, rgba(255,255,255,0.16) 7%, rgba(255,255,255,0) 16%)",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.24)",
        pointerEvents: "none",
      }}
    />
  </div>
);

export const RequestTypeChips = ({ types }: { types: MediaRequestType[] }) => (
  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
    {sortRequestTypes(types).map((type) => (
      <span
        key={type}
        style={{ background: "#f3f4f6", color: "#374151", borderRadius: "999px", padding: "0.3rem 0.6rem", fontWeight: 700, fontSize: "0.82rem" }}
      >
        {MEDIA_REQUEST_TYPE_LABELS[type]}
      </span>
    ))}
  </div>
);

export function MediaDeskMediaScreen() {
  const [subjects, setSubjects] = useState<MediaSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [requestType, setRequestType] = useState<MediaRequestType | "all">("all");
  const [activeTab, setActiveTab] = useState<MediaDeskTab>("subjects");
  const [requests, setRequests] = useState<MediaRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [freeRequestOpen, setFreeRequestOpen] = useState(false);
  const [freeRequestTitle, setFreeRequestTitle] = useState("");
  const [freeRequestType, setFreeRequestType] = useState<MediaRequestType>("interview");
  const [freeRequestAthleteIds, setFreeRequestAthleteIds] = useState<string[]>([]);
  const [freeRequestMessage, setFreeRequestMessage] = useState("");
  const [freeRequestDeadline, setFreeRequestDeadline] = useState("");
  const [freeRequestSubmitting, setFreeRequestSubmitting] = useState(false);
  const [freeRequestError, setFreeRequestError] = useState<string | null>(null);
  const [freeRequestSuccess, setFreeRequestSuccess] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<MediaAthleteDirectoryEntry[]>([]);
  const [athletesLoading, setAthletesLoading] = useState(false);
  const [athletesError, setAthletesError] = useState<string | null>(null);
  const [athletesLoaded, setAthletesLoaded] = useState(false);
  // La banque reste montee apres sa premiere ouverture : ses lots ne sont charges qu une fois.
  const [bankOpened, setBankOpened] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSubjects = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/media-subjects", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; subjects?: MediaSubject[]; message?: string }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.subjects)) {
          setLoadError(payload?.message || "Les sujets n’ont pas pu être chargés.");
          setSubjects([]);
          return;
        }

        setSubjects(payload.subjects);
      } catch {
        if (active) {
          setLoadError("Les sujets n’ont pas pu être chargés. Vérifiez votre connexion.");
          setSubjects([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadSubjects();
    return () => {
      active = false;
    };
  }, []);

  const sports = useMemo(() => collectSubjectSports(subjects), [subjects]);

  // Les demandes ne sont chargees qu au premier affichage de l onglet.
  useEffect(() => {
    if (activeTab !== "requests" || requestsLoaded) return;
    let active = true;

    const loadRequests = async () => {
      setRequestsLoading(true);
      setRequestsError(null);
      try {
        const response = await fetch("/api/media-requests", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; requests?: MediaRequestItem[]; message?: string }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.requests)) {
          setRequestsError(payload?.message || "Vos demandes n’ont pas pu être chargées.");
          setRequests([]);
          return;
        }

        setRequests((current) => {
          const loadedIds = new Set(payload.requests!.map((mediaRequest) => mediaRequest.id));
          return [...current.filter((mediaRequest) => !loadedIds.has(mediaRequest.id)), ...payload.requests!];
        });
        setRequestsLoaded(true);
      } catch {
        if (active) {
          setRequestsError("Vos demandes n’ont pas pu être chargées. Vérifiez votre connexion.");
          setRequests([]);
        }
      } finally {
        if (active) setRequestsLoading(false);
      }
    };

    void loadRequests();
    return () => {
      active = false;
    };
  }, [activeTab, requestsLoaded]);

  useEffect(() => {
    if (!freeRequestOpen || athletesLoaded) return;
    let active = true;

    const loadAthletes = async () => {
      setAthletesLoading(true);
      setAthletesError(null);
      try {
        const response = await fetch("/api/media/athletes", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { athletes?: MediaAthleteDirectoryEntry[]; error?: string }
          | null;

        if (!active) return;
        if (!response.ok || !Array.isArray(payload?.athletes)) {
          setAthletesError(payload?.error || "Les athlètes n’ont pas pu être chargés.");
          setAthletes([]);
          return;
        }

        setAthletes(payload.athletes);
        setAthletesLoaded(true);
      } catch {
        if (active) {
          setAthletesError("Les athlètes n’ont pas pu être chargés. Vérifiez votre connexion.");
          setAthletes([]);
        }
      } finally {
        if (active) setAthletesLoading(false);
      }
    };

    void loadAthletes();
    return () => {
      active = false;
    };
  }, [athletesLoaded, freeRequestOpen]);

  const visibleSubjects = useMemo(
    () => filterMediaSubjects(subjects, { query, sport, requestType }),
    [query, requestType, sport, subjects],
  );

  const canSubmitFreeRequest =
    freeRequestTitle.trim().length > 0
    && freeRequestMessage.trim().length > 0
    && (freeRequestType === "images" || freeRequestAthleteIds.length > 0)
    && !freeRequestSubmitting;

  const toggleFreeRequestAthlete = (athleteId: string) => {
    setFreeRequestAthleteIds((current) =>
      current.includes(athleteId)
        ? current.filter((entry) => entry !== athleteId)
        : [...current, athleteId],
    );
  };

  const submitFreeRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitFreeRequest) return;

    setFreeRequestSubmitting(true);
    setFreeRequestError(null);
    setFreeRequestSuccess(null);

    try {
      const response = await fetch("/api/media-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: "free",
          title: freeRequestTitle.trim(),
          requestType: freeRequestType,
          athleteIds: freeRequestAthleteIds,
          message: freeRequestMessage.trim(),
          deadline: freeRequestDeadline || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; request?: MediaRequestItem; message?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.request) {
        throw new Error(payload?.message || "La demande libre n’a pas pu être envoyée.");
      }

      setRequests((current) => [payload.request!, ...current.filter((entry) => entry.id !== payload.request!.id)]);
      setFreeRequestTitle("");
      setFreeRequestType("interview");
      setFreeRequestAthleteIds([]);
      setFreeRequestMessage("");
      setFreeRequestDeadline("");
      setFreeRequestOpen(false);
      setFreeRequestSuccess("Votre demande libre a été envoyée.");
      setActiveTab("requests");
    } catch (error) {
      setFreeRequestError(error instanceof Error ? error.message : "La demande libre n’a pas pu être envoyée.");
    } finally {
      setFreeRequestSubmitting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div role="tablist" aria-label="Media Desk" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "subjects"}
            onClick={() => setActiveTab("subjects")}
            style={tabStyle(activeTab === "subjects")}
          >
            Propositions KLIQUE
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "requests"}
            onClick={() => setActiveTab("requests")}
            style={tabStyle(activeTab === "requests")}
          >
            Mes demandes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "bank"}
            onClick={() => {
              setActiveTab("bank");
              setBankOpened(true);
            }}
            style={tabStyle(activeTab === "bank")}
          >
            Banque d’images
          </button>
        </div>

        <Button
          type="button"
          aria-expanded={freeRequestOpen}
          aria-controls="free-media-request-form"
          onClick={() => {
            setFreeRequestOpen((current) => !current);
            setFreeRequestError(null);
            setFreeRequestSuccess(null);
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
        >
          {freeRequestOpen ? <X size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
          {freeRequestOpen ? "Fermer" : "Faire une demande libre"}
        </Button>
      </div>

      {freeRequestOpen ? (
        <Card
          id="free-media-request-form"
          style={{ padding: "1.15rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}
        >
          <form onSubmit={submitFreeRequest} aria-busy={freeRequestSubmitting} style={{ display: "grid", gap: "1rem" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#b45309" }}>
                Demande libre
              </p>
              <h2 style={{ margin: "0.25rem 0 0", fontSize: "1.15rem", color: "#111827" }}>Transmettre votre propre demande</h2>
            </div>

            <div style={{ display: "grid", gap: "0.9rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label htmlFor="free-request-title" style={{ display: "grid", gap: "0.4rem", fontWeight: 700, color: "#374151" }}>
                Titre
                <Input
                  id="free-request-title"
                  required
                  value={freeRequestTitle}
                  onChange={(event) => setFreeRequestTitle(event.target.value)}
                  style={inputStyle}
                />
              </label>

              <label htmlFor="free-request-type" style={{ display: "grid", gap: "0.4rem", fontWeight: 700, color: "#374151" }}>
                Type
                <select
                  id="free-request-type"
                  value={freeRequestType}
                  onChange={(event) => setFreeRequestType(event.target.value as MediaRequestType)}
                  style={selectStyle}
                >
                  {MEDIA_REQUEST_TYPE_ORDER.map((type) => (
                    <option key={type} value={type}>{MEDIA_REQUEST_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </label>

              <label htmlFor="free-request-deadline" style={{ display: "grid", gap: "0.4rem", fontWeight: 700, color: "#374151" }}>
                Date souhaitée <span style={{ fontWeight: 400, color: "#6b7280" }}>(facultative)</span>
                <Input
                  id="free-request-deadline"
                  type="date"
                  value={freeRequestDeadline}
                  onChange={(event) => setFreeRequestDeadline(event.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>

            <fieldset style={{ margin: 0, padding: "0.9rem", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
              <legend style={{ padding: "0 0.35rem", fontWeight: 700, color: "#374151" }}>
                Athlètes {freeRequestType === "images" ? "(facultatif)" : "(au moins un)"}
              </legend>
              {athletesLoading ? <p role="status" style={{ margin: 0, color: "#6b7280" }}>Chargement des athlètes…</p> : null}
              {athletesError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{athletesError}</p> : null}
              {!athletesLoading && !athletesError ? (
                <div style={{ display: "grid", gap: "0.55rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                  {athletes.map((athlete) => (
                    <label key={athlete.athleteId} style={{ display: "flex", alignItems: "flex-start", gap: "0.55rem", color: "#374151" }}>
                      <input
                        type="checkbox"
                        checked={freeRequestAthleteIds.includes(athlete.athleteId)}
                        onChange={() => toggleFreeRequestAthlete(athlete.athleteId)}
                      />
                      <span>
                        <strong style={{ display: "block", color: "#111827" }}>{athlete.name}</strong>
                        {[athlete.sport, athlete.club].filter(Boolean).join(" · ")}
                      </span>
                    </label>
                  ))}
                  {athletes.length === 0 ? <p style={{ margin: 0, color: "#6b7280" }}>Aucun athlète disponible.</p> : null}
                </div>
              ) : null}
            </fieldset>

            <label htmlFor="free-request-message" style={{ display: "grid", gap: "0.4rem", fontWeight: 700, color: "#374151" }}>
              Message
              <Textarea
                id="free-request-message"
                required
                rows={5}
                value={freeRequestMessage}
                onChange={(event) => setFreeRequestMessage(event.target.value)}
                style={{ width: "100%", resize: "vertical" }}
              />
            </label>

            {freeRequestError ? <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{freeRequestError}</p> : null}
            {freeRequestSubmitting ? <p role="status" style={{ margin: 0, color: "#6b7280" }}>Envoi de la demande…</p> : null}

            <Button type="submit" disabled={!canSubmitFreeRequest} style={{ justifySelf: "start" }}>
              {freeRequestSubmitting ? "Envoi en cours…" : "Envoyer la demande libre"}
            </Button>
          </form>
        </Card>
      ) : null}

      {freeRequestSuccess ? <p role="status" style={{ margin: 0, color: "#15803d", fontWeight: 700 }}>{freeRequestSuccess}</p> : null}

      {activeTab === "requests" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <Card
            style={{
              padding: "1.15rem",
              border: "1px solid #f0e2d0",
              boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
              MEDIA DESK
            </p>
            <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Mes demandes</h1>
            <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
              Suivez l’avancement des demandes que vous avez envoyées à l’équipe KLIQUE.
            </p>
          </Card>

          {requestsError ? (
            <Card style={{ padding: "1rem", border: "1px solid #fecaca", background: "#fef2f2" }}>
              <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>
                {requestsError}
              </p>
            </Card>
          ) : null}

          {requestsLoading && requests.length === 0 ? (
            <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
              <p role="status" style={{ margin: 0, color: "#6b7280" }}>Chargement de vos demandes…</p>
            </Card>
          ) : requests.length === 0 && !requestsError ? (
            <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
              <p style={{ margin: 0, color: "#6b7280" }}>Vous n’avez encore envoyé aucune demande.</p>
            </Card>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              {requestsLoading ? <p role="status" style={{ margin: 0, color: "#6b7280" }}>Actualisation de vos demandes…</p> : null}
              {requests.map((mediaRequest) => {
                const statusColors = getRequestStatusColors(mediaRequest.status);
                const isFreeRequest = mediaRequest.origin === "free";

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
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <Badge style={{ background: isFreeRequest ? "#ecfdf5" : "#fff7ed", color: isFreeRequest ? "#047857" : "#b45309", padding: "0.35rem 0.65rem" }}>
                          {isFreeRequest ? "Demande libre" : "Proposition KLIQUE"}
                        </Badge>
                        <Badge style={{ background: "#f3f4f6", color: "#374151", padding: "0.35rem 0.65rem" }}>
                          {MEDIA_REQUEST_TYPE_LABELS[mediaRequest.requestType]}
                        </Badge>
                      </div>
                      <Badge style={{ ...statusColors, padding: "0.35rem 0.65rem" }}>
                        {getRequestStatusLabel(mediaRequest.status)}
                      </Badge>
                    </div>

                    {mediaRequest.title ? <h2 style={{ margin: 0, fontSize: "1.05rem", color: "#111827" }}>{mediaRequest.title}</h2> : null}

                    <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{mediaRequest.message}</p>

                    <div style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.92rem" }}>
                      <div>
                        <strong style={{ color: "#111827" }}>Échéance :</strong>{" "}
                        {mediaRequest.deadline ? formatSubjectDateLabel(mediaRequest.deadline) : "Non précisée"}
                      </div>
                      <div>
                        <strong style={{ color: "#111827" }}>Envoyée le :</strong>{" "}
                        {formatSubjectDateLabel(mediaRequest.createdAt)}
                      </div>
                    </div>

                    {!isFreeRequest && mediaRequest.subjectId ? (
                      <Link
                        href={`/media-desk/${mediaRequest.subjectId}`}
                        style={{ color: "#b45309", fontWeight: 700, textDecoration: "none", justifySelf: "start" }}
                      >
                        {mediaRequest.subjectTitle ? `Voir le sujet : ${mediaRequest.subjectTitle}` : "Voir le sujet"} →
                      </Link>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === "subjects" ? (
        <>
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
          <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Propositions de sujets KLIQUE</h1>
          <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
            Choisissez une proposition KLIQUE pour faciliter les liens avec son écosystème, ou transmettez votre propre demande libre. Les propositions KLIQUE sont sans engagement pour les médias.
          </p>
        </div>

        <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Input
            placeholder="Rechercher un titre, un sport ou un athlète…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={inputStyle}
          />
          <select value={sport} onChange={(event) => setSport(event.target.value)} style={selectStyle}>
            <option value="all">Tous les sports</option>
            {sports.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <select
            value={requestType}
            onChange={(event) => setRequestType(event.target.value as MediaRequestType | "all")}
            style={selectStyle}
          >
            <option value="all">Tous les types de demandes</option>
            {MEDIA_REQUEST_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {MEDIA_REQUEST_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loadError ? (
        <Card style={{ padding: "1rem", border: "1px solid #fecaca", background: "#fef2f2" }}>
          <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>
            {loadError}
          </p>
        </Card>
      ) : null}

      {loading ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Chargement des sujets…</p>
        </Card>
      ) : visibleSubjects.length === 0 ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Aucun sujet ne correspond à cette recherche pour le moment.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleSubjects.map((subject) => {
            const athleteNames = getSubjectAthleteNames(subject);

            return (
              <Link
                key={subject.id}
                href={`/media-desk/${subject.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card
                  style={{
                    padding: "1rem",
                    display: "flex",
                    gap: "1.1rem",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    border: "1px solid #efe3d4",
                    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.05)",
                    borderRadius: "20px",
                    background: "#fffdf9",
                  }}
                >
                  {subject.coverImageUrl ? <SubjectCover url={subject.coverImageUrl} width={148} /> : null}

                  <div style={{ display: "grid", gap: "0.7rem", alignContent: "start", flex: "1 1 280px", minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <Badge style={{ background: "#fff7ed", color: "#b45309", padding: "0.35rem 0.65rem" }}>Proposé par KLIQUE</Badge>
                        {subject.sport ? (
                          <Badge style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.35rem 0.65rem" }}>{subject.sport}</Badge>
                        ) : null}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 600 }}>
                        {formatSubjectDateLabel(subject.date)}
                      </div>
                    </div>

                    <div>
                      <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.08rem", color: "#111827", lineHeight: 1.3 }}>{subject.title}</h2>
                      <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>{subject.summary}</p>
                    </div>

                    <div style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.92rem" }}>
                      {subject.location ? (
                        <div>
                          <strong style={{ color: "#111827" }}>Lieu :</strong> {subject.location}
                        </div>
                      ) : null}
                      <div>
                        <strong style={{ color: "#111827" }}>Athlètes :</strong>{" "}
                        {athleteNames.length > 0 ? athleteNames.join(", ") : "Non précisé"}
                      </div>
                    </div>

                    <RequestTypeChips types={subject.availableRequestTypes} />
                    <span
                      style={{
                        justifySelf: "start",
                        borderRadius: "999px",
                        padding: "0.65rem 0.9rem",
                        background: "#f59e0b",
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      Découvrir le sujet
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
        </>
      ) : null}

      {bankOpened ? (
        <div style={{ display: activeTab === "bank" ? "grid" : "none", gap: "1rem" }}>
          <MediaBankPanel />
        </div>
      ) : null}
    </div>
  );
}
