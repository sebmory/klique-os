"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, CalendarDays, ExternalLink, MapPin, RotateCw, X } from "lucide-react";
import styles from "./community.module.css";

type CommunityTab = "Actualités" | "Opportunités" | "Avantages" | "Ressources";
type LoadState<T> =
  | { status: "loading"; items: T[]; message: string }
  | { status: "ready"; items: T[]; message: string }
  | { status: "error"; items: T[]; message: string };

type Publication = {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
  authorDisplayName: string;
  authorRole: string;
  authorSpecialty: string;
};

type Opportunity = {
  id: string;
  title: string;
  type: string;
  organization: string;
  sportOrDomain: string;
  location: string;
  date: string;
  deadline: string;
  description: string;
  requirements: string;
  practicalInfo: string;
  status: string;
};

type Benefit = {
  id: string;
  name: string;
  category: string;
  memberOffer: string;
  benefitDetails: string;
  description: string;
  logoUrl: string;
  website: string;
};

type Resource = {
  id: string;
  title: string;
  category: string;
  author: string;
  type: string;
  description: string;
  content: string;
  url: string | null;
  coverImageUrl: string | null;
  date: string;
};

const tabs: CommunityTab[] = ["Actualités", "Opportunités", "Avantages", "Ressources"];
const emptyState = <T,>(): LoadState<T> => ({ status: "loading", items: [], message: "" });

const formatDate = (value: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "long", year: "numeric" }).format(date);
};

const readPayload = async <T,>(response: Response, key: string): Promise<T[]> => {
  if (!response.ok) throw new Error("Request failed");
  const payload = await response.json() as Record<string, unknown>;
  return Array.isArray(payload[key]) ? payload[key] as T[] : [];
};

export default function PartnerCommunityPage() {
  const [activeTab, setActiveTab] = useState<CommunityTab>("Actualités");
  const [publications, setPublications] = useState<LoadState<Publication>>(emptyState);
  const [opportunities, setOpportunities] = useState<LoadState<Opportunity>>(emptyState);
  const [benefits, setBenefits] = useState<LoadState<Benefit>>(emptyState);
  const [resources, setResources] = useState<LoadState<Resource>>(emptyState);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [resourceDetailStatus, setResourceDetailStatus] = useState<"idle" | "loading" | "error">("idle");

  const loadPublications = async () => {
    setPublications(emptyState());
    try {
      const response = await fetch("/api/partner/community", { credentials: "include", cache: "no-store" });
      setPublications({ status: "ready", items: await readPayload<Publication>(response, "publications"), message: "" });
    } catch {
      setPublications({ status: "error", items: [], message: "Les actualités n’ont pas pu être chargées." });
    }
  };

  const loadOpportunities = async () => {
    setOpportunities(emptyState());
    try {
      const response = await fetch("/api/partner/opportunities", { credentials: "include", cache: "no-store" });
      setOpportunities({ status: "ready", items: await readPayload<Opportunity>(response, "opportunities"), message: "" });
    } catch {
      setOpportunities({ status: "error", items: [], message: "Les opportunités n’ont pas pu être chargées." });
    }
  };

  const loadBenefits = async () => {
    setBenefits(emptyState());
    try {
      const response = await fetch("/api/partner/benefits", { credentials: "include", cache: "no-store" });
      setBenefits({ status: "ready", items: await readPayload<Benefit>(response, "benefits"), message: "" });
    } catch {
      setBenefits({ status: "error", items: [], message: "Les avantages n’ont pas pu être chargés." });
    }
  };

  const loadResources = async () => {
    setResources(emptyState());
    try {
      const response = await fetch("/api/partner/resources", { credentials: "include", cache: "no-store" });
      setResources({ status: "ready", items: await readPayload<Resource>(response, "resources"), message: "" });
    } catch {
      setResources({ status: "error", items: [], message: "Les ressources n’ont pas pu être chargées." });
    }
  };

  useEffect(() => {
    void Promise.allSettled([loadPublications(), loadOpportunities(), loadBenefits(), loadResources()]);
  }, []);

  const openResource = async (resourceId: string) => {
    setSelectedResource(null);
    setResourceDetailStatus("loading");
    try {
      const response = await fetch(`/api/partner/resources/${encodeURIComponent(resourceId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Request failed");
      const payload = await response.json() as { resource?: Resource };
      if (!payload.resource) throw new Error("Missing resource");
      setSelectedResource(payload.resource);
      setResourceDetailStatus("idle");
    } catch {
      setResourceDetailStatus("error");
    }
  };

  const renderState = <T,>(
    state: LoadState<T>,
    loadingLabel: string,
    emptyLabel: string,
    retry: () => Promise<void>,
    content: (items: T[]) => React.ReactNode,
  ) => {
    if (state.status === "loading") return <p className={styles.state} aria-live="polite">{loadingLabel}</p>;
    if (state.status === "error") {
      return (
        <div className={`${styles.state} ${styles.error}`} role="alert">
          <span>{state.message}</span>
          <button type="button" onClick={() => void retry()} title="Réessayer"><RotateCw size={16} /> Réessayer</button>
        </div>
      );
    }
    if (state.items.length === 0) return <p className={styles.state}>{emptyLabel}</p>;
    return content(state.items);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Espace Partenaire</p>
        <h1>Communauté</h1>
        <p>Actualités, collaborations et ressources partagées au sein de KLIQUE.</p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Sections de la communauté">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? styles.activeTab : undefined}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className={styles.panel} role="tabpanel">
        {activeTab === "Actualités" && renderState(
          publications,
          "Chargement des actualités…",
          "Aucune actualité n’est disponible pour le moment.",
          loadPublications,
          (items) => <div className={styles.feed}>{items.map((item) => (
            <article key={item.id} className={styles.newsItem}>
              <div className={styles.meta}><span>{item.authorDisplayName || "KLIQUE"}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div>
              {item.title ? <h2>{item.title}</h2> : null}
              <p>{item.content}</p>
              {item.authorSpecialty ? <small>{item.authorSpecialty}</small> : null}
            </article>
          ))}</div>,
        )}

        {activeTab === "Opportunités" && renderState(
          opportunities,
          "Chargement des opportunités…",
          "Aucune opportunité n’est disponible pour le moment.",
          loadOpportunities,
          (items) => <div className={styles.grid}>{items.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.meta}><span>{item.type}</span><strong>{item.status}</strong></div>
              <h2>{item.title}</h2>
              <p className={styles.organization}>{item.organization}</p>
              <p>{item.description}</p>
              <div className={styles.facts}>
                {item.location ? <span><MapPin size={15} />{item.location}</span> : null}
                {item.date ? <span><CalendarDays size={15} />{formatDate(item.date)}</span> : null}
              </div>
              {item.requirements ? <p><b>Prérequis</b>{item.requirements}</p> : null}
              {item.practicalInfo ? <p><b>Informations pratiques</b>{item.practicalInfo}</p> : null}
            </article>
          ))}</div>,
        )}

        {activeTab === "Avantages" && renderState(
          benefits,
          "Chargement des avantages…",
          "Aucun avantage n’est disponible pour le moment.",
          loadBenefits,
          (items) => <div className={styles.grid}>{items.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.brandRow}>
                {item.logoUrl ? <img src={item.logoUrl} alt="" /> : <span aria-hidden>{item.name.slice(0, 1)}</span>}
                <div><small>{item.category}</small><h2>{item.name}</h2></div>
              </div>
              <p className={styles.offer}>{item.memberOffer}</p>
              {item.benefitDetails ? <p>{item.benefitDetails}</p> : null}
              {item.description ? <p>{item.description}</p> : null}
              {item.website ? <a href={item.website} target="_blank" rel="noreferrer">Voir le site <ExternalLink size={15} /></a> : null}
            </article>
          ))}</div>,
        )}

        {activeTab === "Ressources" && renderState(
          resources,
          "Chargement des ressources…",
          "Aucune ressource n’est disponible pour le moment.",
          loadResources,
          (items) => <div className={styles.grid}>{items.map((item) => (
            <article key={item.id} className={`${styles.card} ${styles.resourceCard}`}>
              {item.coverImageUrl ? <img className={styles.cover} src={item.coverImageUrl} alt="" /> : <div className={styles.coverFallback}><BookOpen /></div>}
              <div className={styles.meta}><span>{item.category}</span><span>{item.type}</span></div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <button type="button" onClick={() => void openResource(item.id)}>Consulter <ArrowUpRight size={16} /></button>
            </article>
          ))}</div>,
        )}
      </section>

      {resourceDetailStatus !== "idle" || selectedResource ? (
        <div className={styles.detailBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedResource(null)}>
          <section className={styles.detail} role="dialog" aria-modal="true" aria-label="Consultation de la ressource">
            <button className={styles.close} type="button" onClick={() => { setSelectedResource(null); setResourceDetailStatus("idle"); }} title="Fermer"><X /></button>
            {resourceDetailStatus === "loading" ? <p className={styles.state}>Chargement de la ressource…</p> : null}
            {resourceDetailStatus === "error" ? <p className={`${styles.state} ${styles.error}`} role="alert">Cette ressource n’a pas pu être chargée.</p> : null}
            {selectedResource ? (
              <article>
                <div className={styles.meta}><span>{selectedResource.category}</span><span>{selectedResource.type}</span></div>
                <h2>{selectedResource.title}</h2>
                <p className={styles.byline}>Par {selectedResource.author} · {formatDate(selectedResource.date)}</p>
                <p className={styles.lead}>{selectedResource.description}</p>
                <div className={styles.content}>{selectedResource.content}</div>
                {selectedResource.url ? <a href={selectedResource.url} target="_blank" rel="noreferrer">Ouvrir la ressource <ExternalLink size={16} /></a> : null}
              </article>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}