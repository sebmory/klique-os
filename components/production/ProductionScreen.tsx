"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, LayoutGrid, LayoutList, MoreHorizontal, Search } from "lucide-react";
import { ProductionService } from "@/services/production.service";
import { ShootingService } from "@/services/shooting.service";
import type { Production, ProductionResponse } from "@/types/production";
import type { Athlete } from "@/types/athlete";
import type { NewShooting } from "@/types/shooting";
import { getProductionStatusPriority, type ProductionWorkflowResult } from "@/services/production-workflow";
import { ProductionStatusBadge } from "@/components/production/ProductionStatusBadge";
import { Modal } from "@/components/ui/Modal";

type SortKey = "date" | "name" | "progress" | "operationalStatus";
type ViewMode = "list" | "cards";

const normalize = (value: unknown): string => String(value ?? "").trim();

const parseDateRank = (value: string): number => {
  const raw = normalize(value);
  if (!raw) return Number.MIN_SAFE_INTEGER;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? Number.MIN_SAFE_INTEGER : date.getTime();
  }

  const fr = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime();
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? Number.MIN_SAFE_INTEGER : parsed.getTime();
};

const formatDate = (value: string): string => {
  const rank = parseDateRank(value);
  if (rank === Number.MIN_SAFE_INTEGER) return "Non renseigne";
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(rank));
};

const workflowCompactLabel = (workflow: ProductionWorkflowResult): string => {
  if (workflow.hasInconsistency) {
    return `${workflow.progressPercentage}% • ${workflow.inconsistencies.length} incoherence${workflow.inconsistencies.length > 1 ? "s" : ""}`;
  }
  if (workflow.isComplete) return "100% • Workflow termine";
  if (workflow.currentStep) return `${workflow.progressPercentage}% • ${workflow.currentStep.label} en cours`;
  if (workflow.nextStep) return `${workflow.progressPercentage}% • ${workflow.nextStep.label} a faire`;
  return `${workflow.progressPercentage}%`;
};

const statusFilterOrder = ["A verifier", "Pret a publier", "En production", "A demarrer", "Termine"];

const productionMonogram = (production: Production): string => {
  const source = normalize(production.type) || "PR";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const emptyCreateForm: NewShooting = {
  date: "",
  athlete: "",
  sport: "",
  type: "Portrait",
  place: "",
  objective: "",
  photographer: "Sébastien Mory",
  status: "Planifié",
  photos: 0,
  videos: 0,
  lightroomLink: "",
  driveLink: "",
  clientGalleryLink: "",
  instagramLink: "",
  shootingDone: false,
  importDone: false,
  backupDone: false,
  sortDone: false,
  retouchDone: false,
  exportDone: false,
  driveDone: false,
  publishedInstagram: false,
  publishedFacebook: false,
  publishedLinkedIn: false,
  published: false,
  deliverableClub: false,
  deliverableAthlete: false,
  deliverableSponsor: false,
  deliverableMedia: false,
  deliverableAgency: false,
  deliverableOther: false,
  notes: "",
};

export function ProductionScreen() {
  const [items, setItems] = useState<Production[]>([]);
  const [source, setSource] = useState<ProductionResponse["source"]>("google-sheets");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<NewShooting>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [pendingDeleteProduction, setPendingDeleteProduction] = useState<Production | null>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tous");
  const [sport, setSport] = useState("Tous");
  const [type, setType] = useState("Tous");
  const [photographer, setPhotographer] = useState("Tous");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const payload = await ProductionService.list();
        if (!active) return;
        setItems(payload.productions);
        setSource(payload.source);
        setMessage(payload.message ?? "");
        setActiveId(payload.productions[0]?.id ?? null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger la production.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [retryToken]);

  useEffect(() => {
    const loadAthletes = async () => {
      try {
        const response = await fetch("/api/athletes", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { athletes?: Athlete[] };
        setAthletes(payload.athletes ?? []);
      } catch {
        setAthletes([]);
      }
    };

    void loadAthletes();
  }, []);

  useEffect(() => {
    const handleDocumentPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".crm-row-menu-shell")) {
        setOpenMenuId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };

    document.addEventListener("pointerdown", handleDocumentPointer);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const enriched = useMemo(
    () => items.map((item) => ({ item, workflow: ProductionService.workflow(item) })),
    [items]
  );

  const statusOptions = useMemo(() => {
    const present = new Set(enriched.map(({ workflow }) => workflow.statusLabel));
    const ordered = statusFilterOrder.filter((value) => present.has(value));
    return ["Tous", ...ordered];
  }, [enriched]);

  const sportOptions = useMemo(() => ["Tous", ...Array.from(new Set(items.map((item) => item.sport).filter(Boolean)))], [items]);
  const typeOptions = useMemo(() => ["Tous", ...Array.from(new Set(items.map((item) => item.type).filter(Boolean)))], [items]);
  const photographerOptions = useMemo(() => ["Tous", ...Array.from(new Set(items.map((item) => item.photographe).filter(Boolean)))], [items]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query).toLowerCase();

    const data = enriched.filter(({ item, workflow }) => {
      const statusMatch = status === "Tous" || workflow.statusLabel === status;
      const sportMatch = sport === "Tous" || item.sport === sport;
      const typeMatch = type === "Tous" || item.type === type;
      const photoMatch = photographer === "Tous" || item.photographe === photographer;

      if (!statusMatch || !sportMatch || !typeMatch || !photoMatch) return false;

      if (!normalizedQuery) return true;

      return [item.type, item.objectif, item.sport, item.athlete, item.lieu, item.photographe, workflow.statusLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return [...data].sort((a, b) => {
      if (sortBy === "name") return a.item.athlete.localeCompare(b.item.athlete);
      if (sortBy === "progress") return a.workflow.progressPercentage - b.workflow.progressPercentage;
      if (sortBy === "operationalStatus") {
        const rankDiff = getProductionStatusPriority(a.workflow.calculatedStatus) - getProductionStatusPriority(b.workflow.calculatedStatus);
        if (rankDiff !== 0) return rankDiff;
        return a.workflow.progressPercentage - b.workflow.progressPercentage;
      }
      return parseDateRank(b.item.date) - parseDateRank(a.item.date);
    });
  }, [enriched, query, status, sport, type, photographer, sortBy]);

  const isEmpty = !loading && filtered.length === 0;

  const selectAthlete = (name: string) => {
    const athlete = athletes.find((item) => item.name === name);
    setCreateForm((current) => ({
      ...current,
      athlete: name,
      sport: athlete?.sport ?? current.sport,
    }));
  };

  const requestDeleteProduction = (production: Production) => {
    setPendingDeleteProduction(production);
    setOpenMenuId(null);
  };

  const deleteProduction = async () => {
    if (!pendingDeleteProduction?.row) {
      setFeedbackMessage("Impossible de supprimer cette production : aucune ligne de stockage n’est disponible.");
      setPendingDeleteProduction(null);
      return;
    }

    try {
      await ShootingService.remove(pendingDeleteProduction.row);
      setItems((current) => current.filter((item) => item.id !== pendingDeleteProduction.id));
      setFeedbackMessage(`Production supprimée : ${pendingDeleteProduction.athlete}.`);
      setPendingDeleteProduction(null);
      setActiveId((current) => (current === pendingDeleteProduction.id ? null : current));
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Impossible de supprimer cette production.");
    }
  };

  const createProduction = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateFeedback("");

    try {
      const productionToCreate: NewShooting = {
        ...createForm,
        status: "Planifié",
        importDone: false,
        sortDone: false,
        retouchDone: false,
        exportDone: false,
        driveDone: false,
        published: false,
      };

      await ShootingService.create(productionToCreate);

      const optimisticProduction: Production = {
        id: `production-${items.length + 4}`,
        date: productionToCreate.date,
        type: productionToCreate.type,
        athlete: productionToCreate.athlete,
        sport: productionToCreate.sport,
        lieu: productionToCreate.place,
        objectif: productionToCreate.objective,
        materiel: productionToCreate.equipment ?? "—",
        photographe: productionToCreate.photographer,
        statut: "Planifié",
        nbPhotos: productionToCreate.photos,
        nbVideos: productionToCreate.videos,
        importDone: false,
        triDone: false,
        retoucheDone: false,
        exportDone: false,
        driveDone: false,
        published: false,
        raw: { ...productionToCreate },
      };

      setItems((current) => [optimisticProduction, ...current]);
      setShowCreate(false);
      setCreateForm(emptyCreateForm);
      const refreshed = await ProductionService.list();
      setItems(refreshed.productions);
      const createdProduction = refreshed.productions.find(
        (item) =>
          item.date === productionToCreate.date &&
          item.athlete === productionToCreate.athlete &&
          item.type === productionToCreate.type &&
          item.lieu === productionToCreate.place
      );
      if (createdProduction) {
        setActiveId(createdProduction.id);
        router.push(`/production/${createdProduction.id}`);
      }
    } catch (error) {
      setCreateFeedback(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="crm-people-screen">
      <header className="crm-people-header">
        <div>
          <h1>Production</h1>
          <p>Pilotez tous les contenus créés pour les athlètes KLIQUE.</p>
        </div>
        <button type="button" className="crm-primary-action" onClick={() => {
          setCreateForm({ ...emptyCreateForm });
          setShowCreate(true);
          setCreateFeedback("");
        }}>+ Nouvelle production</button>
      </header>

      {source === "demo" && message ? (
        <section className="crm-partners-info-banner" aria-live="polite">
          <strong>Source de donnees: demo</strong>
          <p>{message}</p>
        </section>
      ) : null}

      {createFeedback ? (
        <section className="crm-partners-info-banner" aria-live="polite">
          <p>{createFeedback}</p>
        </section>
      ) : null}

      {feedbackMessage ? (
        <section className="crm-partners-info-banner" aria-live="polite">
          <p>{feedbackMessage}</p>
        </section>
      ) : null}

      <section className="crm-actions-bar" aria-label="Filtres production">
        <label className="crm-search" htmlFor="production-search">
          <Search size={18} aria-hidden />
          <input
            id="production-search"
            type="search"
            placeholder="Rechercher une production..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="crm-actions-right">
          <label className="crm-select-wrap">
            <span>Statut</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label className="crm-select-wrap">
            <span>Sport</span>
            <select value={sport} onChange={(event) => setSport(event.target.value)}>
              {sportOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label className="crm-select-wrap">
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label className="crm-select-wrap">
            <span>Photographe</span>
            <select value={photographer} onChange={(event) => setPhotographer(event.target.value)}>
              {photographerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label className="crm-select-wrap">
            <span>Trier</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
              <option value="date">Date</option>
              <option value="name">Nom</option>
              <option value="progress">Progression</option>
              <option value="operationalStatus">Statut operationnel</option>
            </select>
          </label>

          <div className="crm-view-toggle" role="group" aria-label="Choix de vue">
            <button
              type="button"
              className={viewMode === "list" ? "is-active" : undefined}
              onClick={() => setViewMode("list")}
              aria-label="Vue liste"
            >
              <LayoutList size={18} aria-hidden />
              <span>Liste</span>
            </button>
            <button
              type="button"
              className={viewMode === "cards" ? "is-active" : undefined}
              onClick={() => setViewMode("cards")}
              aria-label="Vue cartes"
            >
              <LayoutGrid size={18} aria-hidden />
              <span>Cartes</span>
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="crm-skeleton-shell" aria-live="polite" aria-busy="true">
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <div className="crm-skeleton-row" />
          <span className="crm-skeleton-label">Chargement des productions...</span>
        </section>
      ) : null}

      {!loading && errorMessage ? (
        <section className="crm-error-state" aria-live="assertive">
          <h2>Impossible de charger la production</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={() => setRetryToken((value) => value + 1)}>Reessayer</button>
        </section>
      ) : null}

      {!loading && !errorMessage && isEmpty ? (
        <section className="crm-empty-state" aria-live="polite">
          <div className="crm-empty-icon" aria-hidden><Search size={20} /></div>
          <h2>Aucune production ne correspond a votre recherche</h2>
          <p>Ajustez les filtres pour retrouver une production.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("Tous");
              setSport("Tous");
              setType("Tous");
              setPhotographer("Tous");
            }}
          >
            Reinitialiser les filtres
          </button>
        </section>
      ) : null}

      {!loading && !errorMessage && !isEmpty ? (
        <>
          <section className={viewMode === "cards" ? "production-list-shell is-hidden" : "production-list-shell"}>
            <div className="production-list-head" role="row">
              <span>Production</span>
              <span>Athlete</span>
              <span>Date</span>
              <span>Lieu</span>
              <span>Statut</span>
              <span>Workflow</span>
              <span>Photos</span>
              <span>Videos</span>
              <span aria-hidden>Actions</span>
            </div>
            <ul className="crm-partner-list-body">
              {filtered.map(({ item, workflow }) => {
                return (
                  <li key={item.id}>
                    <div className={item.id === activeId ? "production-row is-active" : "production-row"}>
                      <Link
                        href={`/production/${item.id}`}
                        className="crm-partner-row-link-overlay"
                        aria-label={`Ouvrir la production de ${item.athlete}`}
                        onClick={() => {
                          setActiveId(item.id);
                          setOpenMenuId(null);
                        }}
                      />

                      <span className="crm-person-cell">
                        <span className="crm-avatar" aria-hidden>{productionMonogram(item)}</span>
                        <span className="crm-name-stack">
                          <strong>{item.type}</strong>
                          <small>{item.objectif} · {item.sport}</small>
                        </span>
                      </span>

                      <span>{item.athlete}</span>
                      <span>{formatDate(item.date)}</span>
                      <span>{item.lieu}</span>
                      <span>
                        <ProductionStatusBadge label={workflow.statusLabel} tone={workflow.statusTone} />
                      </span>

                      <span className="production-workflow-cell">
                        <span className="production-progress-bar" aria-hidden>
                          <span style={{ width: `${workflow.progressPercentage}%` }} />
                        </span>
                        <strong>{workflow.progressPercentage}%</strong>
                        <small className="production-workflow-hint">
                          {workflow.hasInconsistency ? <AlertTriangle size={12} aria-hidden /> : null}
                          <span>{workflowCompactLabel(workflow)}</span>
                        </small>
                      </span>

                      <span>{item.nbPhotos}</span>
                      <span>{item.nbVideos}</span>

                      <span className="crm-row-menu-shell">
                        <button
                          type="button"
                          className="crm-row-menu-trigger"
                          aria-label={`Actions production ${item.athlete}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId((current) => (current === item.id ? null : item.id));
                          }}
                        >
                          <MoreHorizontal size={16} aria-hidden />
                        </button>
                        {openMenuId === item.id ? (
                          <div className="crm-row-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                            <Link href={`/production/${item.id}`} role="menuitem">Voir</Link>
                            <button type="button" role="menuitem" onClick={() => requestDeleteProduction(item)}>Supprimer</button>
                            <button type="button" role="menuitem" disabled>Archiver</button>
                          </div>
                        ) : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={viewMode === "list" ? "crm-partner-cards-grid desktop-hidden-by-mode" : "crm-partner-cards-grid"}>
            {filtered.map(({ item, workflow }) => {
              return (
                <article key={item.id} className="crm-partner-card">
                  <Link href={`/production/${item.id}`} className="crm-card-link-overlay" aria-label={`Ouvrir la production de ${item.athlete}`} />
                  <header>
                    <span className="crm-avatar" aria-hidden>{productionMonogram(item)}</span>
                    <div>
                      <h3>{item.type}</h3>
                      <p>{item.athlete} · {item.sport}</p>
                    </div>
                    <ProductionStatusBadge label={workflow.statusLabel} tone={workflow.statusTone} />
                  </header>

                  <dl>
                    <div>
                      <dt>Objectif</dt>
                      <dd className="crm-partner-benefit" title={item.objectif}>{item.objectif}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{formatDate(item.date)}</dd>
                    </div>
                    <div>
                      <dt>Workflow</dt>
                      <dd className="production-card-workflow">
                        <span className="production-progress-bar" aria-hidden><span style={{ width: `${workflow.progressPercentage}%` }} /></span>
                        <strong>{workflow.progressPercentage}%</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>Lieu</dt>
                      <dd>{item.lieu}</dd>
                    </div>
                  </dl>

                  <footer>
                    <span>{workflowCompactLabel(workflow)}</span>
                    <div className="crm-row-menu-shell">
                      <button
                        type="button"
                        className="crm-row-menu-trigger"
                        aria-label={`Actions production ${item.athlete}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId((current) => (current === item.id ? null : item.id));
                        }}
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                      {openMenuId === item.id ? (
                        <div className="crm-row-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                          <Link href={`/production/${item.id}`} role="menuitem">Voir</Link>
                          <button type="button" role="menuitem" onClick={() => requestDeleteProduction(item)}>Supprimer</button>
                        </div>
                      ) : null}
                    </div>
                  </footer>
                </article>
              );
            })}
          </section>
        </>
      ) : null}

      {pendingDeleteProduction ? (
        <Modal title="Supprimer définitivement cette production ?" onClose={() => setPendingDeleteProduction(null)}>
          <div className="modal-form">
            <p>Cette action supprimera la production “{pendingDeleteProduction.athlete}” du stockage existant.</p>
            <div className="modal-actions modal-wide">
              <button type="button" className="secondary-button" onClick={() => setPendingDeleteProduction(null)}>Annuler</button>
              <button type="button" className="primary-button" onClick={deleteProduction}>Supprimer</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {showCreate ? (
        <Modal title="Créer une production" onClose={() => setShowCreate(false)}>
          <form className="modal-form" onSubmit={createProduction}>
            <label>
              <span>Athlète</span>
              <select value={createForm.athlete} onChange={(event) => selectAthlete(event.target.value)} required>
                <option value="">Choisir…</option>
                {athletes.map((athlete) => (
                  <option key={athlete.name} value={athlete.name}>
                    {athlete.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Type</span>
              <select value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value }))}>
                <option value="Portrait">Portrait</option>
                <option value="Action">Action</option>
                <option value="Interview">Interview</option>
                <option value="Lifestyle">Lifestyle</option>
                <option value="Sponsor">Sponsor</option>
                <option value="Événement">Événement</option>
              </select>
            </label>

            <label>
              <span>Date</span>
              <input type="date" value={createForm.date} onChange={(event) => setCreateForm((current) => ({ ...current, date: event.target.value }))} required />
            </label>

            <label>
              <span>Lieu</span>
              <input value={createForm.place} onChange={(event) => setCreateForm((current) => ({ ...current, place: event.target.value }))} />
            </label>

            <label>
              <span>Objectif</span>
              <textarea value={createForm.objective} onChange={(event) => setCreateForm((current) => ({ ...current, objective: event.target.value }))} />
            </label>

            <label>
              <span>Matériel</span>
              <textarea value={createForm.equipment ?? ""} onChange={(event) => setCreateForm((current) => ({ ...current, equipment: event.target.value }))} />
            </label>

            <label>
              <span>Photographe</span>
              <input value={createForm.photographer} onChange={(event) => setCreateForm((current) => ({ ...current, photographer: event.target.value }))} />
            </label>

            <div className="modal-actions modal-wide">
              <button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Annuler</button>
              <button type="submit" className="primary-button" disabled={creating}>
                {creating ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
