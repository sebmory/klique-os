"use client";

import type { ArticleFinalResult, ArticleGenerationRequest } from "@/types/content-generation";

const articleTypeLabels: Record<string, string> = {
  actualite: "Actualité",
  portrait: "Portrait",
  analyse: "Analyse",
  reportage: "Reportage",
};

const articleLengthLabels: Record<string, string> = {
  breve: "Brève",
  court: "Court",
  moyen: "Moyen",
  long: "Long",
};

const articleRegenerationCostByLength: Record<ArticleGenerationRequest["brief"]["length"], number> = {
  breve: 1,
  court: 2,
  moyen: 3,
  long: 4,
};

export function ArticleResultScreen({
  request,
  result,
  onEdit,
  editing = false,
  editError = null,
  onRegenerate,
  regenerating = false,
  regenerationError = null,
}: {
  request: ArticleGenerationRequest;
  result: ArticleFinalResult;
  onEdit?: () => void;
  editing?: boolean;
  editError?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
  regenerationError?: string | null;
}) {
  const isBrief = request.brief.length === "breve";
  const regenerationCost = articleRegenerationCostByLength[request.brief.length];
  const copyArticle = async () => {
    const sections = result.sections.flatMap((section) => isBrief ? section.paragraphs : [section.heading, ...section.paragraphs, ""]);
    await navigator.clipboard.writeText([result.title, result.subtitle ?? "", result.lead, "", ...sections, result.conclusion].filter(Boolean).join("\n\n"));
  };

  return (
    <section className="interview-result-screen" aria-label="Resultat Article">
      <header className="interview-result-hero"><div className="interview-result-title-stack"><p className="interview-result-kicker">ARTICLE</p><h1>{result.title}</h1>{result.subtitle ? <p>{result.subtitle}</p> : null}</div></header>
      <section className="interview-section">
        <p>{result.lead}</p>
        {isBrief
          ? result.sections.flatMap((section) => section.paragraphs.map((paragraph, index) => <p key={`${section.order}-${index}`}>{paragraph}</p>))
          : result.sections.map((section) => <section key={section.order}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>)}
        {result.conclusion ? <p>{result.conclusion}</p> : null}
        <div className="interview-chip-row"><span className="interview-chip">{`${result.estimatedWordCount} mots estimés`}</span><span className="interview-chip">{articleTypeLabels[request.brief.articleType]}</span><span className="interview-chip">{articleLengthLabels[request.brief.length]}</span></div>
        {result.usedCitations.length ? <section><h2>Citations utilisées</h2><ul>{result.usedCitations.map((citation) => <li key={`${citation.text}-${citation.author}`}><q>{citation.text}</q> - {citation.author}, {citation.source}</li>)}</ul></section> : null}
        {result.usedSources.length ? <section><h2>Sources utilisées</h2><ul>{result.usedSources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></section> : null}
        {result.metadata.templateVersion ? <p className="creation-muted">{`Version ${result.metadata.templateVersion}`}</p> : null}
        {editError ? <p className="creation-error" role="alert">{editError}</p> : null}
        {regenerationError ? <p className="creation-error" role="alert">{regenerationError}</p> : null}
        {onEdit ? <button type="button" className="contents-secondary-button" onClick={onEdit} disabled={editing || regenerating}>{editing ? "Préparation de l’éditeur..." : "Modifier l’article"}</button> : null}
        {onRegenerate ? (
          <button type="button" className="contents-secondary-button" onClick={onRegenerate} disabled={regenerating || editing}>
            {regenerating ? "Régénération en cours..." : `Régénérer l’article — ${regenerationCost} crédit${regenerationCost === 1 ? "" : "s"}`}
          </button>
        ) : null}
        <button type="button" className="crm-primary-action" onClick={() => void copyArticle()}>Copier l’article</button>
      </section>
    </section>
  );
}