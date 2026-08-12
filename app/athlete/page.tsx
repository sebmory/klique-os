"use client";

import { useEffect, useMemo, useState } from "react";

type AthleteSummary = {
  key?: string;
  name?: string;
  nextContact?: string;
  importantRendezVousThisWeek?: string;
  lastResponseWeekly?: string;
  lastResponseMonthly?: string;
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
const formatValue = (value: unknown): string => normalize(value);

const getFirstName = (fullName: unknown): string => {
  const text = normalize(fullName);
  if (!text) return "athlète";
  return text.split(/\s+/).filter(Boolean)[0] || "athlète";
};

const formatFrenchDate = (value: unknown): string => {
  const text = normalize(value);
  if (!text) return "";

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

const parseDateValue = (value: unknown): Date | null => {
  const text = normalize(value);
  if (!text) return null;

  const dateTimeMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):?(\d{2})?:?(\d{2})?$/);
  if (dateTimeMatch) {
    const [, day, month, year] = dateTimeMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const simpleDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (simpleDateMatch) {
    const [, day, month, year] = simpleDateMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toLocalDateOnly = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const isInCurrentCivilWeek = (value: unknown): boolean => {
  const parsed = parseDateValue(value);
  if (!parsed) return false;

  const today = toLocalDateOnly(new Date());
  const day = today.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - distanceFromMonday);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const target = toLocalDateOnly(parsed);
  return target.getTime() >= startOfWeek.getTime() && target.getTime() <= endOfWeek.getTime();
};

const isInCurrentCivilMonth = (value: unknown): boolean => {
  const parsed = parseDateValue(value);
  if (!parsed) return false;

  const now = new Date();
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
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

  const firstName = useMemo(() => getFirstName(athlete?.name), [athlete?.name]);

  const upcomingItem = useMemo(() => {
    const priority = formatValue(athlete?.importantRendezVousThisWeek);
    if (priority) return priority;
    const fallback = formatValue(athlete?.nextContact);
    return fallback;
  }, [athlete?.importantRendezVousThisWeek, athlete?.nextContact]);

  const weeklyNeedsReminder = useMemo(() => !isInCurrentCivilWeek(athlete?.lastResponseWeekly), [athlete?.lastResponseWeekly]);
  const monthlyNeedsReminder = useMemo(() => !isInCurrentCivilMonth(athlete?.lastResponseMonthly), [athlete?.lastResponseMonthly]);

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
      <div style={{ padding: "1.5rem", display: "grid", gap: "1rem", maxWidth: "980px", margin: "0 auto" }}>
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 800, color: "#111827" }}>Bonjour {firstName} 👋</h1>
          <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
            Voici ce qui compte pour toi dans KLIQUE aujourd’hui.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <article style={{ border: "1px solid #e5e7eb", borderRadius: "18px", padding: "1rem", background: "white", boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>A venir</p>
          {upcomingItem ? (
            <>
              <h2 style={{ margin: "0.45rem 0 0.35rem", fontSize: "1.08rem", color: "#111827", lineHeight: 1.4 }}>{upcomingItem}</h2>
              <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.5 }}>
                {formatValue(athlete?.importantRendezVousThisWeek)
                  ? "Priorité identifiée dans votre dernier suivi hebdomadaire."
                  : "Échéance planifiée dans votre suivi athlète."}
              </p>
            </>
          ) : (
            <p style={{ margin: "0.5rem 0 0", color: "#6b7280" }}>Aucune échéance à venir enregistrée pour le moment.</p>
          )}
        </article>

        <article style={{ border: "1px solid #e5e7eb", borderRadius: "18px", padding: "1rem", background: "white", boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)", display: "grid", gap: "0.65rem" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Rappels</p>

          {weeklyNeedsReminder || monthlyNeedsReminder ? (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              {weeklyNeedsReminder ? (
                <div style={{ border: "1px solid #e5e7eb", background: "#f8fafc", color: "#111827", borderRadius: "12px", padding: "0.7rem", display: "grid", gap: "0.4rem" }}>
                  <strong style={{ display: "block", marginBottom: "0.2rem" }}>Fiche hebdomadaire à remplir</strong>
                  <span style={{ fontSize: "0.9rem", color: "#4b5563" }}>Prends 2 minutes pour nous donner de tes nouvelles.</span>
                  <a
                    href="https://docs.google.com/forms/d/1r1wEMFUzYlrNks_8PCI7V3Tc3HlzmP6-MUZlAMI9DP8/viewform"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ width: "fit-content", border: "1px solid #111827", borderRadius: "999px", padding: "0.35rem 0.7rem", textDecoration: "none", fontWeight: 700, color: "#111827", background: "#ffffff" }}
                  >
                    Remplir ma fiche →
                  </a>
                </div>
              ) : null}
              {monthlyNeedsReminder ? (
                <div style={{ border: "1px solid #e5e7eb", background: "#f8fafc", color: "#111827", borderRadius: "12px", padding: "0.7rem", display: "grid", gap: "0.4rem" }}>
                  <strong style={{ display: "block", marginBottom: "0.2rem" }}>Fiche mensuelle à remplir</strong>
                  <span style={{ fontSize: "0.9rem", color: "#4b5563" }}>Fais le point sur ton mois avec KLIQUE.</span>
                  <a
                    href="https://docs.google.com/forms/d/1Ha0JqC4LOqxUx95PQBDeRfCUy92DQhnrBSAwG8VRDp8/viewform"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ width: "fit-content", border: "1px solid #111827", borderRadius: "999px", padding: "0.35rem 0.7rem", textDecoration: "none", fontWeight: 700, color: "#111827", background: "#ffffff" }}
                  >
                    Remplir ma fiche →
                  </a>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ border: "1px solid #dcfce7", background: "#f0fdf4", color: "#166534", borderRadius: "12px", padding: "0.7rem" }}>
              <strong>Tout est à jour</strong>
            </div>
          )}
        </article>
      </div>

      <article style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.75rem", background: "#fcfcfd", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)", display: "grid", gap: "0.5rem" }}>
          <p style={{ margin: 0, fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Acces rapides</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "0.45rem" }}>
            <a href="/athlete/profile" style={{ textDecoration: "none", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.55rem 0.6rem", color: "#111827", fontWeight: 650, fontSize: "0.9rem", background: "#fff" }}>
              Mon profil
            </a>
            <a href="/athlete/pass" style={{ textDecoration: "none", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.55rem 0.6rem", color: "#111827", fontWeight: 650, fontSize: "0.9rem", background: "#fff" }}>
              Mon Pass KLIQUE
            </a>
            <a href="/athlete/ecosysteme" style={{ textDecoration: "none", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.55rem 0.6rem", color: "#111827", fontWeight: 650, fontSize: "0.9rem", background: "#fff" }}>
              Ecosysteme
            </a>
            <a href="/athlete/community" style={{ textDecoration: "none", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.55rem 0.6rem", color: "#111827", fontWeight: 650, fontSize: "0.9rem", background: "#fff" }}>
              Communaute
            </a>
          </div>
        </article>
    </div>
  );
}
