"use client";

import { useEffect, useState } from "react";
import { PersonCockpitScreen } from "@/components/crm/PersonCockpitScreen";

type ClerkAccessPayload = {
  ok?: boolean;
  userAccess?: {
    athleteId?: string | null;
    role?: string | null;
  } | null;
};

export default function AthleteProfilePage() {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/clerk/access", { credentials: "include" });
        if (!response.ok) {
          throw new Error("Impossible de récupérer votre profil.");
        }

        const data = (await response.json()) as ClerkAccessPayload;
        const resolvedAthleteId = data?.userAccess?.athleteId ?? null;

        if (!active) {
          return;
        }

        if (!resolvedAthleteId) {
          setErrorMessage("Aucun profil athlète n’est associé à votre compte.");
          setAthleteId(null);
          return;
        }

        setAthleteId(resolvedAthleteId);
      } catch {
        if (!active) {
          return;
        }
        setErrorMessage("Impossible de charger votre profil athlète.");
        setAthleteId(null);
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
      <div style={{ padding: "2rem" }}>
        <p>Chargement de votre profil…</p>
      </div>
    );
  }

  if (errorMessage || !athleteId) {
    return (
      <div style={{ padding: "2rem" }}>
        <p>{errorMessage ?? "Impossible d’afficher votre profil."}</p>
      </div>
    );
  }

  return <PersonCockpitScreen id={athleteId} />;
}
