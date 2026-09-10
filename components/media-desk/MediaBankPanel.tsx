"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Input } from "@/src/design-system/components";

type MediaBankLot = {
  id: string;
  row: number | null;
  date: string;
  athlete: string;
  sport: string;
  mediaType: string;
  event: string;
  place: string;
  totalFiles: number;
  orientations: { vertical: number; horizontal: number; square: number };
  videos: number;
  rights: string;
  driveLink: string;
};

type OrientationFilter = "all" | "vertical" | "horizontal" | "square" | "video";

const ORIENTATION_OPTIONS: Array<{ value: OrientationFilter; label: string }> = [
  { value: "all", label: "Toutes les orientations" },
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "square", label: "Carré" },
  { value: "video", label: "Vidéo" },
];

const inputStyle = { width: "100%", borderRadius: "14px" } as const;

const selectStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "0.75rem 0.9rem",
  color: "#111827",
  background: "white",
} as const;

const countChipStyle = {
  background: "#f3f4f6",
  color: "#374151",
  borderRadius: "999px",
  padding: "0.3rem 0.6rem",
  fontWeight: 700,
  fontSize: "0.82rem",
} as const;

const collectValues = (lots: MediaBankLot[], key: "sport" | "mediaType"): string[] =>
  [...new Set(lots.map((lot) => lot[key].trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

const matchesOrientation = (lot: MediaBankLot, orientation: OrientationFilter): boolean => {
  if (orientation === "all") return true;
  if (orientation === "video") return lot.videos > 0;
  return lot.orientations[orientation] > 0;
};

export function MediaBankPanel() {
  const [lots, setLots] = useState<MediaBankLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [mediaType, setMediaType] = useState("all");
  const [orientation, setOrientation] = useState<OrientationFilter>("all");

  useEffect(() => {
    let active = true;

    const loadLots = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/media-bank", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; lots?: MediaBankLot[]; message?: string }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.lots)) {
          setLoadError(payload?.message || "La banque d’images n’a pas pu être chargée.");
          setLots([]);
          return;
        }

        setLots(payload.lots);
      } catch {
        if (active) {
          setLoadError("La banque d’images n’a pas pu être chargée. Vérifiez votre connexion.");
          setLots([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadLots();
    return () => {
      active = false;
    };
  }, []);

  const sports = useMemo(() => collectValues(lots, "sport"), [lots]);
  const mediaTypes = useMemo(() => collectValues(lots, "mediaType"), [lots]);

  const visibleLots = useMemo(() => {
    const search = query.trim().toLowerCase();

    return lots.filter((lot) => {
      if (sport !== "all" && lot.sport.trim() !== sport) return false;
      if (mediaType !== "all" && lot.mediaType.trim() !== mediaType) return false;
      if (!matchesOrientation(lot, orientation)) return false;
      if (!search) return true;

      return [lot.athlete, lot.event, lot.sport, lot.place].join(" ").toLowerCase().includes(search);
    });
  }, [lots, mediaType, orientation, query, sport]);

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
          <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Banque d’images</h1>
          <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
            Les lots photo et vidéo dont les droits couvrent explicitement un usage média ou presse.
          </p>
        </div>

        <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Input
            placeholder="Rechercher un athlète, un événement, un sport ou un lieu…"
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
          <select value={mediaType} onChange={(event) => setMediaType(event.target.value)} style={selectStyle}>
            <option value="all">Tous les types de médias</option>
            {mediaTypes.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <select
            value={orientation}
            onChange={(event) => setOrientation(event.target.value as OrientationFilter)}
            style={selectStyle}
          >
            {ORIENTATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
          <p style={{ margin: 0, color: "#6b7280" }}>Chargement de la banque d’images…</p>
        </Card>
      ) : visibleLots.length === 0 && !loadError ? (
        <Card style={{ padding: "1rem", border: "1px solid #efe3d4" }}>
          <p style={{ margin: 0, color: "#6b7280" }}>Aucun lot ne correspond à cette recherche pour le moment.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleLots.map((lot) => (
            <Card
              key={lot.id}
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
                  {lot.sport ? (
                    <Badge style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.35rem 0.65rem" }}>{lot.sport}</Badge>
                  ) : null}
                  {lot.mediaType ? (
                    <Badge style={{ background: "#f3f4f6", color: "#374151", padding: "0.35rem 0.65rem" }}>{lot.mediaType}</Badge>
                  ) : null}
                </div>
                <div style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 600 }}>{lot.date || "Sans date"}</div>
              </div>

              <div>
                <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.08rem", color: "#111827", lineHeight: 1.3 }}>
                  {lot.event || "Lot sans nom"}
                </h2>
                <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>
                  {lot.athlete || "Athlète non précisé"}
                  {lot.place ? ` · ${lot.place}` : ""}
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <span style={countChipStyle}>{lot.totalFiles} fichiers</span>
                {lot.orientations.vertical > 0 ? <span style={countChipStyle}>{lot.orientations.vertical} V</span> : null}
                {lot.orientations.horizontal > 0 ? <span style={countChipStyle}>{lot.orientations.horizontal} H</span> : null}
                {lot.orientations.square > 0 ? <span style={countChipStyle}>{lot.orientations.square} C</span> : null}
                {lot.videos > 0 ? <span style={countChipStyle}>{lot.videos} vidéos</span> : null}
              </div>

              <div style={{ color: "#374151", fontSize: "0.92rem" }}>
                <strong style={{ color: "#111827" }}>Droits :</strong> {lot.rights}
              </div>

              <a
                href={lot.driveLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  justifySelf: "start",
                  borderRadius: "999px",
                  padding: "0.6rem 1rem",
                  background: "#f59e0b",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  textDecoration: "none",
                }}
              >
                Accéder au lot
              </a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
