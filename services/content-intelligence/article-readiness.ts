import type {
  ArticleAngleSuggestionsRequest,
  ArticleGenerationRequest,
  ArticleLengthId,
} from "@/types/content-generation";

export type ArticleEditorialReadinessMetrics = {
  availableWordCount: number;
  distinctFactualElementCount: number;
  requiredWordCount: number;
  requiredFactualElementCount: number;
};

export type ArticleEditorialReadinessAssessment = {
  ready: boolean;
  issues: string[];
  metrics: ArticleEditorialReadinessMetrics;
};

// La maturité mesure des notes et preuves cumulées, pas un texte déjà rédigé.
const thresholdsByLength: Record<ArticleLengthId, { words: number; factualElements: number }> = {
  breve: { words: 50, factualElements: 4 },
  court: { words: 120, factualElements: 6 },
  moyen: { words: 220, factualElements: 8 },
  long: { words: 350, factualElements: 10 },
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeElement = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const splitFactualElements = (value: unknown): string[] =>
  normalizeText(value)
    .split(/\r?\n+|[.!?;]+(?:\s+|$)/u)
    .map((element) => element.replace(/^\s*[-*•]+\s*/u, "").trim())
    .filter(Boolean);

const countWords = (value: string): number =>
  value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;

const removeSelectedContextCopies = (
  manualContext: string,
  request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest,
): string => {
  let remainingContext = manualContext;
  for (const item of request.selectedContextItems) {
    const summary = normalizeText(item.editedSummary || item.summary);
    if (!summary) continue;
    const serializedItem = `${normalizeText(item.title)}: ${summary}`;
    remainingContext = remainingContext.split(serializedItem).join(" ");
  }
  return remainingContext;
};

export const assessArticleEditorialReadiness = (
  request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest,
): ArticleEditorialReadinessAssessment => {
  const threshold = thresholdsByLength[request.brief.length];
  const manualContext = removeSelectedContextCopies(normalizeText(request.context.manualContext), request);
  const matterSources = [
    manualContext,
    ...request.context.externalVerifiedFacts,
    ...request.selectedContextItems.map((item) => item.factualStatement || item.editedSummary || item.summary),
    ...request.brief.providedCitations.map((citation) => citation.text),
  ];

  const distinctElements = new Map<string, string>();
  for (const source of matterSources) {
    for (const element of splitFactualElements(source)) {
      const normalized = normalizeElement(element);
      if (normalized && !distinctElements.has(normalized)) distinctElements.set(normalized, element);
    }
  }

  const availableWordCount = Array.from(distinctElements.values()).reduce(
    (total, element) => total + countWords(element),
    0,
  );
  const distinctFactualElementCount = distinctElements.size;
  const metrics: ArticleEditorialReadinessMetrics = {
    availableWordCount,
    distinctFactualElementCount,
    requiredWordCount: threshold.words,
    requiredFactualElementCount: threshold.factualElements,
  };
  const issues: string[] = [];

  if (availableWordCount < threshold.words) {
    issues.push(
      `Ajoutez au moins ${threshold.words - availableWordCount} mots de matière éditoriale (${availableWordCount}/${threshold.words}).`,
    );
  }
  if (distinctFactualElementCount < threshold.factualElements) {
    issues.push(
      `Ajoutez au moins ${threshold.factualElements - distinctFactualElementCount} éléments factuels distincts (${distinctFactualElementCount}/${threshold.factualElements}).`,
    );
  }

  return { ready: issues.length === 0, issues, metrics };
};
