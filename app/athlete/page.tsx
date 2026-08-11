"use client";

import { useEffect, useMemo, useState } from "react";

type AthleteSummary = {
  key?: string;
  name?: string;
  sport?: string;
  club?: string;
  status?: string;
  instagram?: string;
  phone?: string;
  email?: string;
  nextContact?: string;
  importantRendezVousThisWeek?: string;
  lastResponseWeekly?: string;
  birthDate?: string;
  nationality?: string;
  position?: string;
};

type ClerkAccessPayload = {
  ok?: boolean;
  userAccess?: {
    athleteId?: string | null;
    role?: string | null;
  } | null;
};

type AthletesPayload = {
  athletes?: AthleteSummary[];
  source?: string;
  message?: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const formatValue = (value: unknown): string => normalize(value) || "Non renseigné";

const formatFrenchDate = (value: unknown): string => {
  const text = normalize(value);
  if (!text) return "Non renseigné";

  const dateTimeMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):?(\d{2})?:?(\d{2})?$/);
  if (dateTimeMatch) {
    const [, day, month, year] = dateTimeMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  }

  const simpleDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (simpleDateMatch) {
    const [, day, month, year] = simpleDateMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return parsed.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export default function AthletePage() {
  const [athlete, setAthlete] = useState<AthleteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAthleteView = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const accessResponse = await fetch("/api/clerk/access", {
          credentials: "include",
          cache: "no-store",
        });

        if (!accessResponse.ok) {
          throw new Error("Impossible de charger votre espace athlète.");
        }

        const accessPayload = (await accessResponse.json()) as ClerkAccessPayload;
        const athleteId = accessPayload?.userAccess?.athleteId ?? null;

        if (!athleteId) {
          throw new Error("Aucun profil athlète n’est associé à votre compte.");
        }

        const athletesResponse = await fetch("/api/athletes", {
          credentials: "include",
          cache: "no-store",
        });

        if (!athletesResponse.ok) {
          throw new Error("Impossible de récupérer vos données personnelles.");
        }

        const athletesPayload = (await athletesResponse.json()) as AthletesPayload;
        const resolvedAthlete = (athletesPayload?.athletes ?? []).find((item) => item.key === athleteId) ?? null;

        if (!active) return;
        if (!resolvedAthlete) {
          setAthlete(null);
          setErrorMessage("Aucune donnée athlète n’a été retrouvée pour votre compte.");
          return;
        }

        setAthlete(resolvedAthlete);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger votre vue Aujourd’hui.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAthleteView();

    return () => {
      active = false;
    };
  }, []);

  const personalItems = useMemo(() => {
    if (!athlete) return [];

    return [
      { label: "Sport", value: formatValue(athlete.sport) },
      { label: "Club", value: formatValue(athlete.club) },
      { label: "Statut", value: formatValue(athlete.status) },
      { label: "Email", value: formatValue(athlete.email) },
      { label: "Téléphone", value: formatValue(athlete.phone) },
      { label: "Instagram", value: formatValue(athlete.instagram) },
      { label: "Nationalité", value: formatValue(athlete.nationality) },
      { label: "Poste", value: formatValue(athlete.position) },
    ].filter((item) => item.value !== "Non renseigné");
  }, [athlete]);

  if (loading) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Aujourd’hui</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>Chargement de votre vue personnalisée…</p>
      </div>
    );
  }

  if (errorMessage || !athlete) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Aujourd’hui</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>{errorMessage ?? "Aucune donnée disponible pour le moment."}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", display: "grid", gap: "1rem", maxWidth: "1100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 700, color: "#111827" }}>Aujourd’hui</h1>
          <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
            Un aperçu simple et premium de ce qui compte pour vous aujourd’hui.
          </p>
        </div>
        <div style={{ padding: "0.45rem 0.75rem", borderRadius: "999px", background: "linear-gradient(135deg, #111827, #4f46e5)", color: "white", fontSize: "0.85rem", fontWeight: 600 }}>
          Espace athlète
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <article style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "1.1rem", background: "white", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Prochaine échéance</p>
          <h2 style={{ margin: "0.4rem 0 0.4rem", fontSize: "1.05rem", color: "#111827" }}>
            {athlete.importantRendezVousThisWeek ? formatValue(athlete.importantRendezVousThisWeek) : formatValue(athlete.nextContact)}
          </h2>
          <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.5 }}>
            {athlete.importantRendezVousThisWeek
              ? "Rendez-vous important identifié dans votre réponse hebdomadaire."
              : athlete.nextContact
                ? "Date de contact planifiée dans votre profil."
                : "Aucune échéance importante renseignée."}
          </p>
        </article>

        <article style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "1.1rem", background: "white", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Dernière réponse hebdomadaire</p>
          <h2 style={{ margin: "0.4rem 0 0.4rem", fontSize: "1.05rem", color: "#111827" }}>
            {athlete.lastResponseWeekly ? formatFrenchDate(athlete.lastResponseWeekly) : formatValue(athlete.lastResponseWeekly)}
          </h2>
          <p style={{ margin: 0, color: "#4b5563" }}>
            {athlete.lastResponseWeekly ? "Dernière réponse enregistrée dans votre suivi hebdomadaire." : "Aucune réponse hebdomadaire n’est encore disponible."}
          </p>
        </article>

        <article style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "1.1rem", background: "white", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Informations personnelles</p>
          <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.65rem" }}>
            {personalItems.length > 0 ? (
              personalItems.map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
                  <span style={{ color: "#6b7280", fontSize: "0.9rem" }}>{item.label}</span>
                  <strong style={{ textAlign: "right", color: "#111827", fontWeight: 600 }}>{item.value}</strong>
                </div>
              ))
            ) : (
              <p style={{ margin: 0, color: "#4b5563" }}>Aucune information personnelle supplémentaire n’est disponible.</p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
