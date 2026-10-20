"use client";

import type {
  ArticleFinalResult,
  ArticleGenerationRequest,
  EditorialGenerationMetadata,
} from "@/types/content-generation";
import { EditorialReliabilityPanel } from "@/components/contents/EditorialReliabilityPanel";

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
  editorialMetadata,
}: {
  request: ArticleGenerationRequest;
  result: ArticleFinalResult;
  onEdit?: () => void;
  editing?: boolean;
  editError?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
  regenerationError?: string | null;
  editorialMetadata?: EditorialGenerationMetadata;
}) {
  const isBrief = request.brief.length === "breve";
  const effectiveEditorialMetadata = editorialMetadata ?? result.metadata.editorial;
  const isShortLimitedPresentation = effectiveEditorialMetadata?.generationMode === "limited"
    && result.estimatedWordCount <= 120;
  const resultFormatLabel = isShortLimitedPresentation && request.brief.articleType === "portrait"
    ? "Présentation factuelle courte — matière insuffisante pour un portrait"
    : isShortLimitedPresentation
      ? "Présentation factuelle courte"
      : `${articleTypeLabels[request.brief.articleType]} — ${articleLengthLabels[request.brief.length]}`;
  const requestedFormatLabel = `${articleTypeLabels[request.brief.articleType]} — ${articleLengthLabels[request.brief.length]}`;
  const angleReframingWarning = effectiveEditorialMetadata?.warnings.find((warning) =>
    warning.startsWith("Angle recadré côté serveur"));
  const compactArticleText = [
    result.lead,
    ...result.sections.flatMap((section) => section.paragraphs),
    result.conclusion,
  ].filter(Boolean).join(" ");
  const regenerationCost = articleRegenerationCostByLength[request.brief.length];
  const copyArticle = async () => {
    if (isShortLimitedPresentation) {
      await navigator.clipboard.writeText([result.title, result.subtitle ?? "", compactArticleText].filter(Boolean).join("\n\n"));
      return;
    }
    const sections = result.sections.flatMap((section) => isBrief ? section.paragraphs : [section.heading, ...section.paragraphs, ""]);
    await navigator.clipboard.writeText([result.title, result.subtitle ?? "", result.lead, "", ...sections, result.conclusion].filter(Boolean).join("\n\n"));
  };

  return (
    <section className="interview-result-screen" aria-label="Resultat Article">
      <header className="interview-result-hero"><div className="interview-result-title-stack"><p className="interview-result-kicker">ARTICLE</p><h1>{result.title}</h1>{result.subtitle ? <p>{result.subtitle}</p> : null}</div></header>
      <EditorialReliabilityPanel
        metadata={effectiveEditorialMetadata}
        missingInformationAsInterviewPrompts
      />
      {angleReframingWarning ? <p className="creation-muted" role="status">{angleReframingWarning}</p> : null}
      <section className="interview-section">
        {isShortLimitedPresentation
          ? <p>{compactArticleText}</p>
          : <p>{result.lead}</p>}
        {!isShortLimitedPresentation && (isBrief
          ? result.sections.flatMap((section) => section.paragraphs.map((paragraph, index) => <p key={`${section.order}-${index}`}>{paragraph}</p>))
          : result.sections.map((section) => <section key={section.order}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>))}
        {!isShortLimitedPresentation && result.conclusion ? <p>{result.conclusion}</p> : null}
        <div className="interview-chip-row">
          <span className="interview-chip">{`${result.estimatedWordCount} mots estimés`}</span>
          <span className="interview-chip">{resultFormatLabel}</span>
          {isShortLimitedPresentation ? <span className="interview-chip">{`Réglage demandé : ${requestedFormatLabel}`}</span> : null}
        </div>
        {result.usedCitations.length ? <section><h2>Citations utilisées</h2><ul>{result.usedCitations.map((citation) => <li key={`${citation.text}-${citation.author}`}><q>{citation.text}</q> - {citation.author}, {citation.source}</li>)}</ul></section> : null}
        {result.usedSources.length && !(editorialMetadata ?? result.metadata.editorial) ? <section><h2>Sources utilisées</h2><ul>{result.usedSources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></section> : null}
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