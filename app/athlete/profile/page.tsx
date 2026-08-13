"use client";

import { useEffect, useState } from "react";
import {
  AthleteProfileView,
  type AthleteProfileData,
  type AthleteProfileDistinction,
  type AthleteProfileNomination,
} from "@/components/athletes/AthleteProfileView";

type ClerkAccessPayload = {
  ok?: boolean;
  userAccess?: {
    athleteId?: string | null;
    role?: string | null;
  } | null;
};

type AthletesPayload = {
  athletes?: AthleteProfileData[];
  source?: string;
  message?: string;
};

type AthleteDistinctionsPayload = {
  distinctions?: AthleteProfileDistinction[];
  nominations?: AthleteProfileNomination[];
  data?: {
    distinctions?: AthleteProfileDistinction[];
    nominations?: AthleteProfileNomination[];
  };
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
  const [athlete, setAthlete] = useState<AthleteProfileData | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [distinctions, setDistinctions] = useState<AthleteProfileDistinction[]>([]);
  const [nominations, setNominations] = useState<AthleteProfileNomination[]>([]);
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
    <AthleteProfileView
      athlete={athlete}
      athleteIndex={athleteIndex}
      distinctions={distinctions}
      nominations={nominations}
    />
  );
}
