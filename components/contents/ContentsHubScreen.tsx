"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  BookOpen,
  Clapperboard,
  FileText,
  Megaphone,
  MessageSquareQuote,
  Mic,
  Radio,
  Search,
  Sparkles,
  UserSquare2,
} from "lucide-react";
import { ContentsHubService, type ContentCreationContext, type ContentGenerator, type ContentTemplate } from "@/services/contents-hub";
import { runContentsBackfill } from "@/services/content-backfill";

type ContentsHubScreenProps = {
  context: ContentCreationContext;
};

const generatorIconById: Record<ContentGenerator["id"], ComponentType<{ size?: number; className?: string }>> = {
  interview: MessageSquareQuote,
  publication: FileText,
  reel: Clapperboard,
  story: Radio,
  podcast: Mic,
  article: BookOpen,
  campaign: Megaphone,
};

const templateIconById: Record<ContentTemplate["id"], ComponentType<{ size?: number; className?: string }>> = {
  "portrait-athlete": UserSquare2,
  "before-match": Sparkles,
  "after-match": Sparkles,
  "new-contract": FileText,
  "behind-the-scenes": Clapperboard,
  "fast-questions": MessageSquareQuote,
  "partner-interview": MessageSquareQuote,
  "match-day-story": Radio,
};

export function ContentsHubScreen({ context }: ContentsHubScreenProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    void runContentsBackfill();
  }, []);

  const generators = useMemo(() => ContentsHubService.generators(), []);
  const templates = useMemo(() => ContentsHubService.templates(), []);

  const filteredGenerators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return generators;

    return generators.filter((item) => {
      return `${item.title} ${item.description}`.toLowerCase().includes(normalizedQuery);
    });
  }, [generators, query]);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return templates;

    return templates.filter((item) => {
      return `${item.title} ${item.description}`.toLowerCase().includes(normalizedQuery);
    });
  }, [query, templates]);

  const availableGenerators = useMemo(() => filteredGenerators.filter((generator) => generator.isAvailable), [filteredGenerators]);
  const upcomingGenerators = useMemo(() => filteredGenerators.filter((generator) => !generator.isAvailable), [filteredGenerators]);

  const buildEntryRoute = (baseRoute: string): string => {
    if (context.mode !== "contextual" || !context.subjectName) return baseRoute;

    const [path, queryString = ""] = baseRoute.split("?");
    const params = new URLSearchParams(queryString);
    params.set("subject", context.subjectName);
    params.set("contextType", context.subjectType ?? "other");
    if (context.subjectId) {
      params.set("subjectId", context.subjectId);
    }
    return `${path}?${params.toString()}`;
  };

  return (
    <section className="contents-hub-screen">
      <header className="contents-hero-card">
        <div className="contents-hero-layer" aria-hidden />
        <div className="contents-hero-content">
          {context.mode === "contextual" && context.subjectName ? (
            <p className="contents-context-chip">Creation de contenu pour : {context.subjectName}</p>
          ) : null}
          <h1>Que souhaitez-vous creer aujourd hui ?</h1>
          <p>
            Creer rapidement des interviews, publications, reels, stories, articles, podcasts ou campagnes.
          </p>

          <label className="contents-search" htmlFor="contents-hub-search">
            <Search size={18} aria-hidden />
            <input
              id="contents-hub-search"
              type="search"
              placeholder="Rechercher un type de contenu ou un modele"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </header>

      <section className="contents-section" aria-labelledby="contents-generators-title">
        <div className="contents-section-head">
          <h2 id="contents-generators-title">Generateurs disponibles</h2>
          <p>Demarrez un format editorial en quelques secondes.</p>
        </div>

        <div className="contents-generators-grid">
          {availableGenerators.map((generator) => {
            const Icon = generatorIconById[generator.id];
            return (
              <article key={generator.id} className="contents-generator-card">
                <span className="contents-generator-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <div className="contents-generator-copy">
                  <h3>{generator.title}</h3>
                  <p>{generator.description}</p>
                </div>
                <Link href={buildEntryRoute(generator.entryRoute)} className="contents-ghost-button" aria-label={`Ouvrir l assistant de creation pour ${generator.title}`}>
                  Creer
                </Link>
                <small>{generator.statusLabel}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="contents-section" aria-labelledby="contents-resume-title">
        <div className="contents-section-head">
          <h2 id="contents-resume-title">Brouillons</h2>
        </div>
        <article className="contents-empty-card">
          <strong>Aucun brouillon pour le moment.</strong>
          <p>Vos contenus commencés apparaîtront ici pour vous permettre de les reprendre rapidement.</p>
        </article>
      </section>

      <section className="contents-section" aria-labelledby="contents-templates-title">
        <div className="contents-section-head">
          <h2 id="contents-templates-title">Prochains generateurs</h2>
          <p>Points d entree reutilisables vers les futurs generateurs.</p>
        </div>

        <div className="contents-templates-grid">
          {upcomingGenerators.map((generator) => {
            const Icon = generatorIconById[generator.id];
            return (
              <article key={`generator-${generator.id}`} className="contents-template-card">
                <span className="contents-template-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <div className="contents-template-body">
                  <div className="contents-template-heading">
                    <h3>{generator.title}</h3>
                    <span className="contents-template-badge">Bientôt disponible</span>
                  </div>
                  <p>{generator.description}</p>
                </div>
              </article>
            );
          })}

          {filteredTemplates.map((template) => {
            const Icon = templateIconById[template.id];
            return (
              <article key={template.id} className="contents-template-card">
                <span className="contents-template-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <div className="contents-template-body">
                  <div className="contents-template-heading">
                    <h3>{template.title}</h3>
                    <span className="contents-template-badge">Bientôt disponible</span>
                  </div>
                  <p>{template.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="contents-section" aria-labelledby="contents-library-title">
        <div className="contents-section-head">
          <h2 id="contents-library-title">Bibliotheque</h2>
          <p>Zone de consultation des brouillons, publies, favoris et archives.</p>
        </div>

        <article className="contents-library-card">
          <div>
            <strong>Aucun contenu enregistre pour le moment.</strong>
            <p>La bibliotheque sera activee lorsque les premiers contenus seront sauvegardes.</p>
          </div>
          <button type="button" className="contents-secondary-button" disabled>
            Voir toute la bibliotheque
          </button>
        </article>
      </section>

      <section className="contents-section" aria-labelledby="contents-inspiration-title">
        <div className="contents-section-head">
          <div className="contents-section-heading-inline">
            <h2 id="contents-inspiration-title">Inspirations</h2>
            <span className="contents-template-badge">Bientôt disponible</span>
          </div>
          <p>Des opportunités de contenus suggérées selon vos athlètes, leur actualité et les moments importants à exploiter.</p>
        </div>

        <div className="contents-inspiration-grid">
          {[
            {
              title: "Match important ce week-end",
              example: "Un athlète KLIQUE joue une rencontre importante. Préparez un contenu avant-match.",
            },
            {
              title: "Nouvelle étape dans sa carrière",
              example: "Une signature ou un changement de club peut devenir une opportunité éditoriale.",
            },
            {
              title: "Il est temps de reprendre la parole",
              example: "Un athlète n’a pas été mis en avant récemment. KLIQUE pourra suggérer un nouvel angle de contenu.",
            },
          ].map((item) => (
            <article key={item.title} className="contents-inspiration-card">
              <strong>{item.title}</strong>
              <span>{item.example}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
