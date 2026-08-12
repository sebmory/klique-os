"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildMembershipState } from "@/lib/membership";

type ClerkAccessPayload = {
  ok?: boolean;
  userAccess?: {
    athleteId?: string | null;
    role?: string | null;
  } | null;
};

type AthleteProfile = {
  key?: string;
  name?: string;
  initials?: string;
  sport?: string;
  club?: string;
  status?: string;
  position?: string;
  nationality?: string;
  birthDate?: string;
  palmares?: string;
  heightWeight?: string;
  objective?: string;
  longTerm?: string;
  desiredAreas?: string;
  instagram?: string;
  email?: string;
  phone?: string;
  adhesionDate?: string;
};

type AthletesPayload = {
  athletes?: AthleteProfile[];
  source?: string;
  message?: string;
};

type AthleteDistinction = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  awardedAt: string;
  description: string | null;
};

type AthleteNomination = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  nominatedAt: string;
  reason: string | null;
};

type AthleteDistinctionsPayload = {
  distinctions?: AthleteDistinction[];
  nominations?: AthleteNomination[];
  data?: {
    distinctions?: AthleteDistinction[];
    nominations?: AthleteNomination[];
  };
};

const readValue = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
};

const readMeaningfulValue = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (normalized === "a definir" || normalized === "a définir" || normalized === "à définir") {
    return null;
  }
  return text;
};

const splitDesiredAreas = (value: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const toInstagramLink = (value: string): string => {
  const cleaned = value.trim();
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return cleaned;
  }
  const handle = cleaned.startsWith("@") ? cleaned.slice(1) : cleaned;
  return `https://instagram.com/${handle}`;
};

const computeInitials = (name: string): string => {
  const source = name.trim();
  if (!source) return "--";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "--";
};

const getDistinctionTypeLabel = (type: string): string => {
  if (type === "athlete_of_the_month") return "Athlete KLIQUE du mois";
  return type;
};

const formatMonthYear = (month: number, year: number): string => {
  const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  const label = months[month - 1] ?? "mois";
  return `${label} ${year}`;
};

const extractDistinctionsPayload = (payload: AthleteDistinctionsPayload | null | undefined) => {
  const topLevelDistinctions = Array.isArray(payload?.distinctions) ? payload?.distinctions : null;
  const topLevelNominations = Array.isArray(payload?.nominations) ? payload?.nominations : null;
  const nestedDistinctions = Array.isArray(payload?.data?.distinctions) ? payload?.data?.distinctions : null;
  const nestedNominations = Array.isArray(payload?.data?.nominations) ? payload?.data?.nominations : null;

  return {
    distinctions: topLevelDistinctions ?? nestedDistinctions ?? [],
    nominations: topLevelNominations ?? nestedNominations ?? [],
  };
};

export default function AthleteProfilePage() {
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [distinctions, setDistinctions] = useState<AthleteDistinction[]>([]);
  const [nominations, setNominations] = useState<AthleteNomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const accessResponse = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!accessResponse.ok) {
          throw new Error("Impossible de récupérer votre profil.");
        }

        const accessPayload = (await accessResponse.json()) as ClerkAccessPayload;
        const role = accessPayload?.userAccess?.role ?? null;
        const resolvedAthleteId = accessPayload?.userAccess?.athleteId ?? null;

        if (!active) {
          return;
        }

        if (role !== "athlete") {
          throw new Error("Vous n’avez pas les permissions nécessaires pour consulter ce profil.");
        }

        if (!resolvedAthleteId) {
          setErrorMessage("Aucun profil athlète n’est associé à votre compte.");
          setAthlete(null);
          setAthleteIndex(null);
          return;
        }

        const [athletesResponse, distinctionsResponse] = await Promise.all([
          fetch("/api/athletes", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/athlete-distinctions?athleteId=${encodeURIComponent(resolvedAthleteId)}&includeNominations=1`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        if (!athletesResponse.ok) {
          throw new Error("Impossible de récupérer vos données de profil.");
        }

        const athletesPayload = (await athletesResponse.json()) as AthletesPayload;
        let distinctionsPayload: AthleteDistinctionsPayload = {};
        try {
          distinctionsPayload = (await distinctionsResponse.json()) as AthleteDistinctionsPayload;
        } catch {
          distinctionsPayload = {};
        }
        const athletes = athletesPayload?.athletes ?? [];
        const resolvedAthlete = athletes.find((item) => item.key === resolvedAthleteId) ?? null;
        const resolvedIndex = resolvedAthlete ? athletes.findIndex((item) => item.key === resolvedAthleteId) : null;

        if (!active) {
          return;
        }

        if (!resolvedAthlete) {
          setErrorMessage("Aucune donnée athlète n’a été retrouvée pour votre compte.");
          setAthlete(null);
          setAthleteIndex(null);
          return;
        }

        setAthlete(resolvedAthlete);
        setAthleteIndex(resolvedIndex);
        const resolvedDistinctionsPayload = extractDistinctionsPayload(distinctionsPayload);
        setDistinctions(resolvedDistinctionsPayload.distinctions);
        setNominations(resolvedDistinctionsPayload.nominations);
      } catch {
        if (!active) {
          return;
        }
        setErrorMessage("Impossible de charger votre profil athlète.");
        setAthlete(null);
        setAthleteIndex(null);
        setDistinctions([]);
        setNominations([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const membership = useMemo(() => {
    return buildMembershipState({
      startDate: athlete?.adhesionDate,
      isInitialFreeYearEligible: athleteIndex !== null && athleteIndex < 16,
    });
  }, [athlete?.adhesionDate, athleteIndex]);

  const profileName = readValue(athlete?.name) ?? "Profil athlète";
  const initials = computeInitials(String(athlete?.name ?? ""));
  const sport = readValue(athlete?.sport);
  const club = readValue(athlete?.club);
  const position = readValue(athlete?.position);
  const nationality = readValue(athlete?.nationality);
  const birthDate = readValue(athlete?.birthDate);
  const palmares = readValue(athlete?.palmares);
  const heightWeight = readValue(athlete?.heightWeight);
  const objective = readMeaningfulValue(athlete?.objective);
  const longTerm = readMeaningfulValue(athlete?.longTerm);
  const desiredAreas = splitDesiredAreas(readMeaningfulValue(athlete?.desiredAreas));
  const email = readValue(athlete?.email);
  const phone = readValue(athlete?.phone);
  const instagram = readValue(athlete?.instagram);
  const identityMeta = [sport, club, position].filter((item): item is string => Boolean(item));
  const hasParcours = Boolean(nationality || birthDate || palmares || heightWeight);
  const hasObjectives = Boolean(objective || longTerm || desiredAreas.length > 0);
  const hasContact = Boolean(email || phone || instagram);
  const hasDistinctionData = nominations.length > 0 || distinctions.length > 0;

  if (loading) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: "980px", margin: "0 auto" }}>
        <p style={{ margin: 0, color: "#4b5563" }}>Chargement de votre profil…</p>
      </div>
    );
  }

  if (errorMessage || !athlete) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: "980px", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 0.4rem", fontSize: "1.4rem", color: "#111827" }}>Mon profil</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{errorMessage ?? "Impossible d’afficher votre profil."}</p>
      </div>
    );
  }

  return (
    <section style={{ padding: "1.25rem", maxWidth: "980px", margin: "0 auto", display: "grid", gap: "1rem" }}>
      <header style={{ display: "grid", gap: "0.65rem" }}>
        <p style={{ margin: 0, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6b7280", fontWeight: 700 }}>
          Espace Athlete
        </p>
        <h1 style={{ margin: 0, fontSize: "1.6rem", color: "#0f172a" }}>Mon profil</h1>
      </header>

      <article
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: "20px",
          background: "linear-gradient(150deg, #ffffff 0%, #f8fafc 70%, #f1f5f9 100%)",
          padding: "1rem",
          display: "grid",
          gap: "0.95rem",
          boxShadow: "0 14px 38px -26px rgba(15, 23, 42, 0.55)",
        }}
      >
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            background: "linear-gradient(130deg, #0f172a 0%, #1e293b 60%, #334155 100%)",
            padding: "0.95rem",
            color: "#f8fafc",
            display: "grid",
            gap: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.85rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: "0" }}>
              <div
                aria-hidden
                style={{
                  width: "58px",
                  height: "58px",
                  borderRadius: "999px",
                  background: "rgba(255, 255, 255, 0.14)",
                  color: "#f8fafc",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: "1.28rem", color: "#f8fafc", lineHeight: 1.2 }}>{profileName}</h2>
                {identityMeta.length > 0 ? (
                  <p style={{ margin: "0.32rem 0 0", color: "#cbd5e1", fontSize: "0.95rem" }}>{identityMeta.join(" · ")}</p>
                ) : null}
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.45rem", justifyItems: "start" }}>
              <span
                style={{
                  borderRadius: "999px",
                  padding: "0.34rem 0.7rem",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: membership.isActive ? "#dcfce7" : "#f1f5f9",
                  color: membership.isActive ? "#166534" : "#334155",
                  border: membership.isActive ? "1px solid #86efac" : "1px solid #cbd5e1",
                }}
              >
                Membre KLIQUE · {membership.statusLabel}
              </span>
              <Link
                href="/athlete/pass"
                style={{
                  border: "1px solid rgba(248, 250, 252, 0.45)",
                  borderRadius: "999px",
                  padding: "0.45rem 0.8rem",
                  fontWeight: 700,
                  color: "#f8fafc",
                  background: "rgba(255, 255, 255, 0.07)",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                }}
              >
                Voir Mon Pass KLIQUE
              </Link>
            </div>
          </div>
        </div>

        {hasParcours ? (
          <section style={{ border: "1px solid #e2e8f0", borderRadius: "16px", background: "#ffffff", padding: "0.95rem", display: "grid", gap: "0.7rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.06rem", color: "#0f172a" }}>Mon parcours</h3>
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {nationality ? (
                <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "0.45rem" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Nationalite</p>
                  <p style={{ margin: "0.2rem 0 0", color: "#0f172a", fontWeight: 600 }}>{nationality}</p>
                </div>
              ) : null}
              {birthDate ? (
                <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "0.45rem" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Date de naissance</p>
                  <p style={{ margin: "0.2rem 0 0", color: "#0f172a", fontWeight: 600 }}>{birthDate}</p>
                </div>
              ) : null}
              {heightWeight ? (
                <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "0.45rem" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Taille et poids</p>
                  <p style={{ margin: "0.2rem 0 0", color: "#0f172a", fontWeight: 600 }}>{heightWeight}</p>
                </div>
              ) : null}
              {palmares ? (
                <div>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Palmares</p>
                  <p style={{ margin: "0.2rem 0 0", color: "#334155", lineHeight: 1.5 }}>{palmares}</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {hasObjectives ? (
          <section style={{ border: "1px solid #e2e8f0", borderRadius: "16px", background: "#ffffff", padding: "0.95rem", display: "grid", gap: "0.72rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.06rem", color: "#0f172a" }}>Mes objectifs</h3>
            {objective ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.72rem", background: "#f8fafc" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Objectif actuel</p>
                <p style={{ margin: "0.22rem 0 0", color: "#0f172a", fontWeight: 700, lineHeight: 1.45 }}>{objective}</p>
              </div>
            ) : null}

            {longTerm ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.72rem", background: "#ffffff" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ambition long terme</p>
                <p style={{ margin: "0.22rem 0 0", color: "#334155", fontWeight: 600, lineHeight: 1.45 }}>{longTerm}</p>
              </div>
            ) : null}

            {desiredAreas.length > 0 ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.72rem", background: "#ffffff", display: "grid", gap: "0.5rem" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Axes d'accompagnement souhaites</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {desiredAreas.map((area) => (
                    <span key={area} style={{ borderRadius: "999px", border: "1px solid #cbd5e1", padding: "0.3rem 0.58rem", fontSize: "0.85rem", color: "#1e293b", background: "#f8fafc" }}>
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {hasContact ? (
          <section style={{ border: "1px solid #e2e8f0", borderRadius: "16px", background: "#ffffff", padding: "0.95rem", display: "grid", gap: "0.65rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.06rem", color: "#0f172a" }}>Contact et presence</h3>
            <div style={{ display: "grid", gap: "0.44rem" }}>
              {email ? (
                <a href={`mailto:${email}`} style={{ color: "#0f172a", textDecoration: "underline", textDecorationColor: "#cbd5e1", textUnderlineOffset: "3px", fontWeight: 600 }}>
                  {email}
                </a>
              ) : null}
              {phone ? (
                <a href={`tel:${phone}`} style={{ color: "#0f172a", textDecoration: "underline", textDecorationColor: "#cbd5e1", textUnderlineOffset: "3px", fontWeight: 600 }}>
                  {phone}
                </a>
              ) : null}
              {instagram ? (
                <a href={toInstagramLink(instagram)} target="_blank" rel="noreferrer" style={{ color: "#0f172a", textDecoration: "underline", textDecorationColor: "#cbd5e1", textUnderlineOffset: "3px", fontWeight: 600 }}>
                  {instagram}
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <section style={{ border: "1px solid #e2e8f0", borderRadius: "16px", background: "#ffffff", padding: "0.95rem", display: "grid", gap: "0.68rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "1.06rem", color: "#0f172a" }}>Distinctions KLIQUE</h3>
            {hasDistinctionData ? (
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
                {distinctions.length > 0 ? `${distinctions.length} distinction${distinctions.length > 1 ? "s" : ""}` : ""}
                {distinctions.length > 0 && nominations.length > 0 ? " · " : ""}
                {nominations.length > 0 ? `${nominations.length} nomination${nominations.length > 1 ? "s" : ""}` : ""}
              </p>
            ) : null}
          </div>

          {!hasDistinctionData ? (
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.92rem" }}>
              Aucune distinction affichee pour le moment.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.62rem" }}>
              {distinctions.length > 0 ? (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Distinctions obtenues</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.46rem" }}>
                    {distinctions.map((distinction) => (
                      <li
                        key={distinction.id}
                        style={{
                          border: "1px solid #fcd34d",
                          borderRadius: "12px",
                          padding: "0.68rem",
                          background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                          display: "grid",
                          gap: "0.2rem",
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 800, color: "#92400e" }}>{getDistinctionTypeLabel(distinction.type)}</p>
                        <p style={{ margin: 0, color: "#475569", fontSize: "0.9rem" }}>{formatMonthYear(distinction.awardMonth, distinction.awardYear)}</p>
                        {distinction.description ? <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>{distinction.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {nominations.length > 0 ? (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Nominations</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.46rem" }}>
                    {nominations.map((nomination) => (
                      <li
                        key={nomination.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "0.68rem",
                          background: "#f8fafc",
                          display: "grid",
                          gap: "0.2rem",
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 700, color: "#1e293b" }}>{getDistinctionTypeLabel(nomination.type)}</p>
                        <p style={{ margin: 0, color: "#475569", fontSize: "0.9rem" }}>{formatMonthYear(nomination.awardMonth, nomination.awardYear)}</p>
                        {nomination.reason ? <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>{nomination.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </article>
    </section>
  );
}
