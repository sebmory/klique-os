"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AthleteProfileView,
  type AthleteProfileData,
  type AthleteProfileDistinction,
  type AthleteProfileNomination,
} from "@/components/athletes/AthleteProfileView";

type AthleteProfilePreviewScreenProps = {
  athleteId: string;
};

type ClerkAccessPayload = {
  ok?: boolean;
  permissions?: {
    isAdmin?: boolean | null;
    isActive?: boolean | null;
  } | null;
};

type AthletesPayload = {
  athletes?: AthleteProfileData[];
  source?: string;
  message?: string;
  memberIndex?: number | null;
};

type AthleteDistinctionsPayload = {
  distinctions?: AthleteProfileDistinction[];
  nominations?: AthleteProfileNomination[];
};

export function AthleteProfilePreviewScreen({ athleteId }: AthleteProfilePreviewScreenProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfileData | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [distinctions, setDistinctions] = useState<AthleteProfileDistinction[]>([]);
  const [nominations, setNominations] = useState<AthleteProfileNomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPreview = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const accessResponse = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!accessResponse.ok) {
          throw new Error("Impossible de vérifier vos permissions.");
        }

        const accessPayload = (await accessResponse.json()) as ClerkAccessPayload;
        const adminAllowed = Boolean(accessPayload?.permissions?.isAdmin && accessPayload?.permissions?.isActive);

        if (!active) return;
        setIsAdmin(adminAllowed);

        if (!adminAllowed) {
          setErrorMessage("Cette prévisualisation est réservée aux administrateurs.");
          return;
        }

        const [athletesResponse, distinctionsResponse] = await Promise.all([
          fetch(`/api/athletes?memberId=${encodeURIComponent(athleteId)}`, { credentials: "include", cache: "no-store" }),
          fetch(`/api/athlete-distinctions?athleteId=${encodeURIComponent(athleteId)}&includeNominations=1`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        if (!athletesResponse.ok) {
          throw new Error("Impossible de récupérer les données de cet athlète.");
        }

        const athletesPayload = (await athletesResponse.json()) as AthletesPayload;
        let distinctionsPayload: AthleteDistinctionsPayload = {};
        try {
          distinctionsPayload = (await distinctionsResponse.json()) as AthleteDistinctionsPayload;
        } catch {
          distinctionsPayload = {};
        }

        const athletes = athletesPayload?.athletes ?? [];
        const resolvedAthlete = athletes.find((item) => item.key === athleteId) ?? null;
        const resolvedIndex = typeof athletesPayload.memberIndex === "number" ? athletesPayload.memberIndex : null;

        if (!active) return;

        if (!resolvedAthlete) {
          setErrorMessage("Athlète introuvable pour cet identifiant.");
          setAthlete(null);
          return;
        }

        setAthlete(resolvedAthlete);
        setAthleteIndex(resolvedIndex);
        setDistinctions(Array.isArray(distinctionsPayload.distinctions) ? distinctionsPayload.distinctions : []);
        setNominations(Array.isArray(distinctionsPayload.nominations) ? distinctionsPayload.nominations : []);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger la prévisualisation.");
        setAthlete(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPreview();

    return () => {
      active = false;
    };
  }, [athleteId]);

  if (loading) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: "980px", margin: "0 auto" }}>
        <p style={{ margin: 0, color: "#4b5563" }}>Chargement de la prévisualisation…</p>
      </div>
    );
  }

  if (!isAdmin || errorMessage || !athlete) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: "980px", margin: "0 auto", display: "grid", gap: "0.6rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.4rem", color: "#111827" }}>Prévisualisation Admin</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{errorMessage ?? "Impossible d’afficher cette prévisualisation."}</p>
        <Link href={`/crm/personnes/${encodeURIComponent(athleteId)}`} style={{ color: "#4f46e5" }}>
          Retour à la fiche CRM
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ padding: "0 1.25rem", maxWidth: "980px", margin: "0 auto", width: "100%" }}>
        <Link href={`/crm/personnes/${encodeURIComponent(athleteId)}`} style={{ color: "#4f46e5", fontSize: "0.85rem", fontWeight: 700 }}>
          ← Retour à la fiche CRM
        </Link>
      </div>
      <AthleteProfileView
        athlete={athlete}
        athleteIndex={athleteIndex}
        distinctions={distinctions}
        nominations={nominations}
        eyebrow="Vue Admin"
        title={athlete.name ? `Profil de ${athlete.name}` : "Profil Athlète"}
        previewNotice="Prévisualisation Admin"
      />
    </div>
  );
}
