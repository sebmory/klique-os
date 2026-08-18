"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KLIQUE_GOLD = "#e8b84b";
const SURFACE_BORDER = "rgba(255, 255, 255, 0.09)";
const TEXT_MUTED = "#9ca3af";

type OpportunityItem = {
  id: string;
  title: string;
  type: string;
  organization: string;
  location: string;
  date: string;
  deadline: string;
  status: string;
  description: string;
  createdAt: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const publishedStatuses = ["Ouverte", "Bientôt", "Fermée"];

export default function AthleteOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/hub-opportunities", { credentials: "include", cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load opportunities");

        const payload = (await response.json()) as { opportunities?: Array<Record<string, unknown>> };
        if (!active) return;

        setOpportunities(
          (payload.opportunities ?? [])
            .map((item) => ({
              id: normalize(item.id),
              title: normalize(item.title),
              type: normalize(item.type) || "Autre",
              organization: normalize(item.organization),
              location: normalize(item.location),
              date: normalize(item.date),
              deadline: normalize(item.deadline),
              status: normalize(item.status),
              description: normalize(item.description),
              createdAt: normalize(item.createdAt),
            }))
            .filter((item) => item.id && item.title && publishedStatuses.includes(item.status)),
        );
      } catch {
        if (!active) return;
        setOpportunities([]);
        setErrorMessage("Les opportunités n’ont pas pu être chargées.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

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
          Espace Athlete
        </p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Opportunités</h1>
        <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "62ch" }}>
          Les projets, shootings et collaborations ouverts aux membres KLIQUE.
        </p>
      </header>

      {loading ? (
        <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.92rem" }} aria-live="polite">Chargement des opportunités…</p>
      ) : errorMessage ? (
        <p role="alert" style={{ margin: 0, borderRadius: "14px", border: "1px solid rgba(248, 113, 113, 0.35)", background: "rgba(248, 113, 113, 0.12)", color: "#fecaca", padding: "0.8rem 0.9rem", fontSize: "0.92rem" }}>
          {errorMessage}
        </p>
      ) : opportunities.length === 0 ? (
        <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.92rem" }}>
          Aucune opportunité n’est disponible pour le moment.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.9rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {opportunities.map((opportunity) => (
            <Link
              key={opportunity.id}
              href={`/athlete/opportunities/${encodeURIComponent(opportunity.id)}`}
              style={{
                border: `1px solid ${SURFACE_BORDER}`,
                borderRadius: "18px",
                background: "linear-gradient(160deg, #14151a 0%, #0e0f13 60%, #0a0b0f 100%)",
                padding: "1rem",
                display: "grid",
                gap: "0.55rem",
                alignContent: "start",
                textDecoration: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.68rem", color: KLIQUE_GOLD, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700 }}>
                  {opportunity.type}
                </span>
                <span style={{ borderRadius: "999px", padding: "0.16rem 0.55rem", fontSize: "0.68rem", fontWeight: 700, background: "rgba(255, 255, 255, 0.06)", color: "#d1d5db", border: `1px solid ${SURFACE_BORDER}` }}>
                  {opportunity.status}
                </span>
              </div>

              <strong style={{ color: "#f8fafc", fontSize: "1.02rem", lineHeight: 1.3 }}>{opportunity.title}</strong>

              <div style={{ display: "grid", gap: "0.2rem", color: TEXT_MUTED, fontSize: "0.86rem" }}>
                <span>Date : {opportunity.date || "Non renseignée"}</span>
                <span>Lieu : {opportunity.location || "Non renseigné"}</span>
                <span>Deadline : {opportunity.deadline || "Non renseignée"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
