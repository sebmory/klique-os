"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Image,
  MessageSquareText,
  Sparkles,
  Users,
} from "lucide-react";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import { KliquePassCard } from "@/components/klique-pass/KliquePassCard";
import { buildKliquePassViewModel } from "@/lib/klique-pass";
import type { Partner, PartnerResponse } from "@/types/partner";
import type { EcosystemResource } from "@/types/relations";

type ContactStatus = "Actif" | "Prospect" | "Inactif";

type PersonCockpitScreenProps = {
  id: string;
};

const statusFromAthlete = (status: string): ContactStatus => {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("inactif")) return "Inactif";
  if (normalized.includes("prospect") || normalized.includes("valider") || normalized.includes("nouveau")) {
    return "Prospect";
  }
  return "Actif";
};

const readValue = (value: string | number | boolean): string => {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (value.trim()) return value;
  return "Non renseigne";
};

const readDateValue = (value: string): string => {
  if (value.trim()) return value;
  return "Non renseigné";
};

const formatResponseDateValue = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "Aucune réponse enregistrée";

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slashMatch) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = slashMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  const dashMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dashMatch) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = dashMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  }

  return trimmed;
};

const normalize = (value: unknown): string => String(value ?? "").trim();


const relationKey = (value: unknown): string =>
  normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const hasAthleteRelation = (partner: Partner, athlete: Athlete): boolean => {
  const athleteKeys = new Set([relationKey(athlete.name), relationKey(athlete.key)]);
  const candidates = normalize(partner.athletes)
    .split(/[\n,;|]/)
    .map((part) => relationKey(part))
    .filter(Boolean);

  return candidates.some((candidate) => athleteKeys.has(candidate));
};

const isExpertResource = (partner: Partner): boolean => {
  if (partner.expertKlique) return true;
  const relationType = relationKey(partner.relationType);
  const type = relationKey(partner.type);
  const category = relationKey(partner.category);
  return relationType.includes("expert") || type.includes("expert") || category.includes("expert");
};

const buildEcosystemResources = (partners: Partner[], athlete: Athlete): EcosystemResource[] => {
  const related = partners.filter((partner) => hasAthleteRelation(partner, athlete));
  const expertCount = related.filter((partner) => isExpertResource(partner)).length;
  const partnerCount = related.length - expertCount;

  const resources: EcosystemResource[] = [];

  if (partnerCount > 0) {
    resources.push({
      id: "ecosystem-partners",
      title: "Partenaires",
      description: "Partenaires lies a cet athlete",
      count: partnerCount,
      countLabel: "relation(s) active(s)",
      icon: Users,
      href: "/ecosysteme?type=Partenaire",
    });
  }

  if (expertCount > 0) {
    resources.push({
      id: "ecosystem-experts",
      title: "Experts",
      description: "Experts lies a cet athlete",
      count: expertCount,
      countLabel: "relation(s) active(s)",
      icon: Sparkles,
      href: "/ecosysteme?type=Expert",
    });
  }

  return resources;
};

type AthleteAccessState = "none" | "invited" | "active";

type AthleteDistinction = {
  id: string;
  type: string;
  awardMonth: number;
  awardYear: number;
  description: string | null;
};

const distinctionTypeOptions = ["Athlète KLIQUE du mois"] as const;

const monthLabel = (value: number): string => {
  const month = Math.min(Math.max(value || 1, 1), 12);
  return new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(2020, month - 1, 1));
};

export function PersonCockpitScreen({ id }: PersonCockpitScreenProps) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [ecosystemResources, setEcosystemResources] = useState<EcosystemResource[]>([]);
  const [athleteIndex, setAthleteIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessState, setAccessState] = useState<AthleteAccessState>("none");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [distinctions, setDistinctions] = useState<AthleteDistinction[]>([]);
  const [distinctionsLoading, setDistinctionsLoading] = useState(false);
  const [distinctionError, setDistinctionError] = useState<string | null>(null);
  const [distinctionType, setDistinctionType] = useState<(typeof distinctionTypeOptions)[number]>("Athlète KLIQUE du mois");
  const [distinctionMonth, setDistinctionMonth] = useState<number>(new Date().getMonth() + 1);
  const [distinctionYear, setDistinctionYear] = useState<number>(new Date().getFullYear());
  const [distinctionDescription, setDistinctionDescription] = useState("");
  const [isSubmittingDistinction, setIsSubmittingDistinction] = useState(false);
  const [deletingDistinctionId, setDeletingDistinctionId] = useState<string | null>(null);
  const [uploadingVisual, setUploadingVisual] = useState<"profilePortrait" | "kliqueArrivalVisual" | null>(null);
  const [visualUploadError, setVisualUploadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPerson = async () => {
      setLoading(true);
      setErrorMessage(null);
      setEcosystemResources([]);

      try {
        const [response, partnersResponse] = await Promise.all([
          fetch("/api/athletes", { cache: "no-store" }),
          fetch("/api/partners", { cache: "no-store" }),
        ]);

        const payload = (await response.json()) as AthletesResponse | { error?: string };
        const partnersPayload = (await partnersResponse.json()) as PartnerResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error || "Chargement impossible." : "Chargement impossible.");
        }

        if (!("source" in payload) || payload.source !== "google-sheets") {
          const details = "message" in payload && payload.message ? ` (${payload.message})` : "";
          throw new Error(`Les donnees CRM reelles (Google Sheets) sont indisponibles.${details}`);
        }

        const person = payload.athletes.find((item) => item.key === id) ?? null;
        if (!active) return;

        if (!person) {
          setErrorMessage("Cette personne est introuvable dans Google Sheets.");
          setAthlete(null);
          return;
        }

        setAthlete(person);
        setAthleteIndex(payload.athletes.findIndex((item) => item.key === id));

        if (
          partnersResponse.ok &&
          "source" in partnersPayload &&
          partnersPayload.source === "google-sheets"
        ) {
          setEcosystemResources(buildEcosystemResources(partnersPayload.partners, person));
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger cette fiche.");
        setAthlete(null);
        setEcosystemResources([]);
        setAthleteIndex(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPerson();

    return () => {
      active = false;
    };
  }, [id, retryToken]);

  useEffect(() => {
    let active = true;

    const loadAccessState = async () => {
      try {
        const accessResponse = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!accessResponse.ok) return;
        const accessPayload = (await accessResponse.json()) as {
          permissions?: { isAdmin?: boolean | null; isActive?: boolean | null } | null;
        };
        const adminAllowed = Boolean(accessPayload?.permissions?.isAdmin && accessPayload?.permissions?.isActive);
        if (!active) return;
        setIsAdmin(adminAllowed);

        if (!adminAllowed) return;

        const stateResponse = await fetch(`/api/athletes/invite?athleteId=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!stateResponse.ok) return;
        const statePayload = (await stateResponse.json()) as { state?: AthleteAccessState };
        if (!active) return;
        setAccessState(statePayload.state ?? "none");
      } catch {
        if (!active) return;
        setIsAdmin(false);
      }
    };

    void loadAccessState();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;

    const loadDistinctions = async () => {
      setDistinctionsLoading(true);
      setDistinctionError(null);
      try {
        const response = await fetch(`/api/athlete-distinctions?athleteId=${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          distinctions?: AthleteDistinction[];
          error?: string;
        };

        if (!active) return;

        if (!response.ok) {
          throw new Error(payload.error || "Impossible de charger les distinctions.");
        }

        setDistinctions(Array.isArray(payload.distinctions) ? payload.distinctions : []);
      } catch (error) {
        if (!active) return;
        setDistinctions([]);
        setDistinctionError(error instanceof Error ? error.message : "Impossible de charger les distinctions.");
      } finally {
        if (active) setDistinctionsLoading(false);
      }
    };

    void loadDistinctions();

    return () => {
      active = false;
    };
  }, [id]);

  const handleInviteToKlique = async (resend = false) => {
    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const response = await fetch("/api/athletes/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId: id, resend }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Impossible d'envoyer l'invitation.");
      }
      setAccessState("invited");
      setInviteSuccess(resend ? "Invitation renvoyée avec succès." : "Invitation envoyée avec succès.");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : resend ? "Impossible de renvoyer l'invitation." : "Impossible d'envoyer l'invitation.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleUploadVisual = async (usage: "profilePortrait" | "kliqueArrivalVisual", file: File) => {
    if (!isAdmin || !athlete) return;

    setUploadingVisual(usage);
    setVisualUploadError(null);
    try {
      const formData = new FormData();
      formData.append("athleteId", athlete.athleteId || athlete.key);
      formData.append("usage", usage);
      formData.append("file", file);

      const response = await fetch("/api/athlete-visuals", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Impossible d'uploader le visuel.");
      }

      setAthlete((current) =>
        current
          ? {
              ...current,
              ...(usage === "profilePortrait"
                ? { profilePortraitUrl: payload.url }
                : { kliqueArrivalVisualUrl: payload.url }),
            }
          : current,
      );
    } catch (error) {
      setVisualUploadError(error instanceof Error ? error.message : "Impossible d'uploader le visuel.");
    } finally {
      setUploadingVisual(null);
    }
  };

  const handleCreateDistinction = async () => {
    if (!isAdmin) return;

    setIsSubmittingDistinction(true);
    setDistinctionError(null);
    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: id,
          type: distinctionType,
          awardMonth: distinctionMonth,
          awardYear: distinctionYear,
          description: distinctionDescription,
        }),
      });

      const payload = (await response.json()) as {
        distinction?: AthleteDistinction;
        error?: string;
      };

      if (!response.ok || !payload.distinction) {
        throw new Error(payload.error || "Impossible d'ajouter la distinction.");
      }

      setDistinctions((current) => {
        const next = [payload.distinction!, ...current];
        next.sort((a, b) => {
          if (b.awardYear !== a.awardYear) return b.awardYear - a.awardYear;
          return b.awardMonth - a.awardMonth;
        });
        return next;
      });
      setDistinctionDescription("");
    } catch (error) {
      setDistinctionError(error instanceof Error ? error.message : "Impossible d'ajouter la distinction.");
    } finally {
      setIsSubmittingDistinction(false);
    }
  };

  const handleDeleteDistinction = async (distinctionId: string) => {
    if (!isAdmin) return;

    setDeletingDistinctionId(distinctionId);
    setDistinctionError(null);
    try {
      const response = await fetch("/api/athlete-distinctions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distinctionId }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Impossible de supprimer la distinction.");
      }

      setDistinctions((current) => current.filter((item) => item.id !== distinctionId));
    } catch (error) {
      setDistinctionError(error instanceof Error ? error.message : "Impossible de supprimer la distinction.");
    } finally {
      setDeletingDistinctionId(null);
    }
  };

  const status = useMemo(() => statusFromAthlete(athlete?.status ?? ""), [athlete?.status]);
  const membershipSummary = useMemo(() => {
    const state = buildKliquePassViewModel({
      athlete: {
        key: athlete?.key,
        name: athlete?.name,
        sport: athlete?.sport,
        adhesionDate: athlete?.adhesionDate,
      },
      athleteIndex,
    });

    return {
      detailLabel: state.validityLabel ? `${state.statusLabel === "Actif" ? "Active" : "Expirée"} · jusqu’au ${state.validityLabel}` : "Non renseignée",
      isActive: state.isActive,
      athlete: {
        key: athlete?.key,
        name: athlete?.name,
        sport: athlete?.sport,
        adhesionDate: athlete?.adhesionDate,
      },
      athleteIndex,
    };
  }, [athlete, athleteIndex]);
  const initials = useMemo(() => {
    const source = athlete?.name ?? "--";
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [athlete?.name]);

  if (loading) {
    return (
      <section className="crm-person-page">
        <section className="crm-person-skeleton" aria-live="polite" aria-busy="true">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement de la fiche athlete...</span>
        </section>
      </section>
    );
  }

  if (errorMessage || !athlete) {
    return (
      <section className="crm-person-page">
        <section className="crm-error-state" aria-live="assertive">
          <h2>Impossible d'afficher cette fiche</h2>
          <p>{errorMessage ?? "La fiche demandee est indisponible."}</p>
          <div className="crm-person-error-actions">
            <Link href="/crm" className="crm-secondary-action-link">
              Retour au CRM
            </Link>
            <button
              type="button"
              onClick={() => {
                setRetryToken((value) => value + 1);
              }}
            >
              Reessayer
            </button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="crm-person-page">
      <header className="crm-person-hero">
        <div className="crm-person-hero-main">
          <span className="crm-person-portrait" aria-hidden>
            {initials}
          </span>

          <div className="crm-person-title-wrap">
            <div>
              <h1>{athlete.name}</h1>
              <p>
                {readValue(athlete.sport)} · {readValue(athlete.club)}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <small className={`crm-status-badge is-${status.toLowerCase()}`}>{status}</small>
              {membershipSummary.isActive ? (
                <small className="crm-status-badge is-active" style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                  Membre KLIQUE
                </small>
              ) : null}
            </div>
          </div>

          <div className="crm-person-contact-row">
            <a
              href={`https://instagram.com/${athlete.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="crm-person-contact-pill"
            >
              <Sparkles size={14} aria-hidden />
              <span>{readValue(athlete.instagram)}</span>
            </a>
            <a href={`tel:${athlete.phone}`} className="crm-person-contact-pill">
              <Bell size={14} aria-hidden />
              <span>{readValue(athlete.phone)}</span>
            </a>
            <a href={`mailto:${athlete.email}`} className="crm-person-contact-pill">
              <MessageSquareText size={14} aria-hidden />
              <span>{readValue(athlete.email)}</span>
            </a>
          </div>
        </div>

        <div className="crm-person-hero-actions" aria-label="Actions fiche personne">
          {isAdmin ? (
            <div style={{ display: "grid", gap: "0.4rem", justifyItems: "end" }}>
              {accessState === "active" ? (
                <span
                  style={{
                    background: "#dcfce7",
                    color: "#166534",
                    border: "1px solid #bbf7d0",
                    borderRadius: "999px",
                    padding: "0.5rem 0.9rem",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                  }}
                >
                  Accès actif
                </span>
              ) : accessState === "invited" ? (
                <div style={{ display: "grid", gap: "0.4rem", justifyItems: "end" }}>
                  <span
                    style={{
                      background: "#fef3c7",
                      color: "#92400e",
                      border: "1px solid #fde68a",
                      borderRadius: "999px",
                      padding: "0.5rem 0.9rem",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                    }}
                  >
                    Invitation envoyée
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void handleInviteToKlique(true);
                    }}
                    disabled={isInviting}
                    style={{
                      border: "1px solid #92400e",
                      background: "#fff7ed",
                      color: "#7c2d12",
                      borderRadius: "999px",
                      padding: "0.5rem 0.9rem",
                      fontWeight: 700,
                      cursor: isInviting ? "not-allowed" : "pointer",
                      opacity: isInviting ? 0.7 : 1,
                    }}
                  >
                    {isInviting ? "Envoi en cours…" : "Renvoyer l’invitation"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void handleInviteToKlique();
                  }}
                  disabled={isInviting}
                  style={{
                    border: "1px solid #111827",
                    background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
                    color: "#fff",
                    borderRadius: "999px",
                    padding: "0.6rem 1rem",
                    fontWeight: 700,
                    cursor: isInviting ? "not-allowed" : "pointer",
                    opacity: isInviting ? 0.7 : 1,
                  }}
                >
                  {isInviting ? "Envoi en cours…" : "Inviter sur KLIQUE"}
                </button>
              )}
              {inviteError ? (
                <span style={{ color: "#b91c1c", fontSize: "0.82rem", maxWidth: "260px", textAlign: "right" }}>{inviteError}</span>
              ) : null}
              {inviteSuccess ? (
                <span style={{ color: "#166534", fontSize: "0.82rem", maxWidth: "260px", textAlign: "right" }}>{inviteSuccess}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="crm-person-grid">
        <article className="crm-person-card-shell crm-person-card-main">
          <header>
            <h2>Aperçu</h2>
          </header>
          <div className="crm-person-kpi-grid">
            <div className="crm-person-kpi-item">
              <strong>{readDateValue(athlete.lastPublication)}</strong>
              <small>Derniere visibilite</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <ChartNoAxesCombined size={16} />
              </span>
            </div>
            <div className="crm-person-kpi-item">
              <strong>{readDateValue(athlete.lastPost)}</strong>
              <small>Dernier post</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <Image size={16} />
              </span>
            </div>
            <div className="crm-person-kpi-item">
              <strong>{readDateValue(athlete.lastStory)}</strong>
              <small>Derniere story</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <Sparkles size={16} />
              </span>
            </div>
            <div className="crm-person-kpi-item">
              <strong>{readDateValue(athlete.nextContact)}</strong>
              <small>Prochain contact</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <CalendarDays size={16} />
              </span>
            </div>
            <div className="crm-person-kpi-item">
              <strong>{readValue(athlete.daysWithoutVisibility)}</strong>
              <small>Jours sans visibilite</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <Bell size={16} />
              </span>
            </div>
            <div className="crm-person-kpi-item">
              <strong>{readValue(athlete.titlesOfMonth)}</strong>
              <small>Athlete du mois</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <Users size={16} />
              </span>
            </div>
            <div className="crm-person-kpi-item">
              <strong>{formatResponseDateValue(athlete.lastResponseWeekly)}</strong>
              <small>Dernière réponse hebdomadaire</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <ChartNoAxesCombined size={16} />
              </span>
            </div>
            <div className="crm-person-kpi-item">
              <strong>{formatResponseDateValue(athlete.lastResponseMonthly)}</strong>
              <small>Dernière réponse mensuelle</small>
              <span className="crm-person-kpi-icon" aria-hidden>
                <ChartNoAxesCombined size={16} />
              </span>
            </div>
          </div>
        </article>

        <div className="crm-person-side-stack">
          <article className="crm-person-card-shell">
            <header>
              <h2>Informations</h2>
            </header>
            <div className="crm-person-info-columns">
              <dl className="crm-person-info-grid">
                <div>
                  <dt>
                    <Users size={14} aria-hidden />
                    Club
                  </dt>
                  <dd>{readValue(athlete.club)}</dd>
                </div>
                <div>
                  <dt>
                    <Sparkles size={14} aria-hidden />
                    Sport
                  </dt>
                  <dd>{readValue(athlete.sport)}</dd>
                </div>
                <div>
                  <dt>
                    <ChartNoAxesCombined size={14} aria-hidden />
                    Statut
                  </dt>
                  <dd>{readValue(athlete.status)}</dd>
                </div>
                <div>
                  <dt>
                    <Sparkles size={14} aria-hidden />
                    Adhésion KLIQUE
                  </dt>
                  <dd>{membershipSummary.detailLabel}</dd>
                </div>
                <div>
                  <dt>
                    <Sparkles size={14} aria-hidden />
                    Action
                  </dt>
                  <dd>
                    <button
                      type="button"
                      onClick={() => setShowPassPreview(true)}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        color: "#4f46e5",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Voir le Pass
                    </button>
                  </dd>
                </div>
              </dl>

              <dl className="crm-person-info-grid">
                <div>
                  <dt>
                    <Sparkles size={14} aria-hidden />
                    Instagram
                  </dt>
                  <dd>{readValue(athlete.instagram)}</dd>
                </div>
                <div>
                  <dt>
                    <Bell size={14} aria-hidden />
                    Téléphone
                  </dt>
                  <dd>{readValue(athlete.phone)}</dd>
                </div>
                <div>
                  <dt>
                    <MessageSquareText size={14} aria-hidden />
                    Email
                  </dt>
                  <dd>{readValue(athlete.email)}</dd>
                </div>
              </dl>
            </div>
          </article>

          <article className="crm-person-card-shell">
            <header>
              <h2>Distinctions KLIQUE</h2>
            </header>

            {distinctionsLoading ? (
              <p style={{ margin: 0, color: "#6b7280" }}>Chargement des distinctions…</p>
            ) : distinctions.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280" }}>Aucune distinction enregistrée.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                {distinctions.map((item) => (
                  <div key={item.id} style={{ border: "1px solid #f0f0f0", borderRadius: "12px", background: "#fcfcfc", padding: "0.7rem 0.75rem", display: "grid", gap: "0.35rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem" }}>
                      <strong style={{ color: "#1f1f1f", fontSize: "0.94rem" }}>{item.type}</strong>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteDistinction(item.id);
                          }}
                          disabled={deletingDistinctionId === item.id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: "999px",
                            background: "#ffffff",
                            color: "#7f1d1d",
                            padding: "0.3rem 0.65rem",
                            fontSize: "0.76rem",
                            fontWeight: 700,
                            cursor: deletingDistinctionId === item.id ? "not-allowed" : "pointer",
                            opacity: deletingDistinctionId === item.id ? 0.7 : 1,
                          }}
                        >
                          {deletingDistinctionId === item.id ? "Suppression…" : "Supprimer"}
                        </button>
                      ) : null}
                    </div>
                    <p style={{ margin: 0, color: "#4b5563", fontSize: "0.86rem" }}>
                      {monthLabel(item.awardMonth)} {item.awardYear}
                    </p>
                    {item.description ? (
                      <p style={{ margin: 0, color: "#2f2f2f", fontSize: "0.9rem", lineHeight: 1.5 }}>{item.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {isAdmin ? (
              <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.4rem" }}>
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <label htmlFor="distinction-type" style={{ color: "#7b7b7b", fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Type
                  </label>
                  <select
                    id="distinction-type"
                    value={distinctionType}
                    onChange={(event) => {
                      setDistinctionType(event.target.value as (typeof distinctionTypeOptions)[number]);
                    }}
                    style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.5rem 0.6rem", background: "#fff" }}
                  >
                    {distinctionTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.6rem" }}>
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <label htmlFor="distinction-month" style={{ color: "#7b7b7b", fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Mois
                    </label>
                    <input
                      id="distinction-month"
                      type="number"
                      min={1}
                      max={12}
                      value={distinctionMonth}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (!Number.isNaN(value)) {
                          setDistinctionMonth(Math.min(Math.max(value, 1), 12));
                        }
                      }}
                      style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.5rem 0.6rem", background: "#fff" }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <label htmlFor="distinction-year" style={{ color: "#7b7b7b", fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Année
                    </label>
                    <input
                      id="distinction-year"
                      type="number"
                      min={1900}
                      value={distinctionYear}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (!Number.isNaN(value)) {
                          setDistinctionYear(Math.max(value, 1900));
                        }
                      }}
                      style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.5rem 0.6rem", background: "#fff" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <label htmlFor="distinction-description" style={{ color: "#7b7b7b", fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Description (optionnelle)
                  </label>
                  <textarea
                    id="distinction-description"
                    rows={3}
                    value={distinctionDescription}
                    onChange={(event) => {
                      setDistinctionDescription(event.target.value);
                    }}
                    style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.55rem 0.6rem", resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCreateDistinction();
                    }}
                    disabled={isSubmittingDistinction}
                    style={{
                      border: "1px solid #111827",
                      background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
                      color: "#fff",
                      borderRadius: "999px",
                      padding: "0.55rem 0.95rem",
                      fontWeight: 700,
                      cursor: isSubmittingDistinction ? "not-allowed" : "pointer",
                      opacity: isSubmittingDistinction ? 0.7 : 1,
                    }}
                  >
                    {isSubmittingDistinction ? "Ajout…" : "Ajouter la distinction"}
                  </button>
                </div>
              </div>
            ) : null}

            {distinctionError ? <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.84rem" }}>{distinctionError}</p> : null}
          </article>

          {isAdmin ? (
            <article className="crm-person-card-shell">
              <header>
                <h2>Visuels KLIQUE</h2>
              </header>

              <div style={{ display: "grid", gap: "1rem" }}>
                {(
                  [
                    { usage: "profilePortrait" as const, label: "Portrait de profil", url: athlete.profilePortraitUrl },
                    { usage: "kliqueArrivalVisual" as const, label: "Visuel d'arrivée KLIQUE", url: athlete.kliqueArrivalVisualUrl },
                  ]
                ).map(({ usage, label, url }) => (
                  <div key={usage} style={{ display: "grid", gap: "0.5rem" }}>
                    <span style={{ color: "#7b7b7b", fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {label}
                    </span>

                    {url ? (
                      <img
                        src={url}
                        alt={label}
                        style={{ width: "100%", maxWidth: "220px", borderRadius: "12px", border: "1px solid #e5e7eb", objectFit: "cover" }}
                      />
                    ) : (
                      <p style={{ margin: 0, color: "#6b7280", fontSize: "0.86rem" }}>Aucun visuel importé.</p>
                    )}

                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        border: "1px solid #e5e7eb",
                        borderRadius: "999px",
                        padding: "0.45rem 0.8rem",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        cursor: uploadingVisual === usage ? "not-allowed" : "pointer",
                        opacity: uploadingVisual === usage ? 0.7 : 1,
                        width: "fit-content",
                      }}
                    >
                      {uploadingVisual === usage ? "Envoi…" : url ? "Remplacer l'image" : "Importer une image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        disabled={uploadingVisual !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) {
                            void handleUploadVisual(usage, file);
                          }
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>

              {visualUploadError ? <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.84rem" }}>{visualUploadError}</p> : null}
            </article>
          ) : null}

        </div>

        <article className="crm-person-card-shell crm-person-notes-card">
          <header>
            <h2>Notes</h2>
          </header>
          {athlete.notes.trim() ? (
            <p className="crm-person-notes-text">{athlete.notes}</p>
          ) : (
            <div className="crm-person-empty-note">
              <span className="crm-person-empty-note-icon" aria-hidden>
                <MessageSquareText size={17} />
              </span>
              <p>Aucune note pour le moment.</p>
            </div>
          )}
        </article>
      </section>

      {showPassPreview ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17, 24, 39, 0.72)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: "760px", maxHeight: "90vh", overflowY: "auto", borderRadius: "24px", background: "white", padding: "1rem", boxShadow: "0 24px 60px rgba(17, 24, 39, 0.35)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Prévisualisation Pass KLIQUE</h3>
                <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>Vue réservée à l’admin pour l’athlète sélectionné.</p>
              </div>
              <button type="button" onClick={() => setShowPassPreview(false)} style={{ border: "none", background: "#f3f4f6", borderRadius: "999px", padding: "0.55rem 0.8rem", cursor: "pointer" }}>
                Fermer
              </button>
            </div>

            <KliquePassCard athlete={membershipSummary.athlete} athleteIndex={membershipSummary.athleteIndex} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
