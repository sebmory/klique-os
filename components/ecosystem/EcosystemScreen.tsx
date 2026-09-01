"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, LayoutList, MoreHorizontal, Plus, Search, Sparkles } from "lucide-react";
import { EcosystemService } from "@/services/ecosystem.service";
import { PartnerService } from "@/services/partner.service";
import { Modal } from "@/components/ui/Modal";
import type { EcosystemListResponse, EcosystemResource } from "@/types/ecosystem";
import type { NewPartner } from "@/types/partner";

type SortKey = "name" | "nextFollowUp" | "priority";
type ViewMode = "list" | "cards";

const emptyResource: NewPartner = {
  name: "",
  type: "Partenaire",
  relationType: "Partenaire",
  category: "",
  expertKlique: false,
  contact: "",
  email: "",
  phone: "",
  website: "",
  instagram: "",
  description: "",
  services: "",
  benefits: "",
  notes: "",
  status: "Actif",
  athletes: "",
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const toDateRank = (value: string): number | null => {
  const text = normalize(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime();
    }
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const formatDate = (value: string): string => {
  const rank = toDateRank(value);
  if (rank === null) return "Non renseigne";
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(rank));
};

const statusBadgeClass = (value: string): string => {
  const normalized = normalize(value).toLowerCase();
  if (normalized.includes("actif")) return "is-actif";
  if (normalized.includes("prospect")) return "is-prospect";
  if (normalized.includes("inactif")) return "is-inactif";
  return "is-inactif";
};

const priorityRank = (value: string): number => {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return 99;
  if (normalized.includes("haute") || normalized.includes("high") || normalized.includes("forte")) return 0;
  if (normalized.includes("moy")) return 1;
  if (normalized.includes("basse") || normalized.includes("low")) return 2;
  return 50;
};

const monogram = (name: string): string =>
  normalize(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const typeLabel = (type: string): string => {
  const normalized = normalizeKey(type);
  if (normalized === "partenaire") return "Partenaire";
  if (normalized === "expert") return "Expert";
  if (normalized === "media" || normalized === "média") return "Média";
  return normalize(type) || "Autre";
};

const typeChipLabel = (type: string): string => {
  const normalized = normalizeKey(type);
  if (normalized === "partenaire") return "Partenaires";
  if (normalized === "expert") return "Experts";
  if (normalized === "media" || normalized === "média") return "Médias";
  return typeLabel(type);
};

const primaryContribution = (resource: EcosystemResource): string => {
  const candidates = [
    resource.memberOffer,
    resource.expertise,
    resource.services,
    resource.deliverables,
    resource.notes,
  ].map((value) => normalize(value));

  return candidates.find(Boolean) ?? "Non renseigne";
};

export function EcosystemScreen() {
  const router = useRouter();
  const [resources, setResources] = useState<EcosystemResource[]>([]);
  const [source, setSource] = useState<EcosystemListResponse["source"]>("google-sheets");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("Tous");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [categoryFilter, setCategoryFilter] = useState("Toutes");
  const [priorityFilter, setPriorityFilter] = useState("Toutes");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateResource, setShowCreateResource] = useState(false);
  const [createForm, setCreateForm] = useState<NewPartner>(emptyResource);
  const [creatingResource, setCreatingResource] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdResource, setCreatedResource] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let active = true;
    const loadAccess = async () => {
      try {
        const response = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setIsAdmin(Boolean(payload?.permissions?.isAdmin && payload?.permissions?.isActive));
      } catch {
        if (active) setIsAdmin(false);
      }
    };
    void loadAccess();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadResources = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const payload = await EcosystemService.list();
        if (!active) return;

        setResources(payload.resources);
        setSource(payload.source);
        setMessage(payload.message ?? "");
        setActiveRowId(payload.resources[0]?.id ?? null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les ressources de l ecosysteme.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadResources();

    return () => {
      active = false;
    };
  }, [retryToken]);

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

  const typeFilters = useMemo(() => {
    const dynamicTypes = new Map<string, string>();
    for (const resource of resources) {
      const label = typeLabel(resource.type);
      const key = normalizeKey(label);
      if (!dynamicTypes.has(key)) dynamicTypes.set(key, label);
    }

    const options = [
      { key: "Tous", label: "Tous" },
      { key: "Partenaire", label: "Partenaires" },
      { key: "Expert", label: "Experts" },
      { key: "Média", label: "Médias" },
    ];

    for (const label of dynamicTypes.values()) {
      const normalized = normalizeKey(label);
      const isPreset = options.some((item) => normalizeKey(item.key) === normalized);
      if (!isPreset) {
        options.push({ key: label, label: typeChipLabel(label) });
      }
    }

    return options;
  }, [resources]);

  const categoryOptions = useMemo(() => {
    const values = Array.from(new Set(resources.map((resource) => normalize(resource.category)).filter(Boolean)));
    values.sort((a, b) => a.localeCompare(b));
    return ["Toutes", ...values];
  }, [resources]);

  const priorityOptions = useMemo(() => {
    const values = Array.from(new Set(resources.map((resource) => normalize(resource.strategicPriority)).filter(Boolean)));
    values.sort((a, b) => a.localeCompare(b));
    return ["Toutes", ...values];
  }, [resources]);

  const filteredResources = useMemo(() => {
    const normalizedQuery = normalize(query).toLowerCase();

    const byFilters = resources.filter((resource) => {
      const type = typeLabel(resource.type);
      const status = normalize(resource.status);

      const typeMatch =
        selectedType === "Tous" ||
        normalizeKey(type) === normalizeKey(selectedType) ||
        (selectedType === "Média" && ["media", "média"].includes(normalizeKey(type)));

      if (!typeMatch) return false;

      if (statusFilter === "Actifs" && !status.toLowerCase().includes("actif")) return false;
      if (statusFilter === "Prospects" && !status.toLowerCase().includes("prospect")) return false;
      if (statusFilter === "Inactifs" && !status.toLowerCase().includes("inactif")) return false;

      if (categoryFilter !== "Toutes" && normalize(resource.category) !== categoryFilter) return false;
      if (priorityFilter !== "Toutes" && normalize(resource.strategicPriority) !== priorityFilter) return false;

      if (!normalizedQuery) return true;

      return [
        resource.name,
        resource.type,
        resource.category,
        resource.contactName,
        resource.memberOffer,
        resource.expertise,
        resource.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return [...byFilters].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "nextFollowUp") {
        const aRank = toDateRank(a.nextFollowUp) ?? Number.MAX_SAFE_INTEGER;
        const bRank = toDateRank(b.nextFollowUp) ?? Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
      }
      return priorityRank(a.strategicPriority) - priorityRank(b.strategicPriority);
    });
  }, [resources, query, selectedType, statusFilter, categoryFilter, priorityFilter, sortBy]);

  const isEmpty = !loading && filteredResources.length === 0;

  const createResource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) return;
    setCreatingResource(true);
    setCreateError(null);
    setCreatedResource(null);

    try {
      const result = await PartnerService.create(createForm);
      const payload = await EcosystemService.list();
      const confirmedResource = payload.resources.find((resource) => Number(resource.raw?.row) === result.row);
      if (!confirmedResource) {
        throw new Error("La ressource a été créée, mais sa fiche n’est pas encore disponible. Réessayez dans quelques instants.");
      }
      setResources(payload.resources);
      setSource(payload.source);
      setMessage(payload.message ?? "");
      setActiveRowId(confirmedResource.id);
      setCreatedResource({ id: confirmedResource.id, name: confirmedResource.name });
      setCreateForm(emptyResource);
      setShowCreateResource(false);
      router.push(`/ecosysteme/row-${result.row}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Impossible de créer la ressource.");
    } finally {
      setCreatingResource(false);
    }
  };

  const updateResourceType = (type: "Expert" | "Partenaire" | "Média") => {
    setCreateForm((current) => ({
      ...current,
      type,
      relationType: type,
      expertKlique: type === "Expert",
    }));
  };

  return (
    <section className="crm-people-screen">
      <header className="crm-people-header">
        <div>
          <h1>Écosystème KLIQUE</h1>
          <p>Découvrez les partenaires, experts, médias et ressources disponibles pour les membres KLIQUE.</p>
        </div>
        {isAdmin ? (
          <button type="button" className="crm-primary-action" onClick={() => setShowCreateResource(true)}>
            <Plus size={16} aria-hidden /> Nouvelle ressource
          </button>
        ) : null}
      </header>

      {createdResource ? (
        <section className="ecosystem-create-success" aria-live="polite">
          <span>{createdResource.name} a été ajouté à l’écosystème.</span>
          <Link href={`/ecosysteme/${encodeURIComponent(createdResource.id)}`}>Ouvrir la fiche</Link>
        </section>
      ) : null}

      {source === "demo" && message ? (
        <section className="crm-partners-info-banner" aria-live="polite">
          <strong>Source de donnees: demo</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="crm-actions-bar" aria-label="Actions ecosysteme">
        <label className="crm-search" htmlFor="ecosystem-search">
          <Search size={18} aria-hidden />
          <input
            id="ecosystem-search"
            type="search"
            placeholder="Rechercher une ressource..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="crm-filter-scroller" role="tablist" aria-label="Filtres type">
          {typeFilters.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={option.key === selectedType}
              className={option.key === selectedType ? "crm-filter-chip is-active" : "crm-filter-chip"}
              onClick={() => setSelectedType(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="crm-actions-right">
          <div className="crm-filter-scroller" role="group" aria-label="Statut">
            {["Tous", "Actifs", "Prospects", "Inactifs"].map((status) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? "crm-filter-chip is-active" : "crm-filter-chip"}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>

          <label className="crm-select-wrap">
            <span>Categorie</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="crm-select-wrap">
            <span>Priorite</span>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="crm-select-wrap">
            <span>Trier</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
              <option value="name">Nom</option>
              <option value="nextFollowUp">Prochaine relance</option>
              <option value="priority">Priorite strategique</option>
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
          <span className="crm-skeleton-label">Chargement de l ecosysteme...</span>
        </section>
      ) : null}

      {!loading && errorMessage ? (
        <section className="crm-error-state" aria-live="assertive">
          <h2>Impossible de charger l ecosysteme</h2>
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setRetryToken((value) => value + 1);
            }}
          >
            Reessayer
          </button>
        </section>
      ) : null}

      {!loading && !errorMessage && isEmpty ? (
        <section className="crm-empty-state" aria-live="polite">
          <div className="crm-empty-icon" aria-hidden>
            <Search size={20} />
          </div>
          <h2>Aucune ressource ne correspond a votre recherche</h2>
          <p>Essayez un autre type, un autre statut ou une autre categorie pour retrouver une ressource.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedType("Tous");
              setStatusFilter("Tous");
              setCategoryFilter("Toutes");
              setPriorityFilter("Toutes");
              setQuery("");
            }}
          >
            Reinitialiser les filtres
          </button>
        </section>
      ) : null}

      {!loading && !errorMessage && !isEmpty ? (
        <>
          <section className={viewMode === "cards" ? "crm-ecosystem-list-shell is-hidden" : "crm-ecosystem-list-shell"}>
            <div className="crm-ecosystem-list-head" role="row">
              <span>Ressource</span>
              <span>Type</span>
              <span>Categorie</span>
              <span>Apport principal</span>
              <span>Contact</span>
              <span>Statut</span>
              <span>Prochaine action</span>
              <span>Priorite</span>
              <span aria-hidden>Actions</span>
            </div>

            <ul className="crm-partner-list-body">
              {filteredResources.map((resource) => {
                const contribution = primaryContribution(resource);
                const contactSecondary = resource.contactRole || resource.email || resource.phone || "Non renseigne";

                return (
                  <li key={resource.id}>
                    <div className={resource.id === activeRowId ? "crm-ecosystem-row is-active" : "crm-ecosystem-row"}>
                      <Link
                        href={`/ecosysteme/${resource.slug || resource.id}`}
                        className="crm-partner-row-link-overlay"
                        aria-label={`Ouvrir la fiche de ${resource.name}`}
                        onClick={() => {
                          setActiveRowId(resource.id);
                          setOpenMenuId(null);
                        }}
                      />

                      <span className="crm-person-cell">
                        <span className="crm-avatar" aria-hidden>{monogram(resource.name)}</span>
                        <span className="crm-name-stack">
                          <strong>{resource.name}</strong>
                          <small>{resource.website || resource.instagram || "Non renseigne"}</small>
                        </span>
                      </span>

                      <span>
                        <small className="crm-partner-priority-badge">{typeLabel(resource.type)}</small>
                      </span>
                      <span>{resource.category || "Non renseigne"}</span>
                      <span className="crm-partner-benefit" title={contribution}>{contribution}</span>
                      <span className="crm-partner-contact-cell">
                        <strong>{resource.contactName || "Non renseigne"}</strong>
                        <small>{contactSecondary}</small>
                      </span>
                      <span>
                        <small className={`crm-status-badge ${statusBadgeClass(resource.status)}`}>{resource.status || "Non renseigne"}</small>
                      </span>
                      <span className="crm-ecosystem-next-action-cell">
                        <strong>{resource.nextAction || "Non renseigne"}</strong>
                        <small>{formatDate(resource.nextFollowUp)}</small>
                      </span>
                      <span>
                        <small className="crm-partner-priority-badge">{resource.strategicPriority || "Non renseigne"}</small>
                      </span>

                      <span className="crm-row-menu-shell">
                        <button
                          type="button"
                          className="crm-row-menu-trigger"
                          aria-label={`Actions ${resource.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId((current) => (current === resource.id ? null : resource.id));
                          }}
                        >
                          <MoreHorizontal size={16} aria-hidden />
                        </button>

                        {openMenuId === resource.id ? (
                          <div className="crm-row-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                            <Link href={`/ecosysteme/${resource.slug || resource.id}`} role="menuitem">Voir la fiche</Link>
                            <button type="button" role="menuitem" disabled>Modifier</button>
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
            {filteredResources.map((resource) => {
              const contribution = primaryContribution(resource);
              return (
                <article key={resource.id} className="crm-partner-card crm-ecosystem-card">
                  <Link
                    href={`/ecosysteme/${resource.slug || resource.id}`}
                    className="crm-card-link-overlay"
                    aria-label={`Ouvrir la fiche de ${resource.name}`}
                    onClick={() => setActiveRowId(resource.id)}
                  />

                  <header>
                    <span className="crm-avatar" aria-hidden>{monogram(resource.name)}</span>
                    <div>
                      <h3>{resource.name}</h3>
                      <p>{resource.category || "Non renseigne"}</p>
                    </div>
                    <small className={`crm-status-badge ${statusBadgeClass(resource.status)}`}>{resource.status || "Non renseigne"}</small>
                  </header>

                  <dl>
                    <div>
                      <dt>Type</dt>
                      <dd><small className="crm-partner-priority-badge">{typeLabel(resource.type)}</small></dd>
                    </div>
                    <div>
                      <dt>Apport principal</dt>
                      <dd className="crm-partner-benefit" title={contribution}>{contribution}</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{resource.contactName || "Non renseigne"}</dd>
                    </div>
                    <div>
                      <dt>Prochaine action</dt>
                      <dd>{resource.nextAction || "Non renseigne"}</dd>
                    </div>
                    <div>
                      <dt>Priorite</dt>
                      <dd><small className="crm-partner-priority-badge">{resource.strategicPriority || "Non renseigne"}</small></dd>
                    </div>
                  </dl>

                  <footer>
                    <span>{resource.website || resource.instagram || "Non renseigne"}</span>
                    <Link href={`/ecosysteme/${resource.slug || resource.id}`}>Voir la fiche</Link>
                  </footer>
                </article>
              );
            })}
          </section>
        </>
      ) : null}

      {!loading && !errorMessage && filteredResources.length > 0 ? (
        <p className="crm-skeleton-label" aria-live="polite">
          <Sparkles size={14} aria-hidden /> {filteredResources.length} ressource(s) dans l ecosysteme
        </p>
      ) : null}

      {isAdmin && showCreateResource ? (
        <Modal title="Nouvelle ressource" onClose={() => setShowCreateResource(false)}>
          <form className="ecosystem-create-form" onSubmit={createResource}>
            <div className="ecosystem-create-grid">
              <label>
                <span>Nom *</span>
                <input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} required />
              </label>
              <label>
                <span>Type *</span>
                <select value={createForm.relationType ?? createForm.type} onChange={(event) => updateResourceType(event.target.value as "Expert" | "Partenaire" | "Média")} required>
                  <option value="Expert">Expert</option>
                  <option value="Partenaire">Partenaire</option>
                  <option value="Média">Média</option>
                </select>
              </label>
              <label>
                <span>Catégorie *</span>
                <input value={createForm.category} onChange={(event) => setCreateForm({ ...createForm, category: event.target.value })} required />
              </label>
              <label>
                <span>Statut</span>
                <select value={createForm.status} onChange={(event) => setCreateForm({ ...createForm, status: event.target.value })}>
                  <option value="Actif">Actif</option>
                  <option value="Prospect">Prospect</option>
                  <option value="Inactif">Inactif</option>
                </select>
              </label>
              <label>
                <span>Contact principal</span>
                <input value={createForm.contact} onChange={(event) => setCreateForm({ ...createForm, contact: event.target.value })} />
              </label>
              <label>
                <span>E-mail *</span>
                <input type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} required />
              </label>
              <label className="ecosystem-create-wide">
                <span>Description</span>
                <textarea value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} />
              </label>
              <label className="ecosystem-create-wide">
                <span>Services</span>
                <textarea value={createForm.services ?? ""} onChange={(event) => setCreateForm({ ...createForm, services: event.target.value })} />
              </label>
              <label className="ecosystem-create-wide">
                <span>Avantages</span>
                <textarea value={createForm.benefits} onChange={(event) => setCreateForm({ ...createForm, benefits: event.target.value })} />
              </label>
              <label className="ecosystem-create-wide">
                <span>Site</span>
                <input value={createForm.website} onChange={(event) => setCreateForm({ ...createForm, website: event.target.value })} />
              </label>
            </div>
            {createError ? <p className="ecosystem-create-error" role="alert">{createError}</p> : null}
            <div className="ecosystem-create-actions">
              <button type="button" onClick={() => setShowCreateResource(false)}>Annuler</button>
              <button type="submit" className="crm-primary-action" disabled={creatingResource}>
                {creatingResource ? "Création…" : "Créer la ressource"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
