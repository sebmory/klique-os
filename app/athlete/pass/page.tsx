"use client";

import { useEffect, useMemo, useState } from "react";
import { KliquePassCard } from "@/components/klique-pass/KliquePassCard";
import type { KliquePassMembership, KliquePassPlanRights } from "@/lib/klique-pass";

type AthleteSummary = {
  key?: string;
  name?: string;
  sport?: string;
  adhesionDate?: string;
};

type AthletePassPayload = {
  athlete?: AthleteSummary;
  athleteIndex?: number | null;
  membership?: KliquePassMembership;
  plan?: KliquePassPlanRights | null;
  error?: string;
};

export default function AthletePassPage() {
  const [athlete, setAthlete] = useState<AthleteSummary | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [membership, setMembership] = useState<KliquePassMembership | null>(null);
  const [plan, setPlan] = useState<KliquePassPlanRights | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPass = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/athletes/membership", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as AthletePassPayload | null;
        if (!response.ok || !payload?.athlete || !payload.membership) {
          throw new Error(payload?.error || "Impossible de charger votre Pass KLIQUE pour le moment.");
        }

        if (!active) return;
        setAthlete(payload.athlete);
        setAthleteIndex(payload.athleteIndex ?? null);
        setMembership(payload.membership);
        setPlan(payload.plan ?? null);
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

      <KliquePassCard
        athlete={membershipSummary.athlete}
        athleteIndex={membershipSummary.athleteIndex}
        membership={membership}
        plan={plan}
      />
    </div>
  );
}
