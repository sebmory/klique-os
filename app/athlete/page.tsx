"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ClipboardList,
  Sparkles,
  IdCard,
  Users,
  Compass,
  UserRound,
  Newspaper,
} from "lucide-react";
import type { Partner } from "@/types/partner";
import { buildMembershipState } from "@/lib/membership";

type AthleteSummary = {
  key?: string;
  name?: string;
  sport?: string;
  club?: string;
  adhesionDate?: string;
  objective?: string;
  desiredAreas?: string;
  profilePortraitUrl?: string;
  profilePortraitScale?: number;
  profilePortraitX?: number;
  profilePortraitY?: number;
  nextContact?: string;
  importantRendezVousThisWeek?: string;
  lastResponseWeekly?: string;
  lastResponseMonthly?: string;
};

type ClerkAccessPayload = {
  ok?: boolean;
  userAccess?: {
    athleteId?: string | null;
    role?: string | null;
  } | null;
};

type AthletesPayload = {
  athletes?: AthleteSummary[];
  source?: string;
  message?: string;
};

type NewsItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: number;
  dateLabel: string;
  href: string;
};

const KLIQUE_GOLD = "#e8b84b";
const SURFACE_BORDER = "rgba(255, 255, 255, 0.09)";
const SURFACE_BG = "rgba(255, 255, 255, 0.035)";
const TEXT_MUTED = "#9ca3af";

const WEEKLY_FORM_URL = "https://docs.google.com/forms/d/1r1wEMFUzYlrNks_8PCI7V3Tc3HlzmP6-MUZlAMI9DP8/viewform";
const MONTHLY_FORM_URL = "https://docs.google.com/forms/d/1Ha0JqC4LOqxUx95PQBDeRfCUy92DQhnrBSAwG8VRDp8/viewform";

const normalize = (value: unknown): string => String(value ?? "").trim();

const readMeaningfulValue = (value: unknown): string | null => {
  const text = normalize(value);
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (lowered === "a definir" || lowered === "a définir" || lowered === "à définir") return null;
  if (/^[-–—]+$/.test(text)) return null;
  return text;
};

const computeInitials = (name: string): string => {
  const source = name.trim();
  if (!source) return "--";
  return (
    source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "--"
  );
};

const getFirstName = (fullName: unknown): string => {
  const text = normalize(fullName);
  if (!text) return "athlète";
  return text.split(/\s+/).filter(Boolean)[0] || "athlète";
};

const buildLocalDate = (year: number, month: number, day: number): Date | null => {
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  // Guards against overflow values such as 32.13.2026 silently rolling over.
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
};

const parseDateValue = (value: unknown): Date | null => {
  const text = normalize(value);
  if (!text) return null;

  const dayFirstMatch = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[\sT].*)?$/);
  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    return buildLocalDate(Number(year), Number(month), Number(day));
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[\sT].*)?$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildLocalDate(Number(year), Number(month), Number(day));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatNewsDate = (date: Date): string =>
  date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const truncate = (value: string, max = 130): string => {
  const text = normalize(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
};

const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NEWS_ITEMS = 6;

const cardStyle: CSSProperties = {
  border: `1px solid ${SURFACE_BORDER}`,
  borderRadius: "18px",
  background: SURFACE_BG,
  padding: "1.1rem",
  display: "grid",
  gap: "0.7rem",
  alignContent: "start",
};

const quickLinks = [
  { href: "/athlete/profile", label: "Mon profil", description: "Ma vitrine KLIQUE", icon: UserRound },
  { href: "/athlete/pass", label: "Mon Pass KLIQUE", description: "Prouver mon adhésion", icon: IdCard },
  { href: "/athlete/ecosysteme", label: "Écosystème", description: "Partenaires et experts", icon: Compass },
  { href: "/athlete/community", label: "Communauté", description: "Le fil des athlètes", icon: Users },
];

export default function AthletePage() {
  const { user } = useUser();
  const [athlete, setAthlete] = useState<AthleteSummary | null>(null);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [featuredOpportunity, setFeaturedOpportunity] = useState<{
    id: string;
    title: string;
    type: string;
    date: string;
    location: string;
    deadline: string;
  } | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAthleteView = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const accessResponse = await fetch("/api/clerk/access", {
          credentials: "include",
          cache: "no-store",
        });

        if (!accessResponse.ok) {
          throw new Error("Impossible de charger votre espace athlète.");
        }

        const accessPayload = (await accessResponse.json()) as ClerkAccessPayload;
        const athleteId = accessPayload?.userAccess?.athleteId ?? null;

        if (!athleteId) {
          throw new Error("Aucun profil athlète n’est associé à votre compte.");
        }

        const athletesResponse = await fetch("/api/athletes", {
          credentials: "include",
          cache: "no-store",
        });

        if (!athletesResponse.ok) {
          throw new Error("Impossible de récupérer vos données personnelles.");
        }

        const athletesPayload = (await athletesResponse.json()) as AthletesPayload;
        const athletes = athletesPayload?.athletes ?? [];
        const resolvedAthlete = athletes.find((item) => item.key === athleteId) ?? null;
        const resolvedIndex = resolvedAthlete ? athletes.findIndex((item) => item.key === athleteId) : null;

        if (!active) return;
        if (!resolvedAthlete) {
          setAthlete(null);
          setErrorMessage("Aucune donnée athlète n’a été retrouvée pour votre compte.");
          return;
        }

        setAthlete(resolvedAthlete);
        setAthleteIndex(resolvedIndex);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger votre vue Aujourd’hui.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAthleteView();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadNews = async () => {
      setNewsLoading(true);
      setNewsError(null);

      try {
        const [communityResponse, opportunitiesResponse, resourcesResponse, partnersResponse, arrivalsResponse] = await Promise.all([
          fetch("/api/hub-community", { credentials: "include", cache: "no-store" }),
          fetch("/api/hub-opportunities", { credentials: "include", cache: "no-store" }),
          fetch("/api/hub-resources", { credentials: "include", cache: "no-store" }),
          fetch("/api/partners", { credentials: "include", cache: "no-store" }),
          fetch("/api/athletes/arrivals", { credentials: "include", cache: "no-store" }),
        ]);

        const readJson = async <T,>(response: Response, fallback: T): Promise<T> => {
          if (!response.ok) return fallback;
          try {
            return (await response.json()) as T;
          } catch {
            return fallback;
          }
        };

        const [communityPayload, opportunitiesPayload, resourcesPayload, partnersPayload, arrivalsPayload] = await Promise.all([
          readJson(communityResponse, {} as { publications?: Array<Record<string, unknown>> }),
          readJson(opportunitiesResponse, {} as { opportunities?: Array<Record<string, unknown>> }),
          readJson(resourcesResponse, {} as { resources?: Array<Record<string, unknown>> }),
          readJson(partnersResponse, {} as { partners?: Partner[] }),
          readJson(arrivalsResponse, {} as { arrivals?: Array<Record<string, unknown>> }),
        ]);

        if (!active) return;

        const collected: NewsItem[] = [];

        for (const item of communityPayload.publications ?? []) {
          const date = parseDateValue(item.createdAt);
          const content = normalize(item.content);
          if (!date || !content) continue;
          collected.push({
            id: `community-${normalize(item.id)}`,
            type: "Communauté",
            title: normalize(item.title) || `Publication de ${normalize(item.authorDisplayName) || "KLIQUE"}`,
            description: truncate(content),
            timestamp: date.getTime(),
            dateLabel: formatNewsDate(date),
            href: "/athlete/community",
          });
        }

        const openOpportunities = (opportunitiesPayload.opportunities ?? [])
          .filter((item) => normalize(item.status) === "Ouverte" && normalize(item.id) && normalize(item.title))
          .sort((a, b) => (parseDateValue(b.createdAt)?.getTime() ?? 0) - (parseDateValue(a.createdAt)?.getTime() ?? 0));

        const featured = openOpportunities[0];
        const featuredId = featured ? normalize(featured.id) : null;

        for (const item of opportunitiesPayload.opportunities ?? []) {
          const opportunityId = normalize(item.id);
          if (featuredId && opportunityId === featuredId) continue;
          const date = parseDateValue(item.createdAt);
          const title = normalize(item.title);
          if (!date || !title) continue;
          collected.push({
            id: `opportunity-${opportunityId}`,
            type: "Opportunité",
            title,
            description: truncate(normalize(item.description) || normalize(item.organization)),
            timestamp: date.getTime(),
            dateLabel: formatNewsDate(date),
            href: `/athlete/opportunities/${encodeURIComponent(opportunityId)}`,
          });
        }

        setFeaturedOpportunity(
          featured
            ? {
                id: normalize(featured.id),
                title: normalize(featured.title),
                type: normalize(featured.type) || "Autre",
                date: normalize(featured.date),
                location: normalize(featured.location),
                deadline: normalize(featured.deadline),
              }
            : null,
        );

        for (const item of resourcesPayload.resources ?? []) {
          if (normalize(item.status).toLowerCase() !== "published") continue;
          const date = parseDateValue(item.publishedAt) ?? parseDateValue(item.createdAt);
          const title = normalize(item.title);
          if (!date || !title) continue;
          collected.push({
            id: `resource-${normalize(item.id)}`,
            type: "Ressource",
            title,
            description: truncate(normalize(item.description) || normalize(item.category)),
            timestamp: date.getTime(),
            dateLabel: formatNewsDate(date),
            href: "/athlete/community",
          });
        }

        for (const partner of partnersPayload.partners ?? []) {
          const date =
            parseDateValue(partner.kliqueArrivalDate) ??
            parseDateValue(partner.collaborationStart) ??
            parseDateValue(partner.firstContactDate);
          const name = normalize(partner.name);
          if (!date || !name) continue;
          collected.push({
            id: `partner-${normalize(partner.id) || name.toLowerCase()}`,
            type: normalize(partner.relationType) === "Expert" ? "Expert" : "Partenaire",
            title: name,
            description: truncate(normalize(partner.benefits) || normalize(partner.description) || normalize(partner.category)),
            timestamp: date.getTime(),
            dateLabel: formatNewsDate(date),
            href: "/athlete/ecosysteme",
          });
        }

        for (const arrival of arrivalsPayload.arrivals ?? []) {
          const date = parseDateValue(arrival.adhesionDate);
          const name = normalize(arrival.name);
          const athleteId = normalize(arrival.athleteId);
          if (!date || !name || !athleteId) continue;
          if (date.getTime() > Date.now()) continue;
          const meta = [normalize(arrival.sport), normalize(arrival.club)].filter(Boolean).join(" · ");
          collected.push({
            id: `arrival-${athleteId}`,
            type: "Nouvel athlète",
            title: name,
            description: meta,
            timestamp: date.getTime(),
            dateLabel: formatNewsDate(date),
            href: "/athlete/community",
          });
        }

        const deduplicated = new Map<string, NewsItem>();
        for (const entry of collected) {
          const signature = `${entry.type}|${entry.title}`.toLowerCase();
          const existing = deduplicated.get(signature);
          if (!existing || entry.timestamp > existing.timestamp) {
            deduplicated.set(signature, entry);
          }
        }

        const freshnessThreshold = Date.now() - NEW_BADGE_WINDOW_MS;

        setNewsItems(
          Array.from(deduplicated.values())
            .filter((entry) => entry.timestamp >= freshnessThreshold)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_NEWS_ITEMS),
        );
      } catch {
        if (!active) return;
        setNewsError("Impossible de charger les nouveautés pour le moment.");
        setNewsItems([]);
      } finally {
        if (active) setNewsLoading(false);
      }
    };

    void loadNews();

    return () => {
      active = false;
    };
  }, []);

  const membership = useMemo(
    () =>
      buildMembershipState({
        startDate: athlete?.adhesionDate,
        isInitialFreeYearEligible: athleteIndex !== null && athleteIndex < 16,
      }),
    [athlete?.adhesionDate, athleteIndex],
  );

  const clerkFirstName = normalize(user?.firstName);
  const firstName = clerkFirstName || getFirstName(athlete?.name);

  const importantAppointment = readMeaningfulValue(athlete?.importantRendezVousThisWeek);
  const objective = readMeaningfulValue(athlete?.objective);
  const nextContact = readMeaningfulValue(athlete?.nextContact);

  const priority = importantAppointment ?? objective ?? nextContact;
  const prioritySource = importantAppointment
    ? "Priorité identifiée dans ton dernier suivi hebdomadaire."
    : objective
      ? "Ton objectif actuel déclaré à KLIQUE."
      : nextContact
        ? "Prochaine échéance planifiée dans ton suivi."
        : null;

  const identityMeta = [readMeaningfulValue(athlete?.sport), readMeaningfulValue(athlete?.club)].filter(Boolean) as string[];
  const portraitUrl = readMeaningfulValue(athlete?.profilePortraitUrl);
  const portraitScale = Number.isFinite(athlete?.profilePortraitScale) ? Number(athlete?.profilePortraitScale) : 1;
  const portraitX = Number.isFinite(athlete?.profilePortraitX) ? Number(athlete?.profilePortraitX) : 0;
  const portraitY = Number.isFinite(athlete?.profilePortraitY) ? Number(athlete?.profilePortraitY) : 0;
  const membershipBadgeLabel =
    membership.statusLabel === "Non renseignée" ? "Membre KLIQUE" : `Membre KLIQUE · ${membership.statusLabel}`;

  if (loading) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: "1180px", margin: "0 auto" }}>
        <p style={{ margin: 0, color: TEXT_MUTED }}>Chargement de ta vue personnalisée…</p>
      </div>
    );
  }

  if (errorMessage || !athlete) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: "1180px", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 0.4rem", fontSize: "1.4rem", color: "#111827" }}>Aujourd’hui</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{errorMessage ?? "Aucune donnée disponible pour le moment."}</p>
      </div>
    );
  }

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
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Aujourd’hui</h1>
      </header>

      {/* HERO */}
      <article
        style={{
          position: "relative",
          border: `1px solid ${SURFACE_BORDER}`,
          borderRadius: "22px",
          background: "linear-gradient(160deg, #14151a 0%, #0e0f13 60%, #0a0b0f 100%)",
          display: "grid",
          gridTemplateColumns: "minmax(180px, 240px) 1fr",
          alignItems: "stretch",
          gap: "0",
          overflow: "hidden",
          minHeight: "240px",
          boxShadow: "0 24px 60px -30px rgba(0, 0, 0, 0.85)",
        }}
        className="athlete-today-hero"
      >
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

        <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }} className="athlete-today-hero-portrait">
          {portraitUrl ? (
            <>
              <img
                src={portraitUrl}
                alt={normalize(athlete.name) || "Portrait"}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  display: "block",
                  transform: `translate(${portraitX}%, ${portraitY}%) scale(${portraitScale})`,
                  transformOrigin: "center center",
                }}
              />
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
              {computeInitials(normalize(athlete.name))}
            </div>
          )}
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "grid", gap: "0.7rem", alignContent: "center", padding: "1.5rem", minWidth: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "2.1rem", color: "#f8fafc", lineHeight: 1.1, fontWeight: 800 }}>Bonjour {firstName}</h2>
            {identityMeta.length > 0 ? (
              <p style={{ margin: "0.45rem 0 0", color: "#d1d5db", fontSize: "1.02rem" }}>{identityMeta.join(" · ")}</p>
            ) : null}
            <p style={{ margin: "0.5rem 0 0", color: TEXT_MUTED, fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "48ch" }}>
              Voici ce qui compte pour toi dans KLIQUE aujourd’hui.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <span
              style={{
                borderRadius: "999px",
                padding: "0.32rem 0.75rem",
                fontSize: "0.74rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                background: membership.isActive ? "rgba(232, 184, 75, 0.16)" : "rgba(255, 255, 255, 0.06)",
                color: membership.isActive ? KLIQUE_GOLD : "#d1d5db",
                border: membership.isActive ? "1px solid rgba(232, 184, 75, 0.45)" : `1px solid ${SURFACE_BORDER}`,
              }}
            >
              {membershipBadgeLabel}
            </span>
          </div>
        </div>
      </article>

      {/* PRIORITÉ + ACTIONS */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1rem", alignItems: "start" }} className="athlete-today-row">
        <section
          style={{
            ...cardStyle,
            background: "linear-gradient(150deg, rgba(232, 184, 75, 0.1) 0%, rgba(255, 255, 255, 0.03) 55%)",
            border: "1px solid rgba(232, 184, 75, 0.28)",
            gap: "0.45rem",
          }}
        >
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "1rem", color: "#f8fafc", fontWeight: 700 }}>
            <Sparkles size={15} color={KLIQUE_GOLD} aria-hidden />
            Ma priorité cette semaine
          </h3>
          {priority ? (
            <>
              <p style={{ margin: 0, color: "#f8fafc", fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.3 }}>{priority}</p>
              {prioritySource ? <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.88rem" }}>{prioritySource}</p> : null}
            </>
          ) : (
            <p style={{ margin: 0, color: "#e5e7eb", fontSize: "1rem", lineHeight: 1.5 }}>
              Aucune priorité enregistrée pour le moment.
            </p>
          )}
        </section>

        <section style={cardStyle}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "1rem", color: "#f8fafc", fontWeight: 700 }}>
            <ClipboardList size={15} color={KLIQUE_GOLD} aria-hidden />
            Actions KLIQUE
          </h3>

          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.88rem", lineHeight: 1.55 }}>
            Ces fiches permettent à KLIQUE de suivre ton actualité, tes résultats et tes projets. Plus tu nous donnes régulièrement de
            tes nouvelles, plus nous pouvons identifier les bons sujets et communiquer à ton sujet.
          </p>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <a
              href={WEEKLY_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: "fit-content",
                border: `1px solid ${KLIQUE_GOLD}`,
                borderRadius: "999px",
                padding: "0.4rem 0.85rem",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "0.85rem",
                color: "#0a0b0f",
                background: KLIQUE_GOLD,
              }}
            >
              Remplir ma fiche hebdomadaire
            </a>
            <a
              href={MONTHLY_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: "fit-content",
                border: `1px solid ${KLIQUE_GOLD}`,
                borderRadius: "999px",
                padding: "0.4rem 0.85rem",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "0.85rem",
                color: KLIQUE_GOLD,
                background: "transparent",
              }}
            >
              Remplir ma fiche mensuelle
            </a>
          </div>
        </section>
      </div>

      {/* OPPORTUNITÉ À SAISIR */}
      {featuredOpportunity ? (
        <section
          style={{
            border: "1px solid rgba(232, 184, 75, 0.45)",
            borderRadius: "20px",
            background: "linear-gradient(160deg, rgba(232, 184, 75, 0.14) 0%, #14151a 45%, #0a0b0f 100%)",
            padding: "1.15rem",
            display: "grid",
            gap: "0.6rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.7rem", color: KLIQUE_GOLD, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
              Opportunité à saisir
            </span>
            <span style={{ borderRadius: "999px", padding: "0.14rem 0.5rem", fontSize: "0.68rem", fontWeight: 700, background: "rgba(255, 255, 255, 0.06)", color: "#d1d5db", border: `1px solid ${SURFACE_BORDER}` }}>
              {featuredOpportunity.type}
            </span>
          </div>

          <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc", fontWeight: 800, lineHeight: 1.25 }}>
            {featuredOpportunity.title}
          </h3>

          <div style={{ display: "grid", gap: "0.2rem", color: TEXT_MUTED, fontSize: "0.88rem" }}>
            <span>Date : {featuredOpportunity.date || "Non renseignée"}</span>
            <span>Lieu : {featuredOpportunity.location || "Non renseigné"}</span>
            <span>Deadline : {featuredOpportunity.deadline || "Non renseignée"}</span>
          </div>

          <Link
            href={`/athlete/opportunities/${encodeURIComponent(featuredOpportunity.id)}`}
            style={{
              width: "fit-content",
              border: `1px solid ${KLIQUE_GOLD}`,
              borderRadius: "999px",
              padding: "0.5rem 1rem",
              textDecoration: "none",
              fontWeight: 800,
              fontSize: "0.88rem",
              color: "#0a0b0f",
              background: KLIQUE_GOLD,
            }}
          >
            Découvrir l’opportunité
          </Link>
        </section>
      ) : null}

      {/* NOUVEAUTÉS KLIQUE */}
      <section style={cardStyle}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "1rem", color: "#f8fafc", fontWeight: 700 }}>
          <Newspaper size={15} color={KLIQUE_GOLD} aria-hidden />
          Nouveautés KLIQUE
        </h3>

        {newsLoading ? (
          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.9rem" }}>Chargement des nouveautés…</p>
        ) : newsError ? (
          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.9rem" }}>{newsError}</p>
        ) : newsItems.length === 0 ? (
          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.9rem" }}>
            Aucune nouveauté ces 7 derniers jours. Les arrivées, partenaires, opportunités et ressources récents apparaîtront ici.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.7rem" }}>
            {newsItems.map((item) => {
              const isNew = Date.now() - item.timestamp <= NEW_BADGE_WINDOW_MS;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    border: `1px solid ${SURFACE_BORDER}`,
                    borderRadius: "14px",
                    background: "rgba(255, 255, 255, 0.03)",
                    padding: "0.8rem",
                    display: "grid",
                    gap: "0.3rem",
                    alignContent: "start",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: KLIQUE_GOLD,
                        textTransform: "uppercase",
                        letterSpacing: "0.09em",
                        fontWeight: 700,
                      }}
                    >
                      {item.type}
                    </span>
                    {isNew ? (
                      <span
                        style={{
                          borderRadius: "999px",
                          padding: "0.12rem 0.45rem",
                          fontSize: "0.64rem",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          background: "rgba(232, 184, 75, 0.16)",
                          color: KLIQUE_GOLD,
                          border: "1px solid rgba(232, 184, 75, 0.45)",
                        }}
                      >
                        Nouveau
                      </span>
                    ) : null}
                  </div>
                  <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.35 }}>{item.title}</span>
                  {item.description ? (
                    <span style={{ color: "#d1d5db", fontSize: "0.84rem", lineHeight: 1.45 }}>{item.description}</span>
                  ) : null}
                  <span style={{ color: TEXT_MUTED, fontSize: "0.78rem" }}>{item.dateLabel}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ACCÈS RAPIDES */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        {quickLinks.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            style={{
              ...cardStyle,
              textDecoration: "none",
              gap: "0.35rem",
              padding: "1rem",
            }}
          >
            <Icon size={17} color={KLIQUE_GOLD} aria-hidden />
            <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "0.98rem" }}>{label}</span>
            <span style={{ color: TEXT_MUTED, fontSize: "0.84rem" }}>{description}</span>
          </Link>
        ))}
      </div>

      <style>{`
        @media (max-width: 860px) {
          .athlete-today-hero {
            grid-template-columns: 1fr !important;
          }
          .athlete-today-hero-portrait {
            height: 240px !important;
          }
          .athlete-today-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
