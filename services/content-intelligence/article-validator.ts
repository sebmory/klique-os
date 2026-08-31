import { ContentGenerationError } from "@/services/content-generation/errors";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleFinalResult,
  ArticleGenerationRequest,
  ArticleLengthId,
  ArticleStructureSuggestion,
  ArticleStructureSuggestionsResult,
  PublicationAngleSuggestion,
} from "@/types/content-generation";

const articleWordCountRangeByLength: Record<ArticleLengthId, { min: number; max: number }> = {
  court: { min: 400, max: 600 },
  moyen: { min: 700, max: 1000 },
  long: { min: 1200, max: 1600 },
};

const articleTypes = new Set(["actualite", "portrait", "analyse", "reportage"]);
const articleLengths = new Set(["court", "moyen", "long"]);
const languages = new Set(["fr", "fr-CH"]);
const urlPattern = /^https?:\/\/[^\s]+$/i;

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeEvidence = (value: unknown): string =>
  normalize(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const temporalQualificationPattern = /\b(?:premier|premiere|dernier|derniere)\b[^.!?\n]{0,36}\b(?:apparition|titularisation|match|competition)\b|\b(?:retour progressif|calendrier de retour|reprise de competition|repris la competition|retour|reprise)\b/gi;

const buildArticleEvidenceCorpus = (request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest): string => [
  request.context.manualContext,
  ...request.context.externalVerifiedFacts,
  ...request.selectedContextItems.flatMap((item) => [item.title, item.summary, item.editedSummary, item.factualStatement]),
  ...request.brief.externalVerifiedSources.map((source) => source.title),
  ...request.brief.providedCitations.flatMap((citation) => [citation.text, citation.author, citation.source]),
].map(normalizeEvidence).filter(Boolean).join("\n");

const assertSupportedTemporalQualifications = (
  request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest,
  candidates: Array<{ location: string; text: string }>,
): void => {
  const corpus = buildArticleEvidenceCorpus(request);
  for (const candidate of candidates) {
    const normalizedText = normalizeEvidence(candidate.text);
    for (const match of normalizedText.matchAll(temporalQualificationPattern)) {
      const expression = match[0]?.trim() ?? "";
      if (expression && !corpus.includes(expression)) {
        throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Qualification temporelle non prouvee '${expression}' dans ${candidate.location}`);
      }
    }
  }
};

const assertWordCountInRange = (wordCount: number, length: ArticleLengthId, fieldName: string): void => {
  const range = articleWordCountRangeByLength[length];
  if (!Number.isInteger(wordCount) || wordCount < range.min || wordCount > range.max) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      `${fieldName} invalide: attendu ${range.min}-${range.max} mots pour ${length}, recu ${wordCount}`,
    );
  }
};

const assertOrderedUniqueSections = (
  sections: Array<{ order: number; title?: string; heading?: string }>,
  minimum: number,
  fieldName: string,
): void => {
  if (!Array.isArray(sections) || sections.length < minimum) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `${fieldName}: au moins ${minimum} sections sont requises`);
  }

  const orders = new Set<number>();
  for (const [index, section] of sections.entries()) {
    const sectionTitle = normalize(section.title ?? section.heading);
    const sectionLabel = sectionTitle || `section ${index + 1}`;
    if (!Number.isInteger(section.order)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `${fieldName}: ordre invalide pour ${sectionLabel} a l index ${index + 1}`);
    }
    if (orders.has(section.order)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `${fieldName}: ordre duplique ${section.order} pour ${sectionLabel}`);
    }
    if (section.order !== index + 1) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `${fieldName}: ordre manquant ou incorrect a l index ${index + 1}, attendu ${index + 1}, recu ${section.order}`);
    }
    if (!sectionTitle) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `${fieldName}: titre vide pour la section a l index ${index + 1}`);
    }
    orders.add(section.order);
  }
};

export const validateArticleRequest = (request: ArticleGenerationRequest): void => {
  if (request.requestType !== "article") {
    throw new ContentGenerationError("INVALID_REQUEST", "Type de requete Article attendu");
  }
  if (!normalize(request.context.displayName)) {
    throw new ContentGenerationError("MISSING_SUBJECT", "Sujet Article obligatoire");
  }
  if (!normalize(request.brief.selectedAngle)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Angle Article obligatoire");
  }
  if (!articleTypes.has(request.brief.articleType)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Type d Article invalide");
  }
  if (!articleLengths.has(request.brief.length)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Longueur Article invalide");
  }
  if (!normalize(request.brief.tone) || !normalize(request.brief.audience)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Ton et audience Article obligatoires");
  }
  if (!languages.has(request.language)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Langue Article invalide");
  }

  const topics = request.brief.requiredTopics;
  if (topics.length > 12) {
    throw new ContentGenerationError("INVALID_REQUEST", "Maximum de 12 sujets obligatoires pour un Article");
  }
  const normalizedTopics = topics.map(normalize);
  if (normalizedTopics.some((topic) => !topic) || new Set(normalizedTopics.map((topic) => topic.toLowerCase())).size !== topics.length) {
    throw new ContentGenerationError("INVALID_REQUEST", "Sujets obligatoires Article vides ou dupliques");
  }

  for (const source of request.brief.externalVerifiedSources) {
    if (!normalize(source.title) || !urlPattern.test(normalize(source.url))) {
      throw new ContentGenerationError("INVALID_REQUEST", "Source externe Article invalide: titre et URL HTTPS/HTTP requis");
    }
  }
  for (const citation of request.brief.providedCitations) {
    if (!normalize(citation.text) || !normalize(citation.author) || !normalize(citation.source)) {
      throw new ContentGenerationError("INVALID_REQUEST", "Citation Article invalide: texte, auteur et source requis");
    }
  }
};

export const validateArticleStructureSuggestions = (
  result: ArticleStructureSuggestionsResult,
  length: ArticleLengthId,
): void => {
  if (!Array.isArray(result.suggestions) || result.suggestions.length !== 3) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article: exactement 3 structures sont requises");
  }

  const ids = new Set<string>();
  for (const structure of result.suggestions) {
    const id = normalize(structure.id);
    if (!id || ids.has(id)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure Article incomplete ou identifiant duplique");
    }
    ids.add(id);
    validateArticleStructureSuggestion(structure, length);
  }
};

export const validateArticleStructureSuggestion = (
  structure: ArticleStructureSuggestion,
  length: ArticleLengthId,
): void => {
  const id = normalize(structure.id);
  if (!id || !normalize(structure.title) || !normalize(structure.editorialPromise)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure Article incomplete ou identifiant duplique");
  }
  assertOrderedUniqueSections(structure.sections, 3, `Structure Article ${id}`);
  assertWordCountInRange(structure.estimatedWordCount, length, `Estimation de la structure ${id}`);
};

export const validateArticleFinalResult = (
  result: ArticleFinalResult,
  request: ArticleGenerationRequest,
  selectedStructure: ArticleStructureSuggestion,
): void => {
  if (!normalize(result.title) || !normalize(result.lead) || !normalize(result.conclusion)) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article final incomplet: titre, chapeau et conclusion requis");
  }
  if (result.sections.length !== selectedStructure.sections.length) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Article final: ${selectedStructure.sections.length} sections attendues, recu ${result.sections.length}`);
  }
  assertOrderedUniqueSections(result.sections, 1, "Article final");
  for (const [index, section] of result.sections.entries()) {
    const expectedSection = selectedStructure.sections[index];
    if (section.order !== expectedSection.order) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Article final: ordre incorrect pour ${normalize(section.heading) || `la section ${index + 1}`}, attendu ${expectedSection.order}, recu ${section.order}`);
    }
    if (!normalize(section.heading)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Article final: titre vide pour la section a l index ${index + 1}`);
    }
    if (!section.paragraphs.length) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Article final: paragraphe manquant pour la section ${index + 1} (${section.heading})`);
    }
    if (section.paragraphs.some((paragraph) => !normalize(paragraph))) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Article final: paragraphe vide pour la section ${index + 1} (${section.heading})`);
    }
  }
  assertWordCountInRange(result.estimatedWordCount, request.brief.length, "Estimation de l Article final");

  const providedCitationKeys = new Set(
    request.brief.providedCitations.map((citation) => `${citation.text}\u0000${citation.author}\u0000${citation.source}`),
  );
  for (const citation of result.usedCitations) {
    const key = `${citation.text}\u0000${citation.author}\u0000${citation.source}`;
    if (!providedCitationKeys.has(key)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article final: citation utilisee non fournie ou modifiee");
    }
  }

  const verifiedSourceKeys = new Set(
    request.brief.externalVerifiedSources.map((source) => `${source.title}\u0000${source.url}`),
  );
  for (const source of result.usedSources) {
    const key = `${source.title}\u0000${source.url}`;
    if (!verifiedSourceKeys.has(key)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article final: source utilisee non verifiee");
    }
  }
  assertSupportedTemporalQualifications(request, [
    { location: "titre de l article", text: result.title },
    { location: "sous-titre de l article", text: result.subtitle ?? "" },
    { location: "chapeau de l article", text: result.lead },
    { location: "conclusion de l article", text: result.conclusion },
    ...result.sections.flatMap((section, index) => section.paragraphs.map((paragraph, paragraphIndex) => ({ location: `section ${index + 1} (${section.heading}), paragraphe ${paragraphIndex + 1}`, text: paragraph }))),
  ]);
};

export const validateArticleAngleSuggestionsRequest = (request: ArticleAngleSuggestionsRequest): void => {
  if (request.requestType !== "article") {
    throw new ContentGenerationError("INVALID_REQUEST", "Type de requete Article attendu");
  }
  if (!normalize(request.context.displayName)) {
    throw new ContentGenerationError("MISSING_SUBJECT", "Sujet Article obligatoire");
  }
  if (!articleTypes.has(request.brief.articleType) || !articleLengths.has(request.brief.length)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Type ou longueur Article invalide");
  }
  if (!normalize(request.brief.tone) || !normalize(request.brief.audience) || !languages.has(request.language)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Ton, audience ou langue Article invalide");
  }
  const topics = request.brief.requiredTopics;
  const normalizedTopics = topics.map(normalize);
  if (topics.length > 12 || normalizedTopics.some((topic) => !topic) || new Set(normalizedTopics.map((topic) => topic.toLowerCase())).size !== topics.length) {
    throw new ContentGenerationError("INVALID_REQUEST", "Sujets obligatoires Article vides, dupliques ou trop nombreux");
  }
  for (const source of request.brief.externalVerifiedSources) {
    if (!normalize(source.title) || !urlPattern.test(normalize(source.url))) {
      throw new ContentGenerationError("INVALID_REQUEST", "Source externe Article invalide: titre et URL HTTPS/HTTP requis");
    }
  }
  for (const citation of request.brief.providedCitations) {
    if (!normalize(citation.text) || !normalize(citation.author) || !normalize(citation.source)) {
      throw new ContentGenerationError("INVALID_REQUEST", "Citation Article invalide: texte, auteur et source requis");
    }
  }
};

export const validateArticleAngleSuggestions = (parsedContent: unknown): PublicationAngleSuggestion[] => {
  if (!parsedContent || typeof parsedContent !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON des angles Article invalide");
  }
  const suggestions = (parsedContent as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions) || suggestions.length !== 3) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article: exactement 3 angles sont requis");
  }

  const titles = new Set<string>();
  return suggestions.map((suggestion, index) => {
    if (!suggestion || typeof suggestion !== "object") {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Suggestion d angle Article invalide");
    }
    const candidate = suggestion as { title?: unknown; rationale?: unknown };
    const title = normalize(candidate.title);
    const rationale = normalize(candidate.rationale);
    if (!title || !rationale || titles.has(title.toLowerCase())) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Suggestion d angle Article vide ou dupliquee");
    }
    titles.add(title.toLowerCase());
    return { id: `article-angle-${index + 1}`, title, rationale };
  });
};

export const validateArticleAngleQualifications = (
  request: ArticleAngleSuggestionsRequest,
  suggestions: PublicationAngleSuggestion[],
): void => {
  assertSupportedTemporalQualifications(request, suggestions.flatMap((suggestion, index) => [
    { location: `angle ${index + 1}, titre`, text: suggestion.title },
    { location: `angle ${index + 1}, promesse`, text: suggestion.rationale },
  ]));
};

export const validateArticleStructureQualifications = (
  request: ArticleGenerationRequest,
  suggestions: ArticleStructureSuggestionsResult,
): void => {
  assertSupportedTemporalQualifications(request, suggestions.suggestions.flatMap((suggestion, suggestionIndex) => [
    { location: `structure ${suggestionIndex + 1}, titre`, text: suggestion.title },
    { location: `structure ${suggestionIndex + 1}, promesse`, text: suggestion.editorialPromise },
    ...suggestion.sections.flatMap((section, sectionIndex) => [
      { location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, titre`, text: section.title },
      { location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, objectif`, text: section.purpose },
      ...section.points.map((point, pointIndex) => ({ location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, point ${pointIndex + 1}`, text: point })),
    ]),
  ]));
};