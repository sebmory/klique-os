"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import type { AthleteMemberServicesProjection } from "@/lib/athlete-service-catalog";

type AthleteServicesPayload = AthleteMemberServicesProjection & {
  error?: string;
};

const KLIQUE_GOLD = "#e8b84b";
const SURFACE_BORDER = "rgba(255, 255, 255, 0.09)";
const TEXT_MUTED = "#9ca3af";

const formatRightsBalance = (quantity: number, singular: string, plural: string): string =>
  `${quantity} ${quantity === 1 ? singular : plural}`;

const formatUsage = (
  required: number,
  available: number,
  rightType: "production" | "custom_content",
): string => {
  const availableLabel = `${available} disponible${available === 1 ? "" : "s"}`;
  if (rightType === "production" && required === 1 && available === 1) {
    return `Utilise votre production incluse — ${availableLabel}`;
  }
  const rightLabel = rightType === "production"
    ? `${required} production${required === 1 ? "" : "s"} incluse${required === 1 ? "" : "s"}`
    : `${required} contenu${required === 1 ? "" : "s"} personnalisé${required === 1 ? "" : "s"}`;
  return `Utilise ${rightLabel} — ${availableLabel}`;
};

export default function AthleteServicesPage() {
  const [catalog, setCatalog] = useState<AthleteMemberServicesProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadServices = async () => {
      try {
        const response = await fetch("/api/athlete/services", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as AthleteServicesPayload | null;
        if (!response.ok || !payload?.membership || !Array.isArray(payload.services)) {
          throw new Error(payload?.error || "Impossible de charger les services membres.");
        }
        if (!active) return;
        setCatalog({ membership: payload.membership, services: payload.services });
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les services membres.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadServices();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      style={{
        padding: "1.5rem",
        maxWidth: "1180px",
        margin: "0 auto",
        display: "grid",
        gap: "1.25rem",
        background: "#0a0b0f",
        borderRadius: "24px",
      }}
    >
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.14em", color: TEXT_MUTED, fontWeight: 700 }}>
          Espace Athlète
        </p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Services membres</h1>
        <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "68ch" }}>
          Votre abonnement comprend des services inclus chaque année. Les services indiqués comme inclus peuvent être demandés sans paiement supplémentaire et utilisent l’un de vos droits disponibles. Vous pouvez également commander des prestations supplémentaires aux tarifs membres affichés.
        </p>
        {catalog ? (
          <p style={{ margin: "0.2rem 0 0", color: "#d1d5db", fontSize: "0.9rem" }}>
            {catalog.membership.active
              ? `Avec votre abonnement${catalog.membership.planName ? ` ${catalog.membership.planName}` : ""}, il vous reste ${formatRightsBalance(catalog.membership.productionCreditBalance, "production", "productions")} et ${formatRightsBalance(catalog.membership.customContentCreditBalance, "contenu personnalisé", "contenus personnalisés")}.`
              : "Aucune adhésion active"}
          </p>
        ) : null}
        <aside style={{ marginTop: "0.45rem", padding: "0.85rem 0.95rem", border: `1px solid ${SURFACE_BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.035)", display: "grid", gap: "0.3rem" }}>
          <strong style={{ color: "#f8fafc", fontSize: "0.92rem" }}>Votre visibilité habituelle reste incluse</strong>
          <p style={{ margin: 0, color: "#d1d5db", fontSize: "0.86rem", lineHeight: 1.55 }}>
            KLIQUE continue de suivre votre actualité grâce aux formulaires hebdomadaires et mensuels et sélectionne régulièrement des sujets à mettre en avant. Les contenus initiés par KLIQUE dans ce cadre ne sont pas déduits de vos droits.
          </p>
        </aside>
      </header>

      {loading ? (
        <p style={{ margin: 0, color: TEXT_MUTED }} aria-live="polite">Chargement des services…</p>
      ) : errorMessage ? (
        <p role="alert" style={{ margin: 0, border: "1px solid rgba(248, 113, 113, 0.35)", background: "rgba(248, 113, 113, 0.12)", color: "#fecaca", borderRadius: "14px", padding: "0.8rem 0.9rem" }}>
          {errorMessage}
        </p>
      ) : catalog ? (
        <div style={{ display: "grid", gap: "0.9rem", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
          {catalog.services.map((service) => {
            const isMatchUpgrade = service.code === "match_coverage_upgrade";
            const isCustomContentPack = service.code === "custom_content_pack_5";
            const isVideo = service.code === "simple_video_capsule";
            const includedOption = !isCustomContentPack && service.creditOption?.eligibleWithPlan && service.creditOption.sufficient
              ? service.creditOption
              : null;
            const restrictedVideo = isVideo && service.creditOption && !service.creditOption.eligibleWithPlan;
            const showPaidOption = !restrictedVideo && (!isMatchUpgrade || Boolean(includedOption));

            return (
            <article
              key={service.code}
              style={{
                border: `1px solid ${service.available ? "rgba(232, 184, 75, 0.35)" : SURFACE_BORDER}`,
                borderRadius: "18px",
                background: "linear-gradient(160deg, #14151a 0%, #0e0f13 65%, #0a0b0f 100%)",
                padding: "1rem",
                display: "grid",
                gap: "0.7rem",
                alignContent: "start",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <strong style={{ color: "#f8fafc", fontSize: "1.03rem", lineHeight: 1.3 }}>{service.name}</strong>
                </div>
                {service.available ? <CheckCircle2 size={18} color={KLIQUE_GOLD} aria-hidden /> : <LockKeyhole size={18} color="#9ca3af" aria-hidden />}
              </div>

              <p style={{ margin: 0, color: "#d1d5db", lineHeight: 1.55, fontSize: "0.9rem" }}>{service.description}</p>

              <div style={{ display: "grid", gap: "0.3rem", padding: "0.7rem", border: `1px solid ${SURFACE_BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.025)" }}>
                {restrictedVideo ? (
                  <span style={{ color: TEXT_MUTED, fontWeight: 700, fontSize: "0.86rem", lineHeight: 1.45 }}>
                    Nécessite 2 productions disponibles — réservé aux abonnements Impact et Signature
                  </span>
                ) : null}
                {includedOption && !isMatchUpgrade ? (
                  <>
                    <span style={{ color: "#fde68a", fontWeight: 800, fontSize: "0.9rem" }}>Inclus dans votre abonnement</span>
                    <span style={{ color: "#d1d5db", fontWeight: 600, fontSize: "0.84rem", lineHeight: 1.45 }}>
                      {formatUsage(includedOption.creditsRequired, includedOption.availableBalance, includedOption.creditType)}
                    </span>
                  </>
                ) : null}
                {includedOption && isMatchUpgrade ? (
                  <span style={{ color: "#fde68a", fontWeight: 700, fontSize: "0.86rem", lineHeight: 1.45 }}>
                    Transformez 1 production incluse en couverture de match pour CHF 30.
                  </span>
                ) : null}
                {showPaidOption && !isMatchUpgrade ? (
                  <span style={{ color: KLIQUE_GOLD, fontWeight: 800, fontSize: "0.9rem" }}>
                    Service supplémentaire : {service.memberPriceLabel}
                  </span>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: "0.25rem", color: TEXT_MUTED, fontSize: "0.82rem" }}>
                {showPaidOption ? <span>Service supplémentaire valable {service.validityLabel}</span> : null}
              </div>

              <span
                style={{
                  justifySelf: "start",
                  borderRadius: "999px",
                  padding: "0.28rem 0.62rem",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  color: service.available ? "#fde68a" : "#d1d5db",
                  border: `1px solid ${service.available ? "rgba(232, 184, 75, 0.35)" : SURFACE_BORDER}`,
                  background: service.available ? "rgba(232, 184, 75, 0.1)" : "rgba(255, 255, 255, 0.04)",
                }}
              >
                {service.availabilityLabel}
              </span>
            </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
