"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/src/design-system/components";
import {
  MEDIA_REQUEST_ACTION_LABELS,
  MEDIA_REQUEST_TYPE_LABELS,
  type MediaRequestType,
  type MediaSubject,
  formatSubjectDateLabel,
  getSubjectAthleteNames,
  sortRequestTypes,
} from "./media-subject-presentation";
import { SubjectCover } from "./MediaDeskMediaScreen";

const REQUESTS_HINT_LABEL = "Choisissez un type de demande pour ouvrir le formulaire.";

// Une demande d images peut ne cibler aucun athlete : tous les autres types en exigent au moins un.
const REQUEST_TYPES_WITHOUT_ATHLETE: readonly MediaRequestType[] = ["images"];

export function MediaSubjectDetailScreen({ subjectId }: { subjectId: string }) {
  const [subject, setSubject] = useState<MediaSubject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<MediaRequestType | null>(null);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successLabel, setSuccessLabel] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadSubject = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/api/media-subjects/${encodeURIComponent(subjectId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; subject?: MediaSubject; message?: string }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !payload.subject) {
          setLoadError(payload?.message || "Ce sujet n’est pas disponible.");
          setSubject(null);
          return;
        }

        setSubject(payload.subject);
      } catch {
        if (active) {
          setLoadError("Ce sujet n’a pas pu être chargé. Vérifiez votre connexion.");
          setSubject(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadSubject();
    return () => {
      active = false;
    };
  }, [subjectId]);

  const athleteNames = useMemo(() => (subject ? getSubjectAthleteNames(subject) : []), [subject]);

  const athleteOptions = useMemo(() => {
    if (!subject) return [] as Array<{ id: string; name: string }>;
    if (subject.athletes.length > 0) {
      return subject.athletes.map((athlete) => ({ id: athlete.id, name: athlete.name || athlete.id }));
    }
    return subject.athleteIds.map((id) => ({ id, name: id }));
  }, [subject]);

  const openRequestForm = (type: MediaRequestType) => {
    setActiveType(type);
    setSelectedAthleteIds([]);
    setMessage("");
    setDeadline("");
    setFormError(null);
    setSuccessLabel(null);
  };

  const toggleAthlete = (athleteId: string) => {
    setSelectedAthleteIds((current) =>
      current.includes(athleteId) ? current.filter((id) => id !== athleteId) : [...current, athleteId],
    );
  };

  const submitRequest = async () => {
    if (!subject || !activeType || submitting) return;

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setFormError("Le message est obligatoire.");
      return;
    }
    if (selectedAthleteIds.length === 0 && !REQUEST_TYPES_WITHOUT_ATHLETE.includes(activeType)) {
      setFormError("Sélectionnez au moins un athlète pour ce type de demande.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setSuccessLabel(null);

    try {
      const response = await fetch("/api/media-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          requestType: activeType,
          message: trimmedMessage,
          deadline: deadline.trim() || null,
          athleteIds: selectedAthleteIds,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

      if (!response.ok || !payload?.ok) {
        setFormError(payload?.message || "Votre demande n’a pas pu être envoyée.");
        return;
      }

      setSuccessLabel(`Demande envoyée : ${MEDIA_REQUEST_TYPE_LABELS[activeType]}. L’équipe Klique vous répondra.`);
      setActiveType(null);
      setSelectedAthleteIds([]);
      setMessage("");
      setDeadline("");
    } catch {
      setFormError("Votre demande n’a pas pu être envoyée. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Link href="/media-desk" style={{ color: "#b45309", fontWeight: 700, textDecoration: "none" }}>
        ← Retour aux sujets
      </Link>

      {loading ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Chargement du sujet…</p>
        </Card>
      ) : loadError || !subject ? (
        <Card style={{ padding: "1rem", border: "1px solid #fecaca", background: "#fef2f2" }}>
          <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>
            {loadError ?? "Ce sujet n’est pas disponible."}
          </p>
        </Card>
      ) : (
        <Card
          style={{
            padding: "1.15rem",
            display: "flex",
            gap: "1.4rem",
            alignItems: "flex-start",
            flexWrap: "wrap",
            border: "1px solid #efe3d4",
            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.05)",
            borderRadius: "20px",
            background: "#fffdf9",
          }}
        >
          {subject.coverImageUrl ? <SubjectCover url={subject.coverImageUrl} width={180} /> : null}

          <div style={{ display: "grid", gap: "0.9rem", alignContent: "start", flex: "1 1 300px", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
              {subject.sport ? (
                <Badge style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.35rem 0.65rem" }}>{subject.sport}</Badge>
              ) : (
                <span />
              )}
              <div style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 600 }}>{formatSubjectDateLabel(subject.date)}</div>
            </div>

            <div>
              <h1 style={{ margin: "0 0 0.4rem", fontSize: "1.35rem", color: "#111827", lineHeight: 1.25 }}>{subject.title}</h1>
              <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.7 }}>{subject.summary}</p>
            </div>

            <div style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.95rem" }}>
              <div>
                <strong style={{ color: "#111827" }}>Angle :</strong> {subject.angle}
              </div>
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

            <div style={{ display: "grid", gap: "0.6rem", padding: "0.95rem", border: "1px solid #f0e2d0", borderRadius: "16px", background: "#fff" }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>Demandes disponibles</p>
                <p style={{ margin: "0.2rem 0 0", color: "#6b7280", fontSize: "0.88rem" }}>{REQUESTS_HINT_LABEL}</p>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                {sortRequestTypes(subject.availableRequestTypes).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    onClick={() => openRequestForm(type)}
                    disabled={submitting}
                    aria-pressed={activeType === type}
                    style={{
                      borderRadius: "999px",
                      padding: "0.7rem 0.95rem",
                      background: activeType === type ? "#b45309" : "#f59e0b",
                      color: "#fff",
                      border: "none",
                      opacity: submitting ? 0.55 : 1,
                      cursor: submitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {MEDIA_REQUEST_ACTION_LABELS[type]}
                  </Button>
                ))}
              </div>

              {successLabel ? (
                <p
                  role="status"
                  style={{
                    margin: 0,
                    padding: "0.7rem 0.85rem",
                    borderRadius: "12px",
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    color: "#15803d",
                    fontWeight: 600,
                  }}
                >
                  {successLabel}
                </p>
              ) : null}

              {activeType ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitRequest();
                  }}
                  style={{
                    display: "grid",
                    gap: "0.7rem",
                    padding: "0.9rem",
                    border: "1px solid #f0e2d0",
                    borderRadius: "14px",
                    background: "#fffdf9",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>
                    {MEDIA_REQUEST_ACTION_LABELS[activeType]}
                  </p>

                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>
                      Athlètes{REQUEST_TYPES_WITHOUT_ATHLETE.includes(activeType) ? " (facultatif)" : ""}
                    </span>
                    {athleteOptions.length > 0 ? (
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {athleteOptions.map((athlete) => (
                          <label
                            key={athlete.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              padding: "0.4rem 0.7rem",
                              borderRadius: "999px",
                              border: "1px solid #efe3d4",
                              background: selectedAthleteIds.includes(athlete.id) ? "#fff7ed" : "#fff",
                              color: "#374151",
                              fontSize: "0.88rem",
                              cursor: submitting ? "not-allowed" : "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedAthleteIds.includes(athlete.id)}
                              onChange={() => toggleAthlete(athlete.id)}
                              disabled={submitting}
                            />
                            {athlete.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>Aucun athlète associé à ce sujet.</span>
                    )}
                  </div>

                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>Message</span>
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      disabled={submitting}
                      rows={4}
                      required
                      placeholder="Décrivez votre besoin, le format et le contexte."
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

                  <label style={{ display: "grid", gap: "0.35rem", maxWidth: "220px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>
                      Échéance (facultatif)
                    </span>
                    <input
                      type="date"
                      value={deadline}
                      onChange={(event) => setDeadline(event.target.value)}
                      disabled={submitting}
                      style={{
                        padding: "0.55rem 0.7rem",
                        borderRadius: "12px",
                        border: "1px solid #efe3d4",
                        fontFamily: "inherit",
                        fontSize: "0.92rem",
                        color: "#111827",
                      }}
                    />
                  </label>

                  {formError ? (
                    <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: "0.88rem" }}>
                      {formError}
                    </p>
                  ) : null}

                  <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    <Button
                      type="submit"
                      disabled={submitting}
                      style={{
                        borderRadius: "999px",
                        padding: "0.7rem 1.1rem",
                        background: "#f59e0b",
                        color: "#fff",
                        border: "none",
                        opacity: submitting ? 0.55 : 1,
                        cursor: submitting ? "not-allowed" : "pointer",
                      }}
                    >
                      {submitting ? "Envoi en cours…" : "Envoyer la demande"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setActiveType(null)}
                      disabled={submitting}
                      style={{
                        borderRadius: "999px",
                        padding: "0.7rem 1.1rem",
                        background: "#fff",
                        color: "#b45309",
                        border: "1px solid #efe3d4",
                        cursor: submitting ? "not-allowed" : "pointer",
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
