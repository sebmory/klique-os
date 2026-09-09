"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, Input } from "@/src/design-system/components";
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

  const visibleSubjects = useMemo(
    () => filterMediaSubjects(subjects, { query, sport, requestType }),
    [query, requestType, sport, subjects],
  );

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
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
          <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Sujets disponibles</h1>
          <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
            Découvrez les sujets proposés par KLIQUE, les athlètes concernés et les types de demandes ouvertes pour chacun.
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
                      {subject.sport ? (
                        <Badge style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.35rem 0.65rem" }}>{subject.sport}</Badge>
                      ) : (
                        <span />
                      )}
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
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
