"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { MapPin, Target, Image as ImageIcon, Award, MessageSquareText, Mail, Phone, Sparkles } from "lucide-react";
import { buildMembershipState } from "@/lib/membership";

export type AthleteProfileData = {
  key?: string;
  name?: string;
  initials?: string;
  sport?: string;
  club?: string;
  status?: string;
  position?: string;
  nationality?: string;
  birthDate?: string;
  palmares?: string;
  heightWeight?: string;
  objective?: string;
  longTerm?: string;
  desiredAreas?: string;
  instagram?: string;
  email?: string;
  phone?: string;
  adhesionDate?: string;
  profilePortraitUrl?: string;
  kliqueArrivalVisualUrl?: string;
};

export type AthleteProfileDistinction = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  awardedAt: string;
  description: string | null;
};

export type AthleteProfileNomination = {
  id: string;
  athleteId: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  nominatedAt: string;
  reason: string | null;
};

type AthleteProfileViewProps = {
  athlete: AthleteProfileData;
  athleteIndex: number | null;
  distinctions: AthleteProfileDistinction[];
  nominations: AthleteProfileNomination[];
  eyebrow?: string;
  title?: string;
  previewNotice?: string;
};

const readValue = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
};

const readMeaningfulValue = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (normalized === "a definir" || normalized === "a définir" || normalized === "à définir") {
    return null;
  }
  return text;
};

const splitDesiredAreas = (value: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const toInstagramLink = (value: string): string => {
  const cleaned = value.trim();
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return cleaned;
  }
  const handle = cleaned.startsWith("@") ? cleaned.slice(1) : cleaned;
  return `https://instagram.com/${handle}`;
};

const computeInitials = (name: string): string => {
  const source = name.trim();
  if (!source) return "--";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "--";
};

const getDistinctionTypeLabel = (type: string): string => {
  if (type === "athlete_of_the_month") return "Athlete KLIQUE du mois";
  return type;
};

const formatMonthYear = (month: number, year: number): string => {
  const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  const label = months[month - 1] ?? "mois";
  return `${label} ${year}`;
};

const formatHeightWeight = (value: string): string => {
  const cleaned = value.replace(/~/g, "").trim();
  if (!cleaned) return "";
  return cleaned
    .split("/")
    .map((part) => part.trim().replace(/(\d)\s*(cm|kg|m)\b/gi, "$1 $2"))
    .filter(Boolean)
    .join(" · ");
};

const KLIQUE_GOLD = "#e8b84b";
const SURFACE_BORDER = "rgba(255, 255, 255, 0.09)";
const SURFACE_BG = "rgba(255, 255, 255, 0.035)";
const TEXT_MUTED = "#9ca3af";

const cardStyle: CSSProperties = {
  border: `1px solid ${SURFACE_BORDER}`,
  borderRadius: "18px",
  background: SURFACE_BG,
  padding: "1.1rem",
  display: "grid",
  gap: "0.7rem",
  alignContent: "start",
};

const labelStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.72rem",
  color: KLIQUE_GOLD,
  textTransform: "uppercase",
  letterSpacing: "0.09em",
  fontWeight: 700,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  color: "#f8fafc",
  fontWeight: 700,
  letterSpacing: "0.01em",
};

function SectionTitle({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <h3 style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: "0.45rem" }}>
      <Icon size={15} color={KLIQUE_GOLD} aria-hidden style={{ flexShrink: 0 }} />
      {children}
    </h3>
  );
}

export function AthleteProfileView({
  athlete,
  athleteIndex,
  distinctions,
  nominations,
  eyebrow = "Espace Athlete",
  title = "Mon profil",
  previewNotice,
}: AthleteProfileViewProps) {
  const membership = useMemo(() => {
    return buildMembershipState({
      startDate: athlete.adhesionDate,
      isInitialFreeYearEligible: athleteIndex !== null && athleteIndex < 16,
    });
  }, [athlete.adhesionDate, athleteIndex]);

  const profileName = readValue(athlete.name) ?? "Profil athlète";
  const initials = computeInitials(String(athlete.name ?? ""));
  const sport = readValue(athlete.sport);
  const club = readValue(athlete.club);
  const position = readValue(athlete.position);
  const nationality = readValue(athlete.nationality);
  const birthDate = readValue(athlete.birthDate);
  const palmares = readValue(athlete.palmares);
  const heightWeight = readValue(athlete.heightWeight);
  const displayedHeightWeight = heightWeight ? formatHeightWeight(heightWeight) : null;
  const objective = readMeaningfulValue(athlete.objective);
  const longTerm = readMeaningfulValue(athlete.longTerm);
  const desiredAreas = splitDesiredAreas(readMeaningfulValue(athlete.desiredAreas));
  const email = readValue(athlete.email);
  const phone = readValue(athlete.phone);
  const instagram = readValue(athlete.instagram);
  const profilePortraitUrl = readValue(athlete.profilePortraitUrl);
  const kliqueArrivalVisualUrl = readValue(athlete.kliqueArrivalVisualUrl);
  const hasParcours = Boolean(nationality || birthDate || palmares || heightWeight);
  const hasObjectives = Boolean(objective || longTerm || desiredAreas.length > 0);
  const hasContact = Boolean(email || phone || instagram);
  const hasDistinctionData = nominations.length > 0 || distinctions.length > 0;
  const hasArrival = Boolean(kliqueArrivalVisualUrl);
  // Array shape kept extensible so future badges (fondateur, abonnement, ...) can be appended without a rewrite.
  const membershipBadges = [
    {
      label: membership.statusLabel === "Non renseignée" ? "Membre KLIQUE" : `Membre KLIQUE · ${membership.statusLabel}`,
      isActive: membership.isActive,
    },
  ];

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
          {eyebrow}
        </p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>{title}</h1>
        {previewNotice ? (
          <p
            style={{
              margin: 0,
              display: "inline-flex",
              width: "fit-content",
              borderRadius: "999px",
              padding: "0.3rem 0.7rem",
              fontSize: "0.74rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "rgba(99, 102, 241, 0.16)",
              color: "#a5b4fc",
              border: "1px solid rgba(99, 102, 241, 0.4)",
            }}
          >
            {previewNotice}
          </p>
        ) : null}
      </header>

      {/* HERO */}
      <article
        style={{
          position: "relative",
          border: `1px solid ${SURFACE_BORDER}`,
          borderRadius: "22px",
          background: "linear-gradient(160deg, #14151a 0%, #0e0f13 60%, #0a0b0f 100%)",
          display: "grid",
          gridTemplateColumns: "minmax(200px, 280px) 1fr auto",
          alignItems: "stretch",
          gap: "0",
          overflow: "hidden",
          minHeight: "260px",
          boxShadow: "0 24px 60px -30px rgba(0, 0, 0, 0.85)",
        }}
        className="athlete-profile-hero"
      >
        {/* Subtle decorative orbits, CSS only */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "-70px",
            left: "60px",
            width: "260px",
            height: "260px",
            borderRadius: "999px",
            border: "1px solid rgba(232, 184, 75, 0.16)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            bottom: "-90px",
            left: "-40px",
            width: "220px",
            height: "220px",
            borderRadius: "999px",
            border: "1px solid rgba(232, 184, 75, 0.1)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }} className="athlete-profile-hero-portrait">
          {profilePortraitUrl ? (
            <>
              <img
                src={profilePortraitUrl}
                alt={profileName}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  display: "block",
                }}
              />
              {/* Blends a possibly white photo background into the dark Hero without touching the source file */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to right, rgba(10,11,15,0) 55%, #0e0f13 100%), linear-gradient(to bottom, rgba(10,11,15,0.25) 0%, rgba(10,11,15,0) 22%, rgba(10,11,15,0) 78%, rgba(10,11,15,0.45) 100%)",
                  pointerEvents: "none",
                }}
              />
            </>
          ) : (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(232, 184, 75, 0.1)",
                color: KLIQUE_GOLD,
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: "2.4rem",
                letterSpacing: "0.04em",
              }}
            >
              {initials}
            </div>
          )}
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "grid", gap: "0.7rem", minWidth: 0, alignContent: "center", padding: "1.5rem" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "2.1rem", color: "#f8fafc", lineHeight: 1.1, fontWeight: 800 }}>{profileName}</h2>
            {sport || club || position ? (
              <p style={{ margin: "0.45rem 0 0", color: "#d1d5db", fontSize: "1.05rem" }}>
                {[sport, club, position].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {membershipBadges.map((badge) => (
              <span
                key={badge.label}
                style={{
                  borderRadius: "999px",
                  padding: "0.32rem 0.75rem",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: badge.isActive ? "rgba(232, 184, 75, 0.16)" : "rgba(255, 255, 255, 0.06)",
                  color: badge.isActive ? KLIQUE_GOLD : "#d1d5db",
                  border: badge.isActive ? "1px solid rgba(232, 184, 75, 0.45)" : `1px solid ${SURFACE_BORDER}`,
                }}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "grid", alignContent: "start", justifyItems: "end", padding: "1.5rem" }}>
          <Link
            href="/athlete/pass"
            style={{
              border: `1px solid ${KLIQUE_GOLD}`,
              borderRadius: "999px",
              padding: "0.55rem 1rem",
              fontWeight: 700,
              color: "#0a0b0f",
              background: KLIQUE_GOLD,
              textDecoration: "none",
              fontSize: "0.88rem",
              whiteSpace: "nowrap",
            }}
          >
            Voir Mon Pass KLIQUE
          </Link>
        </div>
      </article>

      {/* CONTENT GRID — row 1 */}
      {hasParcours || hasObjectives || hasArrival ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${[hasParcours, hasObjectives, hasArrival].filter(Boolean).length}, 1fr)`,
            gap: "1rem",
          }}
          className="athlete-profile-row"
        >
          {hasParcours ? (
            <section style={cardStyle}>
              <SectionTitle icon={MapPin}>Mon parcours</SectionTitle>
              <div style={{ display: "grid", gap: "0.55rem" }}>
                {nationality ? (
                  <div>
                    <p style={labelStyle}>Nationalité</p>
                    <p style={{ margin: "0.15rem 0 0", color: "#f1f5f9", fontWeight: 600 }}>{nationality}</p>
                  </div>
                ) : null}
                {birthDate ? (
                  <div>
                    <p style={labelStyle}>Date de naissance</p>
                    <p style={{ margin: "0.15rem 0 0", color: "#f1f5f9", fontWeight: 600 }}>{birthDate}</p>
                  </div>
                ) : null}
                {heightWeight ? (
                  <div>
                    <p style={labelStyle}>Taille et poids</p>
                    <p style={{ margin: "0.15rem 0 0", color: "#f1f5f9", fontWeight: 600 }}>{displayedHeightWeight}</p>
                  </div>
                ) : null}
                {palmares ? (
                  <div>
                    <p style={labelStyle}>Palmarès</p>
                    <p style={{ margin: "0.15rem 0 0", color: "#e5e7eb", lineHeight: 1.5 }}>{palmares}</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {hasObjectives ? (
            <section style={cardStyle}>
              <SectionTitle icon={Target}>Mes objectifs</SectionTitle>
              {objective ? (
                <div>
                  <p style={labelStyle}>Objectif actuel</p>
                  <p style={{ margin: "0.2rem 0 0", color: "#f8fafc", fontWeight: 700, fontSize: "1.02rem", lineHeight: 1.4 }}>{objective}</p>
                </div>
              ) : null}
              {longTerm ? (
                <div>
                  <p style={labelStyle}>Ambition long terme</p>
                  <p style={{ margin: "0.2rem 0 0", color: "#e5e7eb", fontWeight: 600, lineHeight: 1.4 }}>{longTerm}</p>
                </div>
              ) : null}
              {desiredAreas.length > 0 ? (
                <div>
                  <p style={labelStyle}>Axes d'accompagnement souhaités</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.3rem" }}>
                    {desiredAreas.map((area) => (
                      <span
                        key={area}
                        style={{
                          borderRadius: "999px",
                          border: `1px solid ${SURFACE_BORDER}`,
                          padding: "0.28rem 0.6rem",
                          fontSize: "0.82rem",
                          color: "#e5e7eb",
                          background: "rgba(255, 255, 255, 0.04)",
                        }}
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {hasArrival ? (
            <section style={cardStyle}>
              <SectionTitle icon={ImageIcon}>Mon arrivée dans KLIQUE</SectionTitle>
              <a href={kliqueArrivalVisualUrl!} target="_blank" rel="noreferrer" style={{ display: "grid", gap: "0.5rem", justifyItems: "start" }}>
                <img
                  src={kliqueArrivalVisualUrl!}
                  alt="Visuel d'arrivée KLIQUE"
                  style={{
                    width: "100%",
                    aspectRatio: "3 / 4",
                    objectFit: "cover",
                    borderRadius: "14px",
                    border: `1px solid ${SURFACE_BORDER}`,
                  }}
                />
                <span style={{ color: KLIQUE_GOLD, fontSize: "0.82rem", fontWeight: 700 }}>Ouvrir le visuel ↗</span>
              </a>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* CONTENT GRID — row 2 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: hasContact ? "1.4fr 1fr" : "1fr",
          gap: "1rem",
        }}
        className="athlete-profile-row"
      >
        <section style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
            <SectionTitle icon={Award}>Distinctions KLIQUE</SectionTitle>
            {hasDistinctionData ? (
              <p style={{ margin: 0, fontSize: "0.8rem", color: TEXT_MUTED }}>
                {distinctions.length > 0 ? `${distinctions.length} distinction${distinctions.length > 1 ? "s" : ""}` : ""}
                {distinctions.length > 0 && nominations.length > 0 ? " · " : ""}
                {nominations.length > 0 ? `${nominations.length} nomination${nominations.length > 1 ? "s" : ""}` : ""}
              </p>
            ) : null}
          </div>

          {!hasDistinctionData ? (
            <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.9rem" }}>Aucune distinction affichée pour le moment.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem" }}>
              {distinctions.length > 0 ? (
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  <p style={labelStyle}>Distinctions obtenues</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                    {distinctions.map((distinction) => (
                      <li
                        key={distinction.id}
                        style={{
                          border: "1px solid rgba(232, 184, 75, 0.35)",
                          borderRadius: "12px",
                          padding: "0.65rem",
                          background: "rgba(232, 184, 75, 0.08)",
                          display: "grid",
                          gap: "0.2rem",
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 800, color: KLIQUE_GOLD }}>{getDistinctionTypeLabel(distinction.type)}</p>
                        <p style={{ margin: 0, color: "#d1d5db", fontSize: "0.88rem" }}>{formatMonthYear(distinction.awardMonth, distinction.awardYear)}</p>
                        {distinction.description ? <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.88rem" }}>{distinction.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {nominations.length > 0 ? (
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  <p style={labelStyle}>Nominations</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                    {nominations.map((nomination) => (
                      <li
                        key={nomination.id}
                        style={{
                          border: `1px solid ${SURFACE_BORDER}`,
                          borderRadius: "12px",
                          padding: "0.65rem",
                          background: "rgba(255, 255, 255, 0.03)",
                          display: "grid",
                          gap: "0.2rem",
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 700, color: "#f1f5f9" }}>{getDistinctionTypeLabel(nomination.type)}</p>
                        <p style={{ margin: 0, color: "#d1d5db", fontSize: "0.88rem" }}>{formatMonthYear(nomination.awardMonth, nomination.awardYear)}</p>
                        {nomination.reason ? <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.88rem" }}>{nomination.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {hasContact ? (
          <section style={cardStyle}>
            <SectionTitle icon={MessageSquareText}>Contact et présence</SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.1rem" }} className="athlete-profile-contact">
              {email ? (
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <p style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Mail size={12} color={KLIQUE_GOLD} aria-hidden />
                    Email
                  </p>
                  <a href={`mailto:${email}`} style={{ color: "#e5e7eb", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}>
                    {email}
                  </a>
                </div>
              ) : null}
              {phone ? (
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <p style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Phone size={12} color={KLIQUE_GOLD} aria-hidden />
                    Téléphone
                  </p>
                  <a href={`tel:${phone}`} style={{ color: "#e5e7eb", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}>
                    {phone}
                  </a>
                </div>
              ) : null}
              {instagram ? (
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <p style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Sparkles size={12} color={KLIQUE_GOLD} aria-hidden />
                    Instagram
                  </p>
                  <a
                    href={toInstagramLink(instagram)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#e5e7eb", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}
                  >
                    {instagram}
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <style>{`
        @media (max-width: 860px) {
          .athlete-profile-hero {
            grid-template-columns: 1fr !important;
            justify-items: start;
          }
          .athlete-profile-hero-portrait {
            height: 260px !important;
          }
          .athlete-profile-row {
            grid-template-columns: 1fr !important;
          }
          .athlete-profile-contact {
            flex-direction: column !important;
          }
        }
      `}</style>
    </section>
  );
}

