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

export default function AthleteProfilePage() {
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
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

        const athletesResponse = await fetch("/api/athletes", {
          credentials: "include",
          cache: "no-store",
        });

        if (!athletesResponse.ok) {
          throw new Error("Impossible de récupérer vos données de profil.");
        }

        const athletesPayload = (await athletesResponse.json()) as AthletesPayload;
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
      } catch {
        if (!active) {
          return;
        }
        setErrorMessage("Impossible de charger votre profil athlète.");
        setAthlete(null);
        setAthleteIndex(null);
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
      </article>
    </section>
  );
}
