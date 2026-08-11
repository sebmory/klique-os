"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { buildMembershipState } from "@/lib/membership";

type AthleteSummary = {
  key?: string;
  name?: string;
  sport?: string;
  adhesionDate?: string;
};

type AthletesPayload = {
  athletes?: AthleteSummary[];
  source?: string;
  message?: string;
  memberIndex?: number | null;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const formatValue = (value: unknown): string => normalize(value) || "Non renseigné";

export default function VerifyMemberPage() {
  const params = useParams<{ memberId?: string }>();
  const [athlete, setAthlete] = useState<AthleteSummary | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const memberId = params?.memberId ?? "";

  useEffect(() => {
    let active = true;

    const loadAthlete = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        if (!memberId) {
          throw new Error("Identifiant membre introuvable.");
        }

        const response = await fetch(`/api/athletes?memberId=${encodeURIComponent(memberId)}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Impossible de vérifier ce Pass KLIQUE.");
        }

        const payload = (await response.json()) as AthletesPayload;
        const resolvedAthlete = (payload?.athletes ?? []).find((item) => item.key === memberId) ?? null;

        if (!active) return;
        if (!resolvedAthlete) {
          setAthlete(null);
          setAthleteIndex(null);
          setErrorMessage("Membre introuvable ou Pass non vérifiable");
          return;
        }

        setAthlete(resolvedAthlete);
        setAthleteIndex(typeof payload.memberIndex === "number" ? payload.memberIndex : null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Membre introuvable ou Pass non vérifiable");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAthlete();

    return () => {
      active = false;
    };
  }, [memberId]);

  const membershipSummary = useMemo(() => {
    const state = buildMembershipState({
      startDate: athlete?.adhesionDate,
      isInitialFreeYearEligible: athleteIndex !== null && athleteIndex < 16,
    });

    return {
      statusLabel: state.isActive ? "Adhésion KLIQUE active" : "Adhésion expirée / non vérifiée",
      validityLabel: state.endDateLabel,
      isActive: state.isActive,
    };
  }, [athlete, athleteIndex]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", padding: "1rem", display: "grid", placeItems: "center", background: "#f5f7fb" }}>
        <div style={{ width: "100%", maxWidth: "420px", background: "white", borderRadius: "20px", padding: "1.2rem", boxShadow: "0 12px 30px rgba(17,24,39,0.08)" }}>
          <p style={{ margin: 0, color: "#4b5563" }}>Vérification du Pass…</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !athlete) {
    return (
      <div style={{ minHeight: "100vh", padding: "1rem", display: "grid", placeItems: "center", background: "#f5f7fb" }}>
        <div style={{ width: "100%", maxWidth: "420px", background: "white", borderRadius: "20px", padding: "1.2rem", boxShadow: "0 12px 30px rgba(17,24,39,0.08)" }}>
          <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6b7280" }}>KLIQUE</div>
          <h1 style={{ margin: "0.25rem 0 0.4rem", fontSize: "1.2rem", fontWeight: 800, color: "#111827" }}>Pass non vérifiable</h1>
          <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>{errorMessage ?? "Membre introuvable ou Pass non vérifiable"}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: "1rem", display: "grid", placeItems: "center", background: "#f5f7fb" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "white", borderRadius: "20px", padding: "1.2rem", boxShadow: "0 12px 30px rgba(17,24,39,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6b7280" }}>KLIQUE</div>
            <h1 style={{ margin: "0.25rem 0 0", fontSize: "1.2rem", fontWeight: 800, color: "#111827" }}>Vérification du Pass</h1>
          </div>
          {membershipSummary.isActive ? (
            <span style={{ padding: "0.38rem 0.65rem", borderRadius: "999px", background: "#fef3c7", color: "#92400e", fontWeight: 700, fontSize: "0.8rem" }}>
              Vérifié
            </span>
          ) : null}
        </div>

        <div style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}>
          <div>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Nom</div>
            <div style={{ marginTop: "0.2rem", fontWeight: 700, color: "#111827" }}>{formatValue(athlete.name)}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Sport</div>
            <div style={{ marginTop: "0.2rem", fontWeight: 700, color: "#111827" }}>{formatValue(athlete.sport)}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Statut</div>
            <div style={{ marginTop: "0.2rem", fontWeight: 700, color: "#111827" }}>{membershipSummary.statusLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Date de validité</div>
            <div style={{ marginTop: "0.2rem", fontWeight: 700, color: "#111827" }}>{membershipSummary.validityLabel ?? "Non renseignée"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
