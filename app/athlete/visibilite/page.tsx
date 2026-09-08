"use client";

import { useEffect, useState } from "react";
import type { KliqueVisibilityFormat, KliqueVisibilityFormatBreakdownRow, KliqueVisibilityNetwork } from "@/lib/klique-visibility";

const GOLD = "#e8b84b";
const BORDER = "rgba(255, 255, 255, 0.09)";
const MUTED = "#9ca3af";

type OwnPublication = {
  id: string;
  format: KliqueVisibilityFormat;
  network: KliqueVisibilityNetwork;
  publishedAt: string;
  link: string | null;
};

type VisibilityPayload = {
  publications: OwnPublication[];
  totals: { totalTracked: number; totalHistorical: number; combinedTotal: number };
  formatBreakdown: KliqueVisibilityFormatBreakdownRow[];
  error?: string;
};

const formatLabels: Record<KliqueVisibilityFormat, string> = {
  photo: "Photo",
  video: "Vidéo",
  carousel: "Carrousel",
  story: "Story",
  reel: "Reel",
  article: "Article",
  live: "Live",
  other: "Autre",
};

const networkLabels: Record<KliqueVisibilityNetwork, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  website: "Site web",
  other: "Autre",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "long", year: "numeric" });
const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
};

export default function AthleteVisibilityPage() {
  const [payload, setPayload] = useState<VisibilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/athlete/klique-visibility", { credentials: "include", cache: "no-store" });
        const data = (await response.json().catch(() => null)) as VisibilityPayload | null;
        if (!response.ok) throw new Error(data?.error || "Impossible de charger votre visibilité.");
        if (active) setPayload(data);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Impossible de charger votre visibilité.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const visibleFormats = payload?.formatBreakdown.filter((row) => row.combined > 0) ?? [];

  return (
    <section style={{ padding: "1.5rem", maxWidth: "1180px", margin: "0 auto", display: "grid", gap: "1.25rem", background: "#0a0b0f", borderRadius: "24px" }}>
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, fontWeight: 700 }}>Espace Athlète</p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Ma visibilité</h1>
        <p style={{ margin: 0, color: MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "68ch" }}>
          Le suivi des contenus que KLIQUE a partagés à votre sujet : publications suivies au jour le jour et reprise de l’historique antérieur.
        </p>
        <aside style={{ marginTop: "0.2rem", padding: "0.85rem 0.95rem", border: `1px solid ${BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.035)" }}>
          <p style={{ margin: 0, color: "#d1d5db", fontSize: "0.86rem", lineHeight: 1.55 }}>
            Ces chiffres comptent les contenus partagés par KLIQUE à votre sujet, pas les vues ni la portée sur les réseaux sociaux.
          </p>
        </aside>
      </header>

      {loading ? (
        <p style={{ margin: 0, color: MUTED }} aria-live="polite">Chargement de votre visibilité…</p>
      ) : errorMessage || !payload ? (
        <p role="alert" style={{ margin: 0, border: "1px solid rgba(248, 113, 113, 0.35)", background: "rgba(248, 113, 113, 0.12)", color: "#fecaca", borderRadius: "8px", padding: "0.8rem 0.9rem" }}>
          {errorMessage}
        </p>
      ) : (
        <>
          <section style={{ display: "grid", gap: "0.7rem" }}>
            <h2 style={{ margin: 0, color: "#f8fafc", fontSize: "1.1rem" }}>Compteurs</h2>
            <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.025)", padding: "0.9rem" }}>
                <small style={{ color: MUTED, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Suivi détaillé</small>
                <strong style={{ display: "block", marginTop: 6, color: "#f8fafc", fontSize: "1.3rem" }}>{payload.totals.totalTracked}</strong>
              </div>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.025)", padding: "0.9rem" }}>
                <small style={{ color: MUTED, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Historique</small>
                <strong style={{ display: "block", marginTop: 6, color: "#f8fafc", fontSize: "1.3rem" }}>{payload.totals.totalHistorical}</strong>
              </div>
              <div style={{ border: `1px solid rgba(232, 184, 75, 0.35)`, borderRadius: "8px", background: "rgba(232, 184, 75, 0.08)", padding: "0.9rem" }}>
                <small style={{ color: "#fde68a", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total combiné</small>
                <strong style={{ display: "block", marginTop: 6, color: "#f8fafc", fontSize: "1.3rem" }}>{payload.totals.combinedTotal}</strong>
              </div>
            </div>

            {visibleFormats.length > 0 ? (
              <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {visibleFormats.map((row) => (
                  <div key={row.format} style={{ border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "0.7rem 0.85rem", display: "grid", gap: 4 }}>
                    <strong style={{ color: "#f8fafc", fontSize: "0.9rem" }}>{formatLabels[row.format]}</strong>
                    <span style={{ color: MUTED, fontSize: "0.82rem" }}>Suivi détaillé : {row.tracked} · Historique : {row.historical}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section aria-labelledby="my-publications-title" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "1.25rem", display: "grid", gap: "0.7rem" }}>
            <h2 id="my-publications-title" style={{ margin: 0, color: "#f8fafc", fontSize: "1.1rem" }}>Publications suivies</h2>
            {payload.publications.length === 0 ? (
              <p style={{ margin: 0, color: MUTED }}>Aucune publication suivie pour le moment.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.55rem" }}>
                {payload.publications.map((publication) => (
                  <article key={publication.id} style={{ border: `1px solid ${BORDER}`, borderRadius: "8px", background: "rgba(255, 255, 255, 0.025)", padding: "0.75rem 0.9rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.6rem", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "0.9rem" }}>{formatDate(publication.publishedAt)}</span>
                      <span style={{ borderRadius: "999px", padding: "0.2rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, color: "#d1d5db", border: `1px solid ${BORDER}`, background: "rgba(255, 255, 255, 0.04)" }}>{networkLabels[publication.network]}</span>
                      <span style={{ borderRadius: "999px", padding: "0.2rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, color: "#d1d5db", border: `1px solid ${BORDER}`, background: "rgba(255, 255, 255, 0.04)" }}>{formatLabels[publication.format]}</span>
                    </div>
                    {publication.link ? (
                      <a href={publication.link} target="_blank" rel="noreferrer" style={{ color: GOLD, fontSize: "0.85rem", fontWeight: 700 }}>Voir la publication</a>
                    ) : (
                      <span style={{ color: MUTED, fontSize: "0.82rem" }}>Aucun lien disponible</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
