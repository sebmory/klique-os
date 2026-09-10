"use client";

import { useEffect, useMemo, useState } from "react";

const GOLD = "#e8b84b";
const BORDER = "rgba(255, 255, 255, 0.09)";
const MUTED = "#9ca3af";

type MediaBankOrientations = {
  vertical: number;
  horizontal: number;
  square: number;
};

type AthleteMediaBankLot = {
  id: string;
  date: string;
  sport: string;
  mediaType: string;
  event: string;
  place: string;
  totalFiles: number;
  orientations: MediaBankOrientations;
  videos: number;
  galleryUrl: string;
};

const inputStyle = {
  padding: "0.6rem 0.75rem",
  borderRadius: "8px",
  border: `1px solid ${BORDER}`,
  background: "rgba(255, 255, 255, 0.035)",
  color: "#f8fafc",
  fontFamily: "inherit",
  fontSize: "0.9rem",
} as const;

const chipStyle = {
  borderRadius: "999px",
  padding: "0.2rem 0.6rem",
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "#d1d5db",
  border: `1px solid ${BORDER}`,
  background: "rgba(255, 255, 255, 0.04)",
} as const;

const collectValues = (lots: AthleteMediaBankLot[], key: "sport" | "mediaType"): string[] =>
  [...new Set(lots.map((lot) => lot[key].trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

export default function AthleteMediaBankPage() {
  const [lots, setLots] = useState<AthleteMediaBankLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [mediaType, setMediaType] = useState("all");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch("/api/athlete-media-bank", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; lots?: AthleteMediaBankLot[]; message?: string }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.lots)) {
          setErrorMessage(payload?.message || "Vos médias n’ont pas pu être chargés.");
          setLots([]);
          return;
        }

        setLots(payload.lots);
      } catch {
        if (active) {
          setErrorMessage("Vos médias n’ont pas pu être chargés. Vérifiez votre connexion.");
          setLots([]);
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

  const sports = useMemo(() => collectValues(lots, "sport"), [lots]);
  const mediaTypes = useMemo(() => collectValues(lots, "mediaType"), [lots]);

  const visibleLots = useMemo(() => {
    const search = query.trim().toLowerCase();

    return lots.filter((lot) => {
      if (sport !== "all" && lot.sport.trim() !== sport) return false;
      if (mediaType !== "all" && lot.mediaType.trim() !== mediaType) return false;
      if (!search) return true;
      return [lot.event, lot.place, lot.sport, lot.mediaType].join(" ").toLowerCase().includes(search);
    });
  }, [lots, mediaType, query, sport]);

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
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Mes médias</h1>
        <p style={{ margin: 0, color: MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "68ch" }}>
          Les lots photo et vidéo réalisés par KLIQUE qui vous concernent, avec un accès direct à chaque galerie.
        </p>
      </header>

      <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un événement, un lieu ou un sport…"
          style={inputStyle}
        />
        <select value={sport} onChange={(event) => setSport(event.target.value)} style={inputStyle}>
          <option value="all">Tous les sports</option>
          {sports.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <select value={mediaType} onChange={(event) => setMediaType(event.target.value)} style={inputStyle}>
          <option value="all">Tous les types de médias</option>
          {mediaTypes.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      {errorMessage ? (
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
          {errorMessage}
        </p>
      ) : null}

      {loading ? (
        <p style={{ margin: 0, color: MUTED }} aria-live="polite">
          Chargement de vos médias…
        </p>
      ) : visibleLots.length === 0 && !errorMessage ? (
        <p style={{ margin: 0, color: MUTED }}>Aucun lot média ne correspond à cette recherche pour le moment.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.7rem" }}>
          {visibleLots.map((lot) => (
            <article
              key={lot.id}
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
                  {lot.sport ? <span style={chipStyle}>{lot.sport}</span> : null}
                  {lot.mediaType ? <span style={chipStyle}>{lot.mediaType}</span> : null}
                </div>
                <span style={{ color: MUTED, fontSize: "0.82rem" }}>{lot.date || "Sans date"}</span>
              </div>

              <div>
                <strong style={{ color: "#f8fafc", fontSize: "1rem" }}>{lot.event || "Lot sans nom"}</strong>
                {lot.place ? <p style={{ margin: "0.2rem 0 0", color: MUTED, fontSize: "0.88rem" }}>{lot.place}</p> : null}
              </div>

              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <span style={chipStyle}>{lot.totalFiles} fichiers</span>
                {lot.orientations.vertical > 0 ? <span style={chipStyle}>{lot.orientations.vertical} V</span> : null}
                {lot.orientations.horizontal > 0 ? <span style={chipStyle}>{lot.orientations.horizontal} H</span> : null}
                {lot.orientations.square > 0 ? <span style={chipStyle}>{lot.orientations.square} C</span> : null}
                {lot.videos > 0 ? <span style={chipStyle}>{lot.videos} vidéos</span> : null}
              </div>

              <a
                href={lot.galleryUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  justifySelf: "start",
                  borderRadius: "999px",
                  padding: "0.5rem 0.95rem",
                  background: GOLD,
                  color: "#0a0b0f",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  textDecoration: "none",
                }}
              >
                Accéder à la galerie
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
