"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Clapperboard,
  FileText,
  Megaphone,
  MessageSquareQuote,
  Newspaper,
  Palette,
  Radio,
  Sparkles,
} from "lucide-react";
import { ContentsHubService, type ContentCreationContext } from "@/services/contents-hub";
import { runContentsBackfill } from "@/services/content-backfill";
import { isSportsBriefDocument } from "@/lib/sports-watch/brief-document";
import type { ContentDocument } from "@/types/content-document";

type ContentsHubScreenProps = {
  context: ContentCreationContext;
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const documentTypeLabels: Record<string, string> = {
  interview: "Interview",
  publication: "Publication",
  reel: "Reel",
  story: "Story",
  article: "Article",
};

const getDocumentFormatLabel = (document: ContentDocument): string => {
  if (isSportsBriefDocument(document)) return "Brève sportive";
  return documentTypeLabels[document.type] ?? document.type;
};

const getDocumentTitle = (document: ContentDocument): string => {
  const title = normalizeText(document.sections?.title);
  if (title) return title;
  return `${getDocumentFormatLabel(document)} sans titre`;
};

const getDocumentRoute = (document: ContentDocument): string => {
  if (isSportsBriefDocument(document)) {
    return `/contents/create/brief?documentId=${encodeURIComponent(document.id)}`;
  }
  return `/contents/create/result?documentId=${encodeURIComponent(document.id)}`;
};

const formatUpdatedAt = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

type StudioFormat = {
  id: string;
  title: string;
  promise: string;
  description: string;
  route: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

const studioFormats: StudioFormat[] = [
  {
    id: "interview",
    title: "Interview",
    promise: "Préparer mes questions",
    description: "Un questionnaire structuré, prêt pour l’enregistrement.",
    route: "/contents/create",
    icon: MessageSquareQuote,
  },
  {
    id: "brief",
    title: "Brève sportive",
    promise: "Rédiger une brève",
    description: "Titre, chapô et corps factuel à partir d’une actualité vérifiée.",
    route: "/contents/create/brief",
    icon: Newspaper,
  },
  {
    id: "article",
    title: "Article",
    promise: "Construire un article",
    description: "Un contenu éditorial documenté, appuyé sur des sources.",
    route: "/contents/create?objective=article",
    icon: FileText,
  },
  {
    id: "publication",
    title: "Publication",
    promise: "Préparer un post",
    description: "Un message clair pour les réseaux sociaux.",
    route: "/contents/create?objective=publication",
    icon: Megaphone,
  },
  {
    id: "reel",
    title: "Reel",
    promise: "Écrire un script court",
    description: "Un déroulé scène par scène avec un angle créatif.",
    route: "/contents/create?objective=reel&contentType=reel",
    icon: Clapperboard,
  },
  {
    id: "story",
    title: "Story",
    promise: "Cadrer une séquence",
    description: "Un fil de cartes avec hook et call to action.",
    route: "/contents/create?objective=story",
    icon: Radio,
  },
];

export function ContentsHubScreen({ context }: ContentsHubScreenProps) {
  const [drafts, setDrafts] = useState<ContentDocument[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [draftsRetryToken, setDraftsRetryToken] = useState(0);

  useEffect(() => {
    void runContentsBackfill();
  }, []);

  useEffect(() => {
    let active = true;

    const loadDrafts = async () => {
      setDraftsLoading(true);
      setDraftsError(null);

      try {
        const response = await fetch("/api/contents/storage/drafts", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) throw new Error("Unable to load drafts");

        const payload = (await response.json()) as { drafts?: Array<{ document?: ContentDocument }> };
        if (!active) return;

        setDrafts(
          (payload.drafts ?? [])
            .map((entry) => entry.document)
            .filter((document): document is ContentDocument => Boolean(document?.id)),
        );
      } catch {
        if (!active) return;
        setDrafts([]);
        setDraftsError("Vos brouillons n’ont pas pu être chargés.");
      } finally {
        if (active) setDraftsLoading(false);
      }
    };

    void loadDrafts();

    return () => {
      active = false;
    };
  }, [draftsRetryToken]);

  const buildEntryRoute = useMemo(() => (baseRoute: string): string => {
    if (context.mode !== "contextual" || !context.subjectName) return baseRoute;

    const [path, queryString = ""] = baseRoute.split("?");
    const params = new URLSearchParams(queryString);
    params.set("subject", context.subjectName);
    params.set("contextType", context.subjectType ?? "other");
    if (context.subjectId) {
      params.set("subjectId", context.subjectId);
    }
    return `${path}?${params.toString()}`;
  }, [context]);

  const templates = useMemo(
    () => ContentsHubService.templates().filter((template) =>
      template.isAvailable && template.entryRoute),
    [],
  );

  return (
    <section className="contents-hub-screen studio-home">
      <header className="studio-hero">
        {context.mode === "contextual" && context.subjectName ? (
          <p className="contents-context-chip">Création de contenu pour : {context.subjectName}</p>
        ) : null}
        <h1>Studio</h1>
        <p className="studio-hero-lead">
          L’espace de travail de votre rédaction : partez d’une actualité ou ouvrez un format.
        </p>
        <div className="studio-hero-actions">
          <Link href="/sports-watch" className="studio-primary-action">
            <Newspaper size={17} aria-hidden />
            <span>
              <strong>Partir d’une actualité</strong>
              <small>Ouvrir Sports Watch et transformer une actualité validée.</small>
            </span>
          </Link>
          <a href="#studio-formats" className="studio-secondary-action">
            <Sparkles size={17} aria-hidden />
            <span>
              <strong>Créer un contenu</strong>
              <small>Choisir un format : interview, brève, article…</small>
            </span>
          </a>
        </div>
      </header>

      <section className="contents-section studio-drafts" aria-labelledby="studio-drafts-title">
        <div className="contents-section-head">
          <h2 id="studio-drafts-title">Brouillons récents</h2>
        </div>

        {draftsLoading ? (
          <article className="contents-empty-card" aria-live="polite">
            <strong>Chargement de vos brouillons…</strong>
          </article>
        ) : draftsError ? (
          <article className="contents-empty-card" role="alert">
            <strong>{draftsError}</strong>
            <p>Vérifiez votre connexion puis relancez le chargement.</p>
            <button type="button" className="contents-ghost-button" onClick={() => setDraftsRetryToken((value) => value + 1)}>
              Réessayer
            </button>
          </article>
        ) : drafts.length === 0 ? (
          <article className="contents-empty-card">
            <strong>Aucun brouillon pour le moment.</strong>
            <p>Vos contenus commencés apparaîtront ici pour être repris en un clic.</p>
          </article>
        ) : (
          <ul className="studio-draft-list">
            {drafts.map((document) => (
              <li key={document.id} className="studio-draft-row">
                <div className="studio-draft-copy">
                  <strong>{getDocumentTitle(document)}</strong>
                  <small>
                    {getDocumentFormatLabel(document)} · Modifié le{" "}
                    {formatUpdatedAt(document.updatedAt || document.createdAt)}
                  </small>
                </div>
                <Link
                  href={getDocumentRoute(document)}
                  className="contents-ghost-button"
                  aria-label={`Ouvrir le brouillon ${getDocumentTitle(document)}`}
                >
                  Ouvrir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="contents-section" id="studio-formats" aria-labelledby="studio-formats-title">
        <div className="contents-section-head">
          <h2 id="studio-formats-title">Créer un contenu</h2>
          <p>Chaque format ouvre un parcours prêt à l’emploi.</p>
        </div>

        <div className="studio-format-grid">
          {studioFormats.map((format) => {
            const Icon = format.icon;
            return (
              <article key={format.id} className="studio-format-card">
                <span className="contents-generator-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <div className="contents-generator-copy">
                  <h3>{format.title}</h3>
                  <p>{format.description}</p>
                </div>
                <Link
                  href={buildEntryRoute(format.route)}
                  className="studio-format-action"
                  aria-label={`${format.promise} — ${format.title}`}
                >
                  {format.promise}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {templates.length > 0 ? (
        <section className="contents-section" aria-labelledby="studio-templates-title">
          <div className="contents-section-head">
            <h2 id="studio-templates-title">Parcours guidés</h2>
            <p>Partez d’un besoin précis avec des paramètres déjà adaptés.</p>
          </div>

          <div className="contents-templates-grid">
            {templates.map((template) => (
              <Link
                key={template.id}
                href={buildEntryRoute(template.entryRoute as string)}
                className="contents-template-card"
                aria-label={`Ouvrir l assistant de creation pour ${template.title}`}
              >
                <span className="contents-template-icon" aria-hidden>
                  <Sparkles size={16} />
                </span>
                <div className="contents-template-body">
                  <div className="contents-template-heading">
                    <h3>{template.title}</h3>
                    <span className="contents-template-badge">Disponible</span>
                  </div>
                  <p>{template.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="contents-section studio-tools" aria-labelledby="studio-tools-title">
        <div className="contents-section-head">
          <h2 id="studio-tools-title">Outils</h2>
          <p>Ressources secondaires pour vos contenus.</p>
        </div>

        <div className="contents-templates-grid">
          <Link
            href="/contents/story-studio/brand-kits"
            className="contents-template-card"
            aria-label="Ouvrir les Brand Kits Story Studio"
          >
            <span className="contents-template-icon" aria-hidden>
              <Palette size={16} />
            </span>
            <div className="contents-template-body">
              <div className="contents-template-heading">
                <h3>Brand Kits</h3>
                <span className="contents-template-badge">Story Studio</span>
              </div>
              <p>Couleurs, logos, typographies et signatures de marque.</p>
            </div>
          </Link>
        </div>
      </section>
    </section>
  );
}
