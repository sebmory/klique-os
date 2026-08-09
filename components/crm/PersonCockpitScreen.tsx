"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Image,
  MessageSquareText,
  MoreHorizontal,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import type { Partner, PartnerResponse } from "@/types/partner";
import { RelationsCard } from "@/components/relations/RelationsCard";
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

export function PersonCockpitScreen({ id }: PersonCockpitScreenProps) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [ecosystemResources, setEcosystemResources] = useState<EcosystemResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

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
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPerson();

    return () => {
      active = false;
    };
  }, [id, retryToken]);

  const status = useMemo(() => statusFromAthlete(athlete?.status ?? ""), [athlete?.status]);
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
            <small className={`crm-status-badge is-${status.toLowerCase()}`}>{status}</small>
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
          <button type="button" className="crm-hero-ghost-action">
            <Settings size={15} aria-hidden />
            Modifier
          </button>
          <button type="button" className="crm-hero-ghost-action">
            <Sparkles size={15} aria-hidden />
            Partager
          </button>
          <button type="button" className="crm-hero-icon-action" aria-label="Plus d'actions">
            <MoreHorizontal size={16} aria-hidden />
          </button>
        </div>
      </header>

      <section className="crm-person-grid">
        <article className="crm-person-card-shell crm-person-card-main">
          <header>
            <h2>Aujourd'hui</h2>
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

        <article className="crm-person-card-shell crm-person-day-actions">
          <header>
            <h2>Aujourd'hui</h2>
          </header>
          <ul className="crm-day-actions-list">
            <li>
              <span aria-hidden>
                <Users size={15} />
              </span>
              <p>Contacter cet athlete</p>
            </li>
            <li>
              <span aria-hidden>
                <Image size={15} />
              </span>
              <p>Prevoir une publication</p>
            </li>
            <li>
              <span aria-hidden>
                <ChartNoAxesCombined size={15} />
              </span>
              <p>Verifier la derniere visibilite</p>
            </li>
            <li>
              <span aria-hidden>
                <MessageSquareText size={15} />
              </span>
              <p>Ajouter une note</p>
            </li>
          </ul>
        </article>

        <article className="crm-person-card-shell">
          <header>
            <h2>Actions rapides</h2>
          </header>
          <div className="crm-person-quick-actions">
            <button type="button" className="crm-person-quick-action">
              <CalendarDays size={16} aria-hidden />
              Nouveau shooting
            </button>
            <button type="button" className="crm-person-quick-action">
              <Image size={16} aria-hidden />
              Nouvelle publication
            </button>
            <button type="button" className="crm-person-quick-action">
              <MessageSquareText size={16} aria-hidden />
              Ajouter une note
            </button>
            <button type="button" className="crm-person-quick-action">
              <Users size={16} aria-hidden />
              Planifier un contact
            </button>
          </div>
        </article>

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
                  Telephone
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
            <h2>Écosystème KLIQUE</h2>
          </header>
          <RelationsCard title="Écosystème KLIQUE" resources={ecosystemResources} />
        </article>

        <article className="crm-person-card-shell">
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
              <button type="button" className="crm-person-note-action">
                Ajouter une note
              </button>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
