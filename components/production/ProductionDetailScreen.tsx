"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardList,
  Copy,
  ExternalLink,
  FileImage,
  Film,
  MapPin,
  Camera,
} from "lucide-react";
import { ProductionService } from "@/services/production.service";
import type { Production } from "@/types/production";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import { ProductionNotesCard } from "@/components/production/ProductionNotesCard";
import { ProductionStatusBadge } from "@/components/production/ProductionStatusBadge";
import { ProductionWorkflowWarnings } from "@/components/production/ProductionWorkflowWarnings";
import type { ProductionWorkflowResult, ProductionWorkflowStep } from "@/services/production-workflow";
import { ProductionMediaSection } from "@/components/production/ProductionMediaSection";
import { getProductionMediaSummary } from "@/services/production-media";

type ProductionDetailScreenProps = {
  id: string;
};

export const hasRealAthletesSource = (
  payload: AthletesResponse | { error?: string }
): payload is AthletesResponse => {
  return "source" in payload && payload.source === "google-sheets";
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeKey = (value: string): string =>
  normalize(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const formatDate = (value: string): string => {
  const raw = normalize(value);
  if (!raw) return "Non renseigne";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
    }
  }

  const fr = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
    }
  }

  return raw;
};

const displayValue = (value: string): string => {
  const text = normalize(value);
  return text && text !== "—" ? text : "Non renseigne";
};

const buildDisplayTitle = (production: Production): string => {
  const type = normalize(production.type);
  const athlete = normalize(production.athlete);
  if (type && athlete) return `${type} • ${athlete}`;
  if (type) return type;
  if (athlete) return athlete;
  return "Production";
};

const stateLabel = (step: ProductionWorkflowStep): string => {
  if (step.state === "inconsistent") return "A verifier";
  if (step.state === "completed") return "Termine";
  if (step.state === "current") return "En cours";
  return "A faire";
};

const summaryLabel = (workflow: ProductionWorkflowResult): string => {
  if (workflow.hasInconsistency) {
    return `${workflow.progressPercentage}% • ${workflow.inconsistencies.length} incoherence${workflow.inconsistencies.length > 1 ? "s" : ""}`;
  }
  if (workflow.isComplete) return "100% • Workflow termine";
  if (workflow.currentStep) return `${workflow.progressPercentage}% • ${workflow.currentStep.label} en cours`;
  if (workflow.nextStep) return `${workflow.progressPercentage}% • ${workflow.nextStep.label} a faire`;
  return `${workflow.progressPercentage}%`;
};

export function ProductionDetailScreen({ id }: ProductionDetailScreenProps) {
  const [production, setProduction] = useState<Production | null>(null);
  const [source, setSource] = useState<"google-sheets" | "demo">("google-sheets");
  const [sourceMessage, setSourceMessage] = useState("");
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athletesSourceReal, setAthletesSourceReal] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const workflowRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setErrorMessage(null);
      setSource("google-sheets");
      setSourceMessage("");
      setAthletesSourceReal(true);
      setAthletes([]);

      try {
        const [productionResult, athletesResponse] = await Promise.all([
          ProductionService.getById(id),
          fetch("/api/athletes", { cache: "no-store" }),
        ]);

        if (!active) return;

        setSource(productionResult.source);
        setSourceMessage(productionResult.message ?? "");

        if (productionResult.source !== "google-sheets") {
          const details = productionResult.message ? ` (${productionResult.message})` : "";
          throw new Error(`Les donnees Production reelles (Google Sheets) sont indisponibles.${details}`);
        }

        setProduction(productionResult.production);

        if (athletesResponse.ok) {
          const payload = (await athletesResponse.json()) as AthletesResponse | { error?: string };
          if (hasRealAthletesSource(payload)) {
            setAthletes(payload.athletes);
            setAthletesSourceReal(true);
          } else {
            setAthletes([]);
            setAthletesSourceReal(false);
          }
        } else {
          setAthletes([]);
          setAthletesSourceReal(false);
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger cette production.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [id, retryToken]);

  const linkedAthlete = useMemo(() => {
    if (!production) return null;
    const productionName = normalizeKey(production.athlete);
    return athletes.find((athlete) => normalizeKey(athlete.name) === productionName) ?? null;
  }, [athletes, production]);

  const workflow = useMemo(() => (production ? ProductionService.workflow(production) : null), [production]);

  const mediaSummary = useMemo(() => {
    if (!production || !workflow) return null;
    return getProductionMediaSummary(production, workflow);
  }, [production, workflow]);

  const driveUrl = mediaSummary?.hasValidDriveUrl ? mediaSummary.driveUrl : "";

  const copyCurrentUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyFeedback("Lien copie");
      window.setTimeout(() => setCopyFeedback(null), 1500);
    } catch {
      setCopyFeedback("Copie impossible");
      window.setTimeout(() => setCopyFeedback(null), 1500);
    }
  };

  const scrollToNextStep = () => {
    workflowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <section className="crm-partner-page" aria-live="polite" aria-busy="true">
        <section className="crm-person-skeleton crm-production-skeleton">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement de la production...</span>
        </section>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="crm-partner-page">
        <section className="crm-error-state" aria-live="assertive">
          <h2>Erreur de chargement</h2>
          <p>{errorMessage}</p>
          {source !== "google-sheets" ? <p>Source detectee: {source}{sourceMessage ? ` (${sourceMessage})` : ""}</p> : null}
          <div className="crm-person-error-actions">
            <button type="button" onClick={() => setRetryToken((value) => value + 1)}>Reessayer</button>
            <Link href="/production" className="crm-secondary-action-link">Retour aux productions</Link>
          </div>
        </section>
      </section>
    );
  }

  if (!production || !workflow) {
    return (
      <section className="crm-partner-page">
        <section className="crm-empty-state" aria-live="polite">
          <div className="crm-empty-icon" aria-hidden>
            <AlertCircle size={20} />
          </div>
          <h2>Production introuvable</h2>
          <p>La production demandee n existe pas ou n est plus disponible.</p>
          <Link href="/production" className="crm-secondary-action-link">Retour aux productions</Link>
        </section>
      </section>
    );
  }

  const displayTitle = buildDisplayTitle(production);
  const secondaryInfo = [
    production.date && production.date !== "—" ? { icon: CalendarDays, label: formatDate(production.date) } : null,
    production.lieu && production.lieu !== "—" ? { icon: MapPin, label: production.lieu } : null,
    production.sport && production.sport !== "—" ? { icon: ClipboardList, label: production.sport } : null,
    production.photographe && production.photographe !== "—" ? { icon: Camera, label: production.photographe } : null,
  ].filter((item): item is { icon: typeof CalendarDays; label: string } => Boolean(item));

  return (
    <section className="crm-partner-page">
      <div className="crm-partner-head-nav">
        <Link href="/production" className="crm-secondary-action-link">
          <ArrowLeft size={15} aria-hidden /> Retour aux productions
        </Link>
        <p className="crm-production-breadcrumb">Production / {displayTitle}</p>
      </div>

      <header className="crm-person-hero crm-partner-hero crm-production-hero">
        <div className="crm-person-hero-main crm-partner-hero-main">
          <span className="crm-person-portrait crm-partner-portrait" aria-hidden>
            {production.type.slice(0, 2).toUpperCase()}
          </span>

          <div className="crm-person-title-wrap crm-partner-title-wrap">
            <div>
              <h1>{displayTitle}</h1>
              <p>{displayValue(production.objectif)}</p>
            </div>
            <small className="crm-partner-priority-badge">{displayValue(production.type)}</small>
            <ProductionStatusBadge label={workflow.statusLabel} tone={workflow.statusTone} />
          </div>

          {secondaryInfo.length ? (
            <div className="crm-person-contact-row crm-partner-contact-row">
              {secondaryInfo.map((item) => (
                <span key={item.label} className="crm-person-contact-pill">
                  <item.icon size={14} aria-hidden />
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="crm-person-hero-actions" aria-label="Actions fiche production">
          {driveUrl ? (
            <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="crm-hero-ghost-action">
              <ExternalLink size={15} aria-hidden /> Ouvrir le Drive
            </a>
          ) : null}
          {workflow.nextStep ? (
            <button type="button" className="crm-hero-ghost-action" onClick={scrollToNextStep}>
              <ClipboardList size={15} aria-hidden /> Voir l etape suivante
            </button>
          ) : null}
          <button type="button" className="crm-hero-ghost-action" onClick={copyCurrentUrl} aria-label="Copier le lien de la fiche">
            <Copy size={15} aria-hidden /> Copier le lien
          </button>
          <Link href="/production" className="crm-hero-ghost-action" aria-label="Retour a la liste Production">
            <ArrowLeft size={15} aria-hidden /> Retour a la liste
          </Link>
          {copyFeedback ? <small className="crm-skeleton-label">{copyFeedback}</small> : null}
        </div>
      </header>

      <section ref={workflowRef}>
        <article className="crm-person-card-shell crm-production-workflow-card">
          <header>
            <h2>Workflow de production</h2>
          </header>

          <ol className="crm-production-workflow-track" aria-label="Etapes du workflow">
            {workflow.steps.map((step) => (
              <li key={step.id} className={`crm-production-step is-${step.state}`}>
                <span className="crm-production-step-dot" aria-hidden>
                  {step.isCompleted ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{stateLabel(step)}</small>
                </div>
              </li>
            ))}
          </ol>

          <div className="production-workflow-cell crm-production-global-progress">
            <span className="production-progress-bar" aria-hidden>
              <span style={{ width: `${workflow.progressPercentage}%` }} />
            </span>
            <strong aria-label={`Progression: ${workflow.progressPercentage}%`}>{workflow.progressPercentage}%</strong>
          </div>
          <p className="crm-skeleton-label">{workflow.completedSteps} etapes sur {workflow.totalSteps} terminees</p>
          <p className="production-workflow-summary-line">{summaryLabel(workflow)}</p>
          {workflow.nextStep ? (
            <p className="crm-skeleton-label">Prochaine etape: {workflow.nextStep.label}</p>
          ) : (
            <p className="crm-skeleton-label">Aucune etape restante.</p>
          )}
        </article>
      </section>

      <ProductionWorkflowWarnings inconsistencies={workflow.inconsistencies} />

      <section className="crm-production-kpi-grid">
        <article className="crm-person-kpi-item">
          <strong>{production.nbPhotos}</strong>
          <small>Photos</small>
          <span className="crm-person-kpi-icon" aria-hidden><FileImage size={16} /></span>
        </article>
        <article className="crm-person-kpi-item">
          <strong>{production.nbVideos}</strong>
          <small>Videos</small>
          <span className="crm-person-kpi-icon" aria-hidden><Film size={16} /></span>
        </article>
        <article className="crm-person-kpi-item">
          <strong>{workflow.progressPercentage}%</strong>
          <small>Progression</small>
          <span className="crm-person-kpi-icon" aria-hidden><ClipboardList size={16} /></span>
        </article>
        <article className="crm-person-kpi-item">
          <strong>{workflow.statusLabel}</strong>
          <small>Statut operationnel</small>
          <span className="production-kpi-status-wrap">
            <ProductionStatusBadge label={workflow.statusLabel} tone={workflow.statusTone} />
          </span>
          <span className="crm-person-kpi-icon" aria-hidden><CheckCircle2 size={16} /></span>
        </article>
      </section>

      <section className="crm-partner-layout crm-production-detail-grid">
        <div className="crm-production-main-column">
          <article className="crm-person-card-shell">
            <header>
              <h2>Informations</h2>
            </header>
            <div className="crm-person-info-columns">
              <dl className="crm-person-info-grid">
                <div><dt>Date</dt><dd>{formatDate(production.date)}</dd></div>
                <div><dt>Athlete</dt><dd>{displayValue(production.athlete)}</dd></div>
                <div><dt>Sport</dt><dd>{displayValue(production.sport)}</dd></div>
                <div><dt>Type</dt><dd>{displayValue(production.type)}</dd></div>
                <div><dt>Lieu</dt><dd>{displayValue(production.lieu)}</dd></div>
              </dl>
              <dl className="crm-person-info-grid">
                <div><dt>Objectif</dt><dd className="crm-production-long-value">{displayValue(production.objectif)}</dd></div>
                <div><dt>Materiel</dt><dd className="crm-production-long-value">{displayValue(production.materiel)}</dd></div>
                <div><dt>Photographe</dt><dd>{displayValue(production.photographe)}</dd></div>
                <div><dt>Statut source</dt><dd>{displayValue(workflow.statusSource)}</dd></div>
              </dl>
            </div>
          </article>

          {mediaSummary ? <ProductionMediaSection production={production} media={mediaSummary} /> : null}
        </div>

        <div className="crm-production-side-column">
          <article className="crm-person-card-shell">
            <header>
              <h2>Checklist</h2>
            </header>
            <ul className="crm-production-checklist" aria-label="Checklist operationnelle">
              {workflow.steps.map((step) => (
                <li key={step.id} className={`is-${step.state}`}>
                  <span aria-hidden>{step.isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}</span>
                  <p>{step.label} • {stateLabel(step)}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="crm-person-card-shell">
            <header>
              <h2>Athlete lie</h2>
            </header>
            <dl className="crm-person-info-grid">
              <div><dt>Nom de l athlete</dt><dd>{displayValue(production.athlete)}</dd></div>
              <div><dt>Sport</dt><dd>{displayValue(production.sport)}</dd></div>
              <div><dt>Type de relation</dt><dd>Production</dd></div>
            </dl>
            {!athletesSourceReal ? (
              <p className="crm-skeleton-label">Donnees Athlete reelles indisponibles.</p>
            ) : linkedAthlete ? (
              <Link href={`/crm/personnes/${linkedAthlete.key}`} className="crm-secondary-action-link">
                Voir la fiche Athlete
              </Link>
            ) : (
              <p className="crm-skeleton-label">Fiche Athlete liee non trouvee.</p>
            )}
          </article>

          <ProductionNotesCard note={normalize(String(production.raw.notes ?? ""))} />
        </div>
      </section>
    </section>
  );
}
