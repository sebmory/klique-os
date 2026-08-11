"use client";

import { useEffect, useMemo, useState } from "react";
import { KliquePassCard } from "@/components/klique-pass/KliquePassCard";

type AthleteSummary = {
  key?: string;
  name?: string;
  sport?: string;
  adhesionDate?: string;
};

type ClerkAccessPayload = {
  ok?: boolean;
  userAccess?: {
    athleteId?: string | null;
    role?: string | null;
    status?: string | null;
  } | null;
};

type AthletesPayload = {
  athletes?: AthleteSummary[];
  source?: string;
  message?: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const formatValue = (value: unknown): string => normalize(value) || "Non renseigné";

export default function AthletePassPage() {
  const [athlete, setAthlete] = useState<AthleteSummary | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPass = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const accessResponse = await fetch("/api/clerk/access", {
          credentials: "include",
          cache: "no-store",
        });

        if (!accessResponse.ok) {
          throw new Error("Impossible de charger votre Pass KLIQUE.");
        }

        const accessPayload = (await accessResponse.json()) as ClerkAccessPayload;
        const role = accessPayload?.userAccess?.role ?? null;
        const athleteId = accessPayload?.userAccess?.athleteId ?? null;

        if (!active) return;

        if (role !== "athlete") {
          throw new Error("Vous n’avez pas les permissions nécessaires pour consulter votre Pass KLIQUE.");
        }

        if (!athleteId) {
          throw new Error("Aucun profil athlète n’est associé à votre compte.");
        }

        const athletesResponse = await fetch("/api/athletes", {
          credentials: "include",
          cache: "no-store",
        });

        if (!athletesResponse.ok) {
          throw new Error("Impossible de récupérer vos données de membre.");
        }

        const athletesPayload = (await athletesResponse.json()) as AthletesPayload;
        const athletes = athletesPayload?.athletes ?? [];
        const resolvedAthlete = athletes.find((item) => item.key === athleteId) ?? null;
        const resolvedIndex = resolvedAthlete ? athletes.findIndex((item) => item.key === athleteId) : null;

        if (!active) return;
        if (!resolvedAthlete) {
          setAthlete(null);
          setErrorMessage("Aucune donnée athlète n’a été retrouvée pour votre compte.");
          return;
        }

        setAthlete(resolvedAthlete);
        setAthleteIndex(resolvedIndex);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible d’afficher votre Pass KLIQUE.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPass();

    return () => {
      active = false;
    };
  }, []);

  const membershipSummary = useMemo(() => {
    return {
      athlete: {
        key: athlete?.key,
        name: athlete?.name,
        sport: athlete?.sport,
        adhesionDate: athlete?.adhesionDate,
      },
      athleteIndex,
    };
  }, [athlete, athleteIndex]);

  if (loading) {
    return (
      <div style={{ padding: "1.25rem", maxWidth: "720px", margin: "0 auto" }}>
        <p style={{ margin: 0, color: "#4b5563" }}>Chargement de votre Pass KLIQUE…</p>
      </div>
    );
  }

  if (errorMessage || !athlete) {
    return (
      <div style={{ padding: "1.25rem", maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.45rem", color: "#111827" }}>Mon Pass KLIQUE</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{errorMessage ?? "Aucune donnée disponible pour le moment."}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.25rem", maxWidth: "760px", margin: "0 auto", display: "grid", gap: "1rem" }}>
      <div>
        <p style={{ margin: 0, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Pass membre</p>
        <h1 style={{ margin: "0.3rem 0 0", fontSize: "1.45rem", fontWeight: 800, color: "#111827" }}>Mon Pass KLIQUE</h1>
        <p style={{ margin: "0.35rem 0 0", color: "#4b5563", lineHeight: 1.6 }}>
          Présentez ce Pass directement à un partenaire ou expert pour prouver votre adhésion KLIQUE.
        </p>
      </div>

      <KliquePassCard athlete={membershipSummary.athlete} athleteIndex={membershipSummary.athleteIndex} />
    </div>
  );
}
