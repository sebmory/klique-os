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

const readValue = (value: unknown): string => {
  const text = String(value ?? "").trim();
  return text || "Non renseigné";
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

  const profileName = readValue(athlete?.name);
  const initials = computeInitials(String(athlete?.name ?? ""));
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
    <section style={{ padding: "1.5rem", maxWidth: "980px", margin: "0 auto", display: "grid", gap: "1rem" }}>
      <header style={{ display: "grid", gap: "0.85rem" }}>
        <p style={{ margin: 0, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>
          Espace Athlète
        </p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#111827" }}>Mon profil</h1>
      </header>

      <article style={{ border: "1px solid #e5e7eb", borderRadius: "18px", background: "#ffffff", padding: "1rem", display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
            <div
              aria-hidden
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "999px",
                background: "#111827",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              {initials}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#111827" }}>{profileName}</h2>
              <p style={{ margin: "0.25rem 0 0", color: "#4b5563" }}>{readValue(athlete.sport)} · {readValue(athlete.club)}</p>
            </div>
          </div>

          <div style={{ display: "grid", justifyItems: "end", gap: "0.45rem" }}>
            <span
              style={{
                borderRadius: "999px",
                padding: "0.4rem 0.75rem",
                fontSize: "0.82rem",
                fontWeight: 700,
                background: membership.isActive ? "#dcfce7" : "#f3f4f6",
                color: membership.isActive ? "#166534" : "#374151",
                border: membership.isActive ? "1px solid #bbf7d0" : "1px solid #d1d5db",
              }}
            >
              Statut KLIQUE: {membership.statusLabel}
            </span>
            <Link
              href="/athlete/pass"
              style={{
                border: "1px solid #111827",
                borderRadius: "999px",
                padding: "0.45rem 0.85rem",
                fontWeight: 700,
                color: "#111827",
                background: "#ffffff",
              }}
            >
              Voir Mon Pass KLIQUE
            </Link>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.8rem" }}>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
            <small style={{ color: "#6b7280" }}>Sport</small>
            <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.sport)}</p>
          </div>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
            <small style={{ color: "#6b7280" }}>Club</small>
            <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.club)}</p>
          </div>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
            <small style={{ color: "#6b7280" }}>Poste / spécialité</small>
            <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.position)}</p>
          </div>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
            <small style={{ color: "#6b7280" }}>Nationalité</small>
            <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.nationality)}</p>
          </div>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
            <small style={{ color: "#6b7280" }}>Date de naissance</small>
            <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.birthDate)}</p>
          </div>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
            <small style={{ color: "#6b7280" }}>Statut fiche</small>
            <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.status)}</p>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.9rem", display: "grid", gap: "0.7rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", color: "#111827" }}>Coordonnées</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.8rem" }}>
            <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
              <small style={{ color: "#6b7280" }}>Instagram</small>
              <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.instagram)}</p>
            </div>
            <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
              <small style={{ color: "#6b7280" }}>Email</small>
              <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.email)}</p>
            </div>
            <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
              <small style={{ color: "#6b7280" }}>Téléphone</small>
              <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.phone)}</p>
            </div>
            <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
              <small style={{ color: "#6b7280" }}>Adhésion KLIQUE</small>
              <p style={{ margin: "0.25rem 0 0", fontWeight: 700, color: "#111827" }}>{readValue(athlete.adhesionDate)}</p>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.9rem", display: "grid", gap: "0.8rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", color: "#111827" }}>Distinctions KLIQUE</h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.8rem" }}>
            <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
              <small style={{ color: "#6b7280" }}>Total nominations</small>
              <p style={{ margin: "0.25rem 0 0", fontWeight: 800, color: "#111827", fontSize: "1.1rem" }}>{nominations.length}</p>
            </div>
            <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem" }}>
              <small style={{ color: "#6b7280" }}>Total distinctions remportées</small>
              <p style={{ margin: "0.25rem 0 0", fontWeight: 800, color: "#111827", fontSize: "1.1rem" }}>{distinctions.length}</p>
            </div>
          </div>

          {!hasDistinctionData ? (
            <div style={{ border: "1px dashed #d1d5db", borderRadius: "12px", padding: "0.9rem", background: "#fafafa", color: "#6b7280" }}>
              Aucune nomination ou distinction n’est encore enregistrée pour le moment.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.8rem" }}>
              <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem", display: "grid", gap: "0.6rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#111827" }}>Historique des nominations</h4>
                {nominations.length === 0 ? (
                  <p style={{ margin: 0, color: "#6b7280" }}>Aucune nomination enregistrée.</p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.55rem" }}>
                    {nominations.map((nomination) => (
                      <li key={nomination.id} style={{ border: "1px solid #f3f4f6", borderRadius: "10px", padding: "0.65rem" }}>
                        <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>{getDistinctionTypeLabel(nomination.type)}</p>
                        <p style={{ margin: "0.2rem 0 0", color: "#4b5563" }}>{formatMonthYear(nomination.awardMonth, nomination.awardYear)}</p>
                        {nomination.reason ? <p style={{ margin: "0.25rem 0 0", color: "#6b7280" }}>{nomination.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ border: "1px solid #f0f0f0", borderRadius: "12px", padding: "0.75rem", display: "grid", gap: "0.6rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#111827" }}>Historique des distinctions</h4>
                {distinctions.length === 0 ? (
                  <p style={{ margin: 0, color: "#6b7280" }}>Aucune distinction remportée.</p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.55rem" }}>
                    {distinctions.map((distinction) => (
                      <li
                        key={distinction.id}
                        style={{
                          border: "1px solid #fde68a",
                          borderRadius: "10px",
                          padding: "0.65rem",
                          background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                          display: "grid",
                          gap: "0.2rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.9rem" }} aria-hidden>🏅</span>
                          <p style={{ margin: 0, fontWeight: 800, color: "#92400e" }}>{getDistinctionTypeLabel(distinction.type)}</p>
                          <span style={{ borderRadius: "999px", padding: "0.2rem 0.5rem", background: "#fef3c7", color: "#92400e", fontSize: "0.74rem", fontWeight: 700 }}>
                            Distinction remportée
                          </span>
                        </div>
                        <p style={{ margin: 0, color: "#4b5563" }}>{formatMonthYear(distinction.awardMonth, distinction.awardYear)}</p>
                        {distinction.description ? <p style={{ margin: 0, color: "#6b7280" }}>{distinction.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
