"use client";

import { useMemo } from "react";
import { buildKliquePassViewModel } from "@/lib/klique-pass";

type KliquePassAthlete = {
  key?: string;
  name?: string;
  sport?: string;
  adhesionDate?: string;
};

type KliquePassCardProps = {
  athlete: KliquePassAthlete | null;
  athleteIndex: number | null;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const formatValue = (value: unknown): string => normalize(value) || "Non renseigné";

export function KliquePassCard({ athlete, athleteIndex }: KliquePassCardProps) {
  const membershipSummary = useMemo(() => {
    return buildKliquePassViewModel({
      athlete: {
        key: athlete?.key,
        name: athlete?.name,
        sport: athlete?.sport,
        adhesionDate: athlete?.adhesionDate,
      },
      athleteIndex,
    });
  }, [athlete, athleteIndex]);

  const isActive = membershipSummary.isActive;

  return (
    <section
      style={{
        borderRadius: "24px",
        padding: "1rem",
        background: "linear-gradient(135deg, #111827 0%, #1f2937 45%, #4f46e5 100%)",
        color: "white",
        boxShadow: "0 20px 45px rgba(17, 24, 39, 0.25)",
        display: "grid",
        gap: "0.95rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "rgba(255,255,255,0.18)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "1rem" }}>
            K
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", letterSpacing: "0.12em", opacity: 0.9, textTransform: "uppercase" }}>KLIQUE</div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>Membre KLIQUE</div>
          </div>
        </div>
        <div style={{ padding: "0.4rem 0.7rem", borderRadius: "999px", background: "rgba(255,255,255,0.16)", fontSize: "0.8rem", fontWeight: 700, whiteSpace: "nowrap" }}>
          MEMBRE KLIQUE
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.35rem" }}>
        <div style={{ fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.8 }}>Nom du membre</div>
        <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{formatValue(athlete?.name)}</div>
      </div>

      <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "16px", padding: "0.75rem" }}>
          <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>Sport</div>
          <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{formatValue(athlete?.sport)}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "16px", padding: "0.75rem" }}>
          <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>Statut</div>
          <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{membershipSummary.statusLabel}</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "16px", padding: "0.75rem" }}>
          <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>Date d’adhésion</div>
          <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{membershipSummary.adhesionLabel}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "16px", padding: "0.75rem" }}>
          <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>Valable jusqu’au</div>
          <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{membershipSummary.validityLabel ?? "Non renseignée"}</div>
        </div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.18)", borderRadius: "16px", padding: "0.8rem", background: "rgba(255,255,255,0.08)", color: "#f9fafb", lineHeight: 1.6 }}>
        Ce Pass confirme votre adhésion KLIQUE. Présentez-le à un partenaire ou expert pour bénéficier des avantages réservés aux membres.
      </div>

      {isActive ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.55rem 0.8rem", borderRadius: "999px", background: "#fef3c7", color: "#92400e", alignSelf: "flex-start", fontWeight: 700 }}>
          ✓ Adhésion vérifiée
        </div>
      ) : (
        <div style={{ border: "1px solid rgba(255,255,255,0.22)", borderRadius: "16px", padding: "0.8rem", background: "rgba(255,255,255,0.1)", color: "#fef2f2", lineHeight: 1.5 }}>
          Pass expiré ou adhésion non vérifiée. Les avantages membres nécessitent une adhésion active.
        </div>
      )}
    </section>
  );
}
