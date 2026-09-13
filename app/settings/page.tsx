import Link from "next/link";
import { MediaCreditsSection } from "@/components/settings/MediaCreditsSection";
import { MediaInviteSection } from "@/components/settings/MediaInviteSection";

export default function SettingsPage() {
  return (
    <section style={{ display: "grid", gap: "1rem", maxWidth: "1180px", margin: "0 auto", padding: "0.5rem 0" }}>
      <header>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
          PARAMÈTRES
        </p>
        <h1 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Paramètres du workspace</h1>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6, maxWidth: "70ch" }}>
          Gérez les accès et les réglages de votre workspace KLIQUE.
        </p>
      </header>

      <Link
        href="/settings/notifications"
        style={{
          display: "grid",
          gap: "0.35rem",
          padding: "1.15rem",
          border: "1px solid #f0e2d0",
          borderRadius: "8px",
          background: "#fff",
          boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)",
          color: "inherit",
          textDecoration: "none",
        }}
      >
        <strong style={{ color: "#111827", fontSize: "1.05rem" }}>Notifications et annonces</strong>
        <span style={{ color: "#6b7280", lineHeight: 1.6 }}>
          Envoyer des annonces aux Athlètes, Médias et Partenaires/Experts.
        </span>
      </Link>

      <MediaInviteSection />
      <MediaCreditsSection />
    </section>
  );
}
