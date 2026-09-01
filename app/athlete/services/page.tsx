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
          Découvrez les prestations KLIQUE accessibles aux membres. Chaque prestation achetée reste valable pendant 12 mois.
        </p>
        {catalog ? (
          <p style={{ margin: "0.2rem 0 0", color: "#d1d5db", fontSize: "0.9rem" }}>
            {catalog.membership.active
              ? `Plan actuel : ${catalog.membership.planName || "adhésion membre"} · ${catalog.membership.productionCreditBalance} crédit(s) production · ${catalog.membership.customContentCreditBalance} crédit(s) contenu personnalisé`
              : "Aucune adhésion active"}
          </p>
        ) : null}
      </header>

      {loading ? (
        <p style={{ margin: 0, color: TEXT_MUTED }} aria-live="polite">Chargement des services…</p>
      ) : errorMessage ? (
        <p role="alert" style={{ margin: 0, border: "1px solid rgba(248, 113, 113, 0.35)", background: "rgba(248, 113, 113, 0.12)", color: "#fecaca", borderRadius: "14px", padding: "0.8rem 0.9rem" }}>
          {errorMessage}
        </p>
      ) : catalog ? (
        <div style={{ display: "grid", gap: "0.9rem", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
          {catalog.services.map((service) => (
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
                {service.creditOption ? (
                  <span style={{ color: service.creditOption.sufficient ? "#fde68a" : TEXT_MUTED, fontWeight: 700, fontSize: "0.86rem" }}>
                    {service.creditOption.eligibleWithPlan
                      ? service.creditOption.sufficient
                        ? `Inclus avec ${service.creditOption.label}`
                        : `Droit membre : ${service.creditOption.label} requis (solde insuffisant)`
                      : `${service.creditOption.label} avec Impact ou Signature`}
                  </span>
                ) : null}
                <span style={{ color: KLIQUE_GOLD, fontWeight: 800, fontSize: "0.9rem" }}>
                  {service.creditOption && !service.creditOption.eligibleWithPlan
                    ? `Tarif membre avec Impact ou Signature · ${service.memberPriceLabel}`
                    : `À la carte · ${service.memberPriceLabel}`}
                </span>
              </div>

              <div style={{ display: "grid", gap: "0.25rem", color: TEXT_MUTED, fontSize: "0.82rem" }}>
                <span>Validité : {service.validityLabel}</span>
                {service.includedDeliverables > 1 ? <span>{service.includedDeliverables} livrables inclus</span> : null}
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
          ))}
        </div>
      ) : null}
    </section>
  );
}
