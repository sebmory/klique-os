"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/src/design-system/components";
import {
  MEDIA_REQUEST_ACTION_LABELS,
  type MediaSubject,
  formatSubjectDateLabel,
  getSubjectAthleteNames,
  sortRequestTypes,
} from "./media-subject-presentation";
import { SubjectCover } from "./MediaDeskMediaScreen";

const REQUESTS_SOON_LABEL = "Demandes bientôt disponibles";

export function MediaSubjectDetailScreen({ subjectId }: { subjectId: string }) {
  const [subject, setSubject] = useState<MediaSubject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
                <p style={{ margin: "0.2rem 0 0", color: "#6b7280", fontSize: "0.88rem" }}>{REQUESTS_SOON_LABEL}</p>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                {sortRequestTypes(subject.availableRequestTypes).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    disabled
                    title={REQUESTS_SOON_LABEL}
                    style={{
                      borderRadius: "999px",
                      padding: "0.7rem 0.95rem",
                      background: "#f59e0b",
                      color: "#fff",
                      border: "none",
                      opacity: 0.55,
                      cursor: "not-allowed",
                    }}
                  >
                    {MEDIA_REQUEST_ACTION_LABELS[type]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
