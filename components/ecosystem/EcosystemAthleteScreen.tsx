"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { EcosystemService } from "@/services/ecosystem.service";
import type { EcosystemListResponse, EcosystemResource } from "@/types/ecosystem";
import { Badge, Card } from "@/src/design-system/components";

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const typeLabel = (type: string): string => {
  const normalized = normalizeKey(type);
  if (normalized === "partenaire") return "Partenaire";
  if (normalized === "expert") return "Expert";
  if (normalized === "media" || normalized === "média") return "Média";
  return normalize(type) || "Autre";
};

const firstPublicPresentation = (resource: EcosystemResource): string => {
  const options = [
    resource.expertise,
    resource.services,
    resource.deliverables,
  ]
    .map((value) => normalize(value))
    .filter(Boolean);
  return options[0] ?? "Présentation en cours de préparation.";
};

const initials = (name: string): string =>
  normalize(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const contactLine = (resource: EcosystemResource): string => {
  const name = normalize(resource.contactName || resource.raw?.contactName || resource.raw?.contact);
  const role = normalize(resource.contactRole || resource.raw?.contactRole);
  if (name && role) return `${name} · ${role}`;
  if (name) return name;
  return "Non renseigné";
};

const publicValue = (...values: unknown[]): string => {
  for (const value of values) {
    const text = normalize(value);
    if (text) return text;
  }
  return "";
};

const normalizeHref = (value: string): string => {
  const text = normalize(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
};

export function EcosystemAthleteScreen() {
  const [resources, setResources] = useState<EcosystemResource[]>([]);
  const [source, setSource] = useState<EcosystemListResponse["source"]>("google-sheets");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("Tous");
  const [isCompactCardsLayout, setIsCompactCardsLayout] = useState(false);

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
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger l’écosystème.");
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
    const updateLayout = () => setIsCompactCardsLayout(window.innerWidth < 980);
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
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
      if (!isPreset) options.push({ key: label, label });
    }

    return options;
  }, [resources]);

  const filteredResources = useMemo(() => {
    const normalizedQuery = normalize(query).toLowerCase();

    return resources.filter((resource) => {
      const type = typeLabel(resource.type);
      const typeMatch =
        selectedType === "Tous" ||
        normalizeKey(type) === normalizeKey(selectedType) ||
        (selectedType === "Média" && ["media", "média"].includes(normalizeKey(type)));

      if (!typeMatch) return false;
      if (!normalizedQuery) return true;

      return [
        resource.name,
        type,
        resource.category,
        resource.contactName,
        resource.email,
        resource.instagram,
        resource.website,
        resource.memberOffer,
        resource.expertise,
        resource.services,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [resources, query, selectedType]);

  const isEmpty = !loading && filteredResources.length === 0;

  return (
    <section className="crm-people-screen">
      <header className="crm-people-header">
        <div>
          <h1>Écosystème KLIQUE</h1>
          <p>Partenaires et experts disponibles pour vous accompagner.</p>
        </div>
      </header>

      {source === "demo" && message ? (
        <section className="crm-partners-info-banner" aria-live="polite">
          <strong>Source de donnees: demo</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="crm-actions-bar" aria-label="Actions ecosysteme athlete">
        <label className="crm-search" htmlFor="ecosystem-athlete-search">
          <Search size={18} aria-hidden />
          <input
            id="ecosystem-athlete-search"
            type="search"
            placeholder="Rechercher un partenaire, expert ou domaine..."
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
          <button type="button" onClick={() => setRetryToken((value) => value + 1)}>
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
          <p>Essayez un autre type ou un autre mot-clé.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedType("Tous");
              setQuery("");
            }}
          >
            Reinitialiser les filtres
          </button>
        </section>
      ) : null}

      {!loading && !errorMessage && !isEmpty ? (
        <section style={{ display: "grid", gap: "1rem" }}>
          {filteredResources.map((resource) => {
            const type = typeLabel(resource.type);
            const presentation = firstPublicPresentation(resource);
            const benefit = publicValue(resource.raw?.benefits, resource.raw?.benefitDetails, resource.memberOffer) || "Non renseigné";
            const website = publicValue(resource.website, resource.raw?.website);
            const email = publicValue(resource.email, resource.raw?.email);
            const contact = contactLine(resource);
            const siteHref = normalizeHref(website);
            const detailHref = `/athlete/ecosysteme/${resource.slug || resource.id}`;

            return (
              <Card
                key={resource.id}
                style={{
                  padding: "1rem",
                  display: "grid",
                  gap: "1rem",
                  border: "1px solid #efe3d4",
                  boxShadow: "0 24px 50px rgba(15, 23, 42, 0.06)",
                  background: "#fffdf9",
                  borderRadius: "24px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: "1rem",
                    gridTemplateColumns: isCompactCardsLayout ? "1fr" : "minmax(220px, 0.95fr) minmax(280px, 1.25fr) minmax(190px, 0.75fr)",
                  }}
                >
                  <div style={{ background: "#0f172a", color: "#f8fafc", borderRadius: "20px", padding: "1rem", display: "grid", gap: "0.8rem", minHeight: isCompactCardsLayout ? "auto" : "100%" }}>
                    <div style={{ width: "54px", height: "54px", borderRadius: "18px", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.18)", display: "grid", placeItems: "center", fontSize: "1rem", fontWeight: 700 }}>
                      {initials(resource.name)}
                    </div>
                    <div>
                      <p style={{ margin: 0, color: "#cbd5e1", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Partenaire
                      </p>
                      <h3 style={{ margin: "0.25rem 0 0", fontSize: "1.05rem", lineHeight: 1.3 }}>{resource.name}</h3>
                    </div>
                    <Badge style={{ width: "fit-content", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", padding: "0.35rem 0.7rem" }}>
                      {type}
                    </Badge>
                    <p style={{ margin: 0, color: "#dbeafe", lineHeight: 1.6, fontSize: "0.92rem" }}>{presentation}</p>
                  </div>

                  <div style={{ display: "grid", gap: "0.85rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: "0.3rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                          <Badge style={{ background: "#fff7ed", color: "#b45309", border: "1px solid #f6d4b0", padding: "0.35rem 0.65rem" }}>
                            {normalize(resource.category) || "Non renseigné"}
                          </Badge>
                          <div style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#f59e0b" }} />
                          <div style={{ color: "#6b7280", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Écosystème
                          </div>
                        </div>
                        <h3 style={{ margin: 0, fontSize: "1.25rem", lineHeight: 1.3, color: "#111827" }}>{type}</h3>
                      </div>
                      <Badge style={{ background: "#ecfdf5", color: "#047857", padding: "0.35rem 0.7rem" }}>Public</Badge>
                    </div>

                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#c2410c", lineHeight: 1.4 }}>{benefit}</div>

                    <div style={{ padding: "0.85rem", borderRadius: "16px", border: "1px solid #f3e7d5", background: "rgba(255,255,255,0.8)", display: "grid", gap: "0.45rem" }}>
                      <div style={{ fontWeight: 800, color: "#111827" }}>Contact public: {contact}</div>
                      <div style={{ color: "#6b7280", fontSize: "0.92rem", lineHeight: 1.55 }}>Email: {email || "Non renseigné"}</div>
                      <div style={{ color: "#6b7280", fontSize: "0.92rem", lineHeight: 1.55 }}>
                        Site: {siteHref ? <a href={siteHref} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{website || "Non renseigné"}</a> : "Non renseigné"}
                      </div>
                    </div>
                  </div>

                  <div aria-hidden />
                </div>

                <div
                  style={{
                    borderTop: "1px solid #efe4d4",
                    paddingTop: "0.95rem",
                    display: "grid",
                    gap: "0.8rem",
                    gridTemplateColumns: isCompactCardsLayout ? "1fr" : "minmax(180px, 1fr) minmax(180px, 1fr) auto",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ color: "#6b7280", fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</div>
                    <div style={{ color: "#111827", fontWeight: 700, marginTop: "0.2rem" }}>{type}</div>
                  </div>
                  <div>
                    <div style={{ color: "#6b7280", fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Catégorie / domaine</div>
                    <div style={{ color: "#111827", fontWeight: 700, marginTop: "0.2rem" }}>{normalize(resource.category) || "Non renseigné"}</div>
                  </div>
                  <Link
                    href={detailHref}
                    style={{
                      borderRadius: "999px",
                      padding: "0.8rem 1rem",
                      alignSelf: "flex-start",
                      background: "#f59e0b",
                      color: "#fff",
                      border: "none",
                      fontWeight: 700,
                      display: "inline-flex",
                    }}
                  >
                    Consulter la fiche
                  </Link>
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}

      {!loading && !errorMessage && filteredResources.length > 0 ? (
        <p className="crm-skeleton-label" aria-live="polite">
          <Sparkles size={14} aria-hidden /> {filteredResources.length} ressource(s) disponibles
        </p>
      ) : null}
    </section>
  );
}
