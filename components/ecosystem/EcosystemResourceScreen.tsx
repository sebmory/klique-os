"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Edit3,
  Flag,
  Gauge,
  Globe,
  Mail,
  MoreHorizontal,
  NotebookPen,
  Phone,
  Share2,
  Sparkles,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { EcosystemService } from "@/services/ecosystem.service";
import type { EcosystemListResponse, EcosystemResource } from "@/types/ecosystem";

type EcosystemResourceScreenProps = {
  id: string;
};

export const hasRealEcosystemSource = (payload: EcosystemListResponse): boolean => {
  return payload.source === "google-sheets";
};

type DateDisplay = {
  label: string;
  rank: number | null;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isInvalidPlaceholderDate = (value: string): boolean => {
  const cleaned = normalize(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[./]/g, "-");

  if (!cleaned) return true;
  return cleaned === "30-12-1899" || cleaned === "1899-12-30";
};

const parseDate = (value: string): Date | null => {
  if (isInvalidPlaceholderDate(value)) return null;

  const text = normalize(value);
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date;
    }
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: string): DateDisplay => {
  const parsed = parseDate(value);
  if (!parsed) return { label: "Non renseigne", rank: null };

  return {
    label: new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed),
    rank: parsed.getTime(),
  };
};

const formatEstimatedValue = (value: string): string => {
  const cleaned = normalize(value).replace(/[^\d,.-]/g, "").replace(/,/g, ".").trim();
  if (!cleaned) return "Non renseigne";

  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return "Non renseigne";

  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(amount);
};

const parseContractSigned = (value: string): "Oui" | "Non" | "Non renseigne" => {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return "Non renseigne";
  if (["oui", "yes", "true", "1", "signe", "signé"].includes(normalized)) return "Oui";
  if (["non", "no", "false", "0"].includes(normalized)) return "Non";
  return "Non renseigne";
};

const statusBadgeClass = (value: string): string => {
  const normalized = normalize(value).toLowerCase();
  if (normalized.includes("actif")) return "is-actif";
  if (normalized.includes("prospect")) return "is-prospect";
  if (normalized.includes("inactif")) return "is-inactif";
  return "is-inactif";
};

const monogram = (name: string): string =>
  normalize(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const normalizeUrl = (value: string): string => {
  const text = normalize(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
};

const isValidEmail = (value: string): boolean => /.+@.+\..+/.test(value.trim());
const cleanPhone = (value: string): string => value.replace(/[^+\d]/g, "").trim();
const isValidPhone = (value: string): boolean => cleanPhone(value).replace(/\D/g, "").length >= 6;

const typeLabel = (type: string): string => {
  const normalized = normalizeKey(type);
  if (normalized === "partenaire") return "Partenaire";
  if (normalized === "expert") return "Expert";
  if (normalized === "media" || normalized === "média") return "Média";
  return normalize(type) || "Autre";
};

const buildContributionBlocks = (resource: EcosystemResource): Array<{ label: string; value: string }> => {
  const type = normalizeKey(resource.type);

  const partnerOrder: Array<{ label: string; value: string }> = [
    { label: "Offre membres", value: resource.memberOffer },
    { label: "Services", value: resource.services },
    { label: "Contenus / contreparties", value: resource.deliverables },
    { label: "Expertise", value: resource.expertise },
  ];

  const expertOrder: Array<{ label: string; value: string }> = [
    { label: "Expertise", value: resource.expertise },
    { label: "Services", value: resource.services },
    { label: "Accompagnement", value: resource.deliverables },
    { label: "Offre membres", value: resource.memberOffer },
  ];

  const mediaOrder: Array<{ label: string; value: string }> = [
    { label: "Visibilite / formats", value: resource.deliverables },
    { label: "Opportunites", value: resource.expertise },
    { label: "Services", value: resource.services },
    { label: "Offre membres", value: resource.memberOffer },
  ];

  const genericOrder: Array<{ label: string; value: string }> = [
    { label: "Apport principal", value: resource.memberOffer },
    { label: "Expertise", value: resource.expertise },
    { label: "Services", value: resource.services },
    { label: "Contenus / livrables", value: resource.deliverables },
  ];

  const source = type === "partenaire" ? partnerOrder : type === "expert" ? expertOrder : (type === "media" || type === "média") ? mediaOrder : genericOrder;

  return source.filter((item) => normalize(item.value));
};

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="crm-person-kpi-item crm-partner-kpi-item">
      <strong>{value}</strong>
      <small>{label}</small>
      <span className="crm-person-kpi-icon" aria-hidden>
        <Icon size={16} />
      </span>
    </div>
  );
}

export function EcosystemResourceScreen({ id }: EcosystemResourceScreenProps) {
  const [resources, setResources] = useState<EcosystemResource[]>([]);
  const [source, setSource] = useState<"google-sheets" | "demo">("google-sheets");
  const [sourceMessage, setSourceMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setErrorMessage(null);
      setSource("google-sheets");
      setSourceMessage("");
      try {
        const response = await EcosystemService.list();
        if (!active) return;
        setSource(response.source);
        setSourceMessage(response.message ?? "");

        if (hasRealEcosystemSource(response)) {
          setResources(response.resources);
        } else {
          setResources([]);
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger cette ressource.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [retryToken]);

  const resource = useMemo(() => {
    const key = decodeURIComponent(id);
    return resources.find((item) => item.id === key || item.slug === key) ?? null;
  }, [id, resources]);

  const type = typeLabel(resource?.type ?? "");
  const lastContact = formatDate(resource?.lastContact ?? "");
  const nextFollowUp = formatDate(resource?.nextFollowUp ?? "");
  const collaborationStart = formatDate(resource?.collaborationStart ?? "");
  const collaborationEnd = formatDate(resource?.collaborationEnd ?? "");

  const contributionBlocks = useMemo(
    () => (resource ? buildContributionBlocks(resource) : []),
    [resource]
  );

  const websiteHref = normalizeUrl(resource?.website ?? "");
  const instagramHref = normalizeUrl(resource?.instagram ?? "");
  const emailHref = resource?.email && isValidEmail(resource.email) ? `mailto:${resource.email}` : "";
  const phoneValue = resource?.phone ? cleanPhone(resource.phone) : "";
  const phoneHref = phoneValue && isValidPhone(phoneValue) ? `tel:${phoneValue}` : "";

  if (loading) {
    return (
      <section className="crm-partner-page" aria-live="polite" aria-busy="true">
        <section className="crm-person-skeleton">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement de la fiche ressource...</span>
        </section>
      </section>
    );
  }

  if (errorMessage || !resource) {
    const isRealDataUnavailable = !errorMessage && source !== "google-sheets";

    return (
      <section className="crm-partner-page">
        <section className="crm-error-state" aria-live="assertive">
          <h2>{isRealDataUnavailable ? "Donnees indisponibles" : "Ressource introuvable"}</h2>
          <p>
            {isRealDataUnavailable
              ? "Données Écosystème réelles indisponibles"
              : errorMessage ?? "Aucune ressource ne correspond a cette URL."}
          </p>
          {isRealDataUnavailable && sourceMessage ? <p>{sourceMessage}</p> : null}
          <div className="crm-person-error-actions">
            <Link href="/ecosysteme" className="crm-secondary-action-link">Retour a l ecosysteme</Link>
            <button type="button" onClick={() => setRetryToken((value) => value + 1)}>Reessayer</button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="crm-partner-page">
      <div className="crm-partner-head-nav">
        <Link href="/ecosysteme" className="crm-secondary-action-link">
          <ArrowLeft size={15} aria-hidden /> Retour a l ecosysteme
        </Link>
      </div>

      <header className="crm-person-hero crm-partner-hero">
        <div className="crm-person-hero-main crm-partner-hero-main">
          <span className="crm-person-portrait crm-partner-portrait" aria-hidden>{monogram(resource.name)}</span>

          <div className="crm-person-title-wrap crm-partner-title-wrap">
            <div>
              <h1>{resource.name}</h1>
              <p>{resource.category || "Non renseigne"} · {type}</p>
            </div>
            <small className="crm-partner-priority-badge">{type}</small>
            <small className={`crm-status-badge ${statusBadgeClass(resource.status)}`}>{resource.status || "Non renseigne"}</small>
          </div>

          <div className="crm-person-contact-row crm-partner-contact-row">
            <span className="crm-person-contact-pill crm-partner-contact-person-pill">
              <UserRound size={14} aria-hidden />
              <span>{resource.contactName || "Non renseigne"}{resource.contactRole ? ` · ${resource.contactRole}` : ""}</span>
            </span>

            {websiteHref ? (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="crm-person-contact-pill" aria-label="Ouvrir le site web">
                <Globe size={14} aria-hidden />
                <span>{resource.website}</span>
              </a>
            ) : null}

            {instagramHref ? (
              <a href={instagramHref} target="_blank" rel="noopener noreferrer" className="crm-person-contact-pill" aria-label="Ouvrir Instagram">
                <Sparkles size={14} aria-hidden />
                <span>{resource.instagram}</span>
              </a>
            ) : null}

            {emailHref ? (
              <a href={emailHref} className="crm-person-contact-pill" aria-label="Envoyer un email">
                <Mail size={14} aria-hidden />
                <span>{resource.email}</span>
              </a>
            ) : null}

            {phoneHref ? (
              <a href={phoneHref} className="crm-person-contact-pill" aria-label="Appeler le contact">
                <Phone size={14} aria-hidden />
                <span>{resource.phone}</span>
              </a>
            ) : null}
          </div>
        </div>

        <div className="crm-person-hero-actions" aria-label="Actions fiche ressource">
          <button type="button" className="crm-hero-ghost-action"><Edit3 size={15} aria-hidden />Modifier</button>
          <button type="button" className="crm-hero-ghost-action"><Share2 size={15} aria-hidden />Partager</button>
          <button type="button" className="crm-hero-icon-action" aria-label="Plus d actions"><MoreHorizontal size={16} aria-hidden /></button>
        </div>
      </header>

      <section className="crm-partner-layout">
        <article className="crm-person-card-shell crm-partner-span-two crm-partner-offer-card">
          <header><h2>Ce que cette ressource apporte</h2></header>

          {contributionBlocks.length ? (
            <dl className="crm-person-info-grid crm-partner-inline-grid">
              {contributionBlocks.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="crm-person-empty-note crm-partner-empty-tight">
              <div className="crm-person-empty-note-icon" aria-hidden><Sparkles size={16} /></div>
              <p>Aucun apport specifique renseigne pour le moment.</p>
            </div>
          )}
        </article>

        <article className="crm-person-card-shell crm-partner-span-one">
          <header><h2>Actions rapides</h2></header>
          <div className="crm-person-quick-actions crm-partner-quick-actions">
            <button type="button" className="crm-person-quick-action"><Phone size={16} aria-hidden />Enregistrer un contact</button>
            <button type="button" className="crm-person-quick-action"><Bell size={16} aria-hidden />Planifier une relance</button>
            <button type="button" className="crm-person-quick-action"><NotebookPen size={16} aria-hidden />Ajouter une note</button>
            <button type="button" className="crm-person-quick-action"><BriefcaseBusiness size={16} aria-hidden />Preparer une proposition</button>
          </div>
        </article>

        <article className="crm-person-card-shell crm-partner-span-two">
          <header><h2>Pilotage</h2></header>
          <div className="crm-person-kpi-grid crm-partner-kpi-grid">
            <KpiCard icon={CalendarDays} label="Dernier contact" value={lastContact.label} />
            <KpiCard icon={Bell} label="Prochaine relance" value={nextFollowUp.label} />
            <KpiCard icon={ClipboardList} label="Prochaine action" value={resource.nextAction || "Non renseigne"} />
            <KpiCard icon={Flag} label="Priorite strategique" value={resource.strategicPriority || "Non renseigne"} />
            <KpiCard icon={Gauge} label="Potentiel" value={resource.potential || "Non renseigne"} />
            <KpiCard icon={Wallet} label="Valeur estimee" value={formatEstimatedValue(resource.estimatedValue)} />
          </div>
        </article>

        <article className="crm-person-card-shell crm-partner-span-two">
          <header><h2>Relation avec KLIQUE</h2></header>
          <div className="crm-person-info-columns">
            <dl className="crm-person-info-grid">
              <div><dt>Statut</dt><dd>{resource.status || "Non renseigne"}</dd></div>
              <div><dt>Contrat signe</dt><dd><small className="crm-partner-contract-badge">{parseContractSigned(resource.contractSigned)}</small></dd></div>
              <div><dt>Contenus / contreparties</dt><dd>{resource.deliverables || "Non renseigne"}</dd></div>
            </dl>
            <dl className="crm-person-info-grid">
              <div><dt>Dernier contact</dt><dd>{lastContact.label}</dd></div>
              <div><dt>Prochaine relance</dt><dd>{nextFollowUp.label}</dd></div>
              <div><dt>Debut collaboration</dt><dd>{collaborationStart.label}</dd></div>
              <div><dt>Fin collaboration</dt><dd>{collaborationEnd.label}</dd></div>
            </dl>
          </div>
        </article>

        <article className="crm-person-card-shell crm-partner-span-one">
          <header><h2>Contact</h2></header>
          <dl className="crm-person-info-grid">
            <div><dt>Contact principal</dt><dd>{resource.contactName || "Non renseigne"}</dd></div>
            <div><dt>Fonction</dt><dd>{resource.contactRole || "Non renseigne"}</dd></div>
            <div><dt>Email</dt><dd>{emailHref ? <a href={emailHref} className="crm-partner-inline-link">{resource.email}</a> : "Non renseigne"}</dd></div>
            <div><dt>Telephone</dt><dd>{phoneHref ? <a href={phoneHref} className="crm-partner-inline-link">{resource.phone}</a> : "Non renseigne"}</dd></div>
            <div><dt>Site</dt><dd>{websiteHref ? <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="crm-partner-inline-link">{resource.website}</a> : "Non renseigne"}</dd></div>
            <div><dt>Instagram</dt><dd>{instagramHref ? <a href={instagramHref} target="_blank" rel="noopener noreferrer" className="crm-partner-inline-link">{resource.instagram}</a> : "Non renseigne"}</dd></div>
          </dl>
        </article>

        <article className="crm-person-card-shell crm-partner-span-two">
          <header><h2>Notes</h2></header>
          {resource.notes ? (
            <p className="crm-person-notes-text">{resource.notes}</p>
          ) : (
            <div className="crm-person-empty-note">
              <div className="crm-person-empty-note-icon" aria-hidden><NotebookPen size={16} /></div>
              <p>Aucune note pour le moment.</p>
              <button type="button" className="crm-person-note-action">Ajouter une note</button>
            </div>
          )}
        </article>

        <article className="crm-person-card-shell crm-partner-span-one">
          <header><h2>Prochaine etape</h2></header>
          <dl className="crm-person-info-grid crm-partner-inline-grid">
            <div><dt>Prochaine action</dt><dd>{resource.nextAction || "Non renseigne"}</dd></div>
            <div><dt>Prochaine relance</dt><dd>{nextFollowUp.label}</dd></div>
          </dl>
          <button type="button" className="crm-person-quick-action crm-partner-single-action">
            <CalendarClock size={16} aria-hidden /> Planifier une action
          </button>
        </article>
      </section>
    </section>
  );
}
