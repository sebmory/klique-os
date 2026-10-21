import { ContentGenerationError } from "@/services/content-generation/errors";
import {
  assessArticleEditorialReadiness,
  type ArticleEditorialReadinessAssessment,
} from "@/services/content-intelligence/article-readiness";
import type {
  ArticleAngleSuggestionsRequest,
  EditorialGenerationMode,
  ArticleFinalResult,
  ArticleGenerationRequest,
  ArticleLengthId,
  ArticleStructureSuggestion,
  ArticleStructureSuggestionsResult,
  PublicationAngleSuggestion,
} from "@/types/content-generation";

const articleWordCountRangeByLength: Record<ArticleLengthId, { min: number; max: number }> = {
  breve: { min: 50, max: 120 },
  court: { min: 400, max: 600 },
  moyen: { min: 700, max: 1000 },
  long: { min: 1200, max: 1600 },
};

const articleTypes = new Set(["actualite", "portrait", "analyse", "reportage"]);
const articleLengths = new Set(["breve", "court", "moyen", "long"]);
const languages = new Set(["fr", "fr-CH"]);
const urlPattern = /^https?:\/\/[^\s]+$/i;

export class ArticleEditorialReadinessError extends Error {
  readonly code = "ARTICLE_EDITORIAL_READINESS_INSUFFICIENT";

  constructor(readonly assessment: ArticleEditorialReadinessAssessment) {
    super("La matière éditoriale disponible est insuffisante pour générer cet Article.");
  }
}

const assertArticleEditorialReadiness = (
  request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest,
): void => {
  const serverEditorialMode = request.editorialGeneration?.generationMode;
  if (
    (serverEditorialMode === "ready" || serverEditorialMode === "limited")
    && request.editorialContext?.generationMode === serverEditorialMode
  ) {
    return;
  }
  const assessment = assessArticleEditorialReadiness(request);
  if (!assessment.ready) throw new ArticleEditorialReadinessError(assessment);
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeEvidence = (value: unknown): string =>
  normalize(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeComparable = (value: unknown): string =>
  normalizeEvidence(value).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const unsupportedThemeRules = [
  {
    label: "choix de carrière",
    candidate: /\b(?:choix|decision|strategie) de carriere\b|\bchoisi de rejoindre\b|\bdecision de rejoindre\b/u,
    evidence: /\b(?:choix|decision|strategie) de carriere\b|\bchoisi de rejoindre\b|\bdecision de rejoindre\b/u,
  },
  {
    label: "motivations ou ambitions",
    candidate: /\bmotivations?\b|\bambitions?\b|\baspirations?\b|\bce qui (?:le|la) pousse\b/u,
    evidence: /\bmotivations?\b|\bambitions?\b|\baspirations?\b|\bobjectif personnel\b/u,
  },
  {
    label: "caractère ou personnalité",
    candidate: /\bcaractere\b|\bpersonnalite\b|\btemperament\b|\betat d esprit\b/u,
    evidence: /\bcaractere\b|\bpersonnalite\b|\btemperament\b|\betat d esprit\b/u,
  },
  {
    label: "style de jeu ou rôle tactique",
    candidate: /\bstyle de jeu\b|\brole tactique\b|\bimpact sur le terrain\b|\bvision du jeu\b|\bqualites? techniques?\b/u,
    evidence: /\bstyle de jeu\b|\brole tactique\b|\bimpact sur le terrain\b|\bvision du jeu\b|\bqualites? techniques?\b/u,
  },
  {
    label: "quotidien ou entraînement",
    candidate: /\bquotidien\b|\bentrainements?\b|\bpreparation\b|\bdans les coulisses\b/u,
    evidence: /\bquotidien\b|\bentrainements?\b|\bpreparation\b|\bdans les coulisses\b/u,
  },
  {
    label: "intégration dans le club",
    candidate: /\bintegration\b|\bs adapte\b|\badaptation au club\b|\bplace dans l equipe\b/u,
    evidence: /\bintegration\b|\bs adapte\b|\badaptation au club\b|\bplace dans l equipe\b/u,
  },
] as const;

const assertSupportedEditorialThemes = (
  request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest,
  candidates: Array<{ location: string; text: string }>,
): void => {
  const evidence = buildArticleEvidenceCorpus(request);
  for (const candidate of candidates) {
    const text = normalizeEvidence(candidate.text);
    for (const rule of unsupportedThemeRules) {
      if (rule.candidate.test(text) && !rule.evidence.test(evidence)) {
        throw new ContentGenerationError(
          "INVALID_PROVIDER_RESPONSE",
          `Theme non documente '${rule.label}' dans ${candidate.location}`,
        );
      }
    }
  }
};

const limitedFillerPatterns = [
  /\bau coeur du jeu\b/u,
  /\bdans l ombre\b/u,
  /\brole essentiel\b/u,
  /\bforce du collectif\b/u,
  /\bdefis? a venir\b/u,
  /\bbien plus qu\b/u,
] as const;

const assertLimitedArticleQuality = (
  request: ArticleGenerationRequest,
  candidates: Array<{ location: string; text: string }>,
): void => {
  if (request.editorialGeneration?.generationMode !== "limited") return;
  assertSupportedEditorialThemes(request, candidates);
  for (const candidate of candidates) {
    const text = normalizeEvidence(candidate.text);
    if (candidate.text.includes("?")) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Question sans réponse interdite en mode limited dans ${candidate.location}`,
      );
    }
    if (limitedFillerPatterns.some((pattern) => pattern.test(text))) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Formulation de remplissage interdite en mode limited dans ${candidate.location}`,
      );
    }
    if (
      /\b(?:aucun|aucune|absence de)\b.{0,80}\b(?:trace|resultats?|participations?|apparitions?|buts?)\b/u.test(text)
      || /\bn a pas ete\b.{0,60}\b(?:retrouve|documente)\b/u.test(text.replace(/[’']/g, " "))
    ) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Limite documentaire presentee comme fait dans ${candidate.location}`,
      );
    }
  }
};

const genericEditorialHeadingPatterns = [
  /^(?:le )?fait (?:confirme|du match)$/,
  /^(?:le )?contexte$/,
  /^(?:le )?repere a retenir$/,
  /^ce qu il faut retenir$/,
  /^(?:les )?elements? a retenir$/,
  /^point de situation(?: precis)?$/,
  /^conclusion$/,
  /^profil sportif(?: et|,).*(?:club|affiliation)$/,
  /^affiliation (?:au )?club$/,
  /^donnees? (?:precises? )?sur la participation(?: en match officiel)?$/,
  /^participation en match officiel$/,
  /^.+ au service (?:de|du|des) .+$/,
] as const;

const assertNoGenericEditorialHeadings = (candidates: Array<{ location: string; text: string }>): void => {
  for (const candidate of candidates) {
    const normalizedText = normalizeComparable(candidate.text);
    if (genericEditorialHeadingPatterns.some((pattern) => pattern.test(normalizedText))) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Intertitre generique interdit '${normalize(candidate.text)}' dans ${candidate.location}`,
      );
    }
  }
};

const documentaryCommentaryPatterns = [
  /\b(?:il|elle|le sujet|la personne)\s+ne\s+(?:decrit|detaille|precise|indique|mentionne|fournit)\s+(?:toutefois\s+|cependant\s+)?(?:pas\s+|aucun(?:e)?\s+)[^.!?]*/u,
  /\b(?:les|ces)\s+(?:elements|extraits|donnees|informations)\s+ne\s+(?:permettent|suffisent)\s+pas[^.!?]*/u,
  /\brien dans (?:le dossier|les extraits|les informations|les donnees)\b[^.!?]*/u,
] as const;

const assertNoDocumentaryCommentary = (
  request: ArticleGenerationRequest,
  candidates: Array<{ location: string; text: string }>,
): void => {
  const evidence = buildArticleEvidenceCorpus(request);
  for (const candidate of candidates) {
    const text = normalizeEvidence(candidate.text);
    const unsupportedCommentary = documentaryCommentaryPatterns
      .map((pattern) => text.match(pattern)?.[0]?.trim())
      .filter((match): match is string => Boolean(match))
      .find((match) => !evidence.includes(match));
    if (unsupportedCommentary) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Commentaire sur une lacune documentaire interdit dans ${candidate.location}`,
      );
    }
  }
};

const assertNoHeavySportsTitles = (
  request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest,
  candidates: Array<{ location: string; text: string }>,
): void => {
  if (!normalize(request.context.sport)) return;

  for (const candidate of candidates) {
    if (/\bavec\b.+\bcontre\b/u.test(normalizeComparable(candidate.text))) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Construction de titre sportif 'avec ... contre ...' interdite dans ${candidate.location}`,
      );
    }
  }
};

const assertUniqueFinalParagraphs = (paragraphs: Array<{ location: string; text: string }>): void => {
  const firstLocationByParagraph = new Map<string, string>();
  for (const paragraph of paragraphs) {
    const normalizedText = normalizeComparable(paragraph.text);
    const firstLocation = firstLocationByParagraph.get(normalizedText);
    if (normalizedText && firstLocation) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Paragraphe identique '${normalize(paragraph.text)}' dans ${firstLocation} et ${paragraph.location}`,
      );
    }
    if (normalizedText) firstLocationByParagraph.set(normalizedText, paragraph.location);
  }
};

const briefSentenceStopWords = new Set([
  "a", "ai", "ainsi", "au", "aux", "avec", "ce", "ces", "cet", "cette", "dans", "de", "des", "du",
  "elle", "en", "est", "et", "il", "ils", "la", "le", "les", "leur", "leurs", "lui", "mais", "ne",
  "ni", "on", "ou", "par", "pas", "plus", "pour", "que", "qui", "sa", "se", "ses", "son", "sur",
  "un", "une", "vers",
]);

type BriefSentenceCandidate = {
  location: string;
  significantWords: Set<string>;
};

const extractBriefSentenceCandidates = (paragraphs: Array<{ location: string; text: string }>): BriefSentenceCandidate[] =>
  paragraphs.flatMap((paragraph) =>
    normalize(paragraph.text)
      .split(/(?<=[.!?])\s+|\r?\n+/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .map((sentence, sentenceIndex) => {
        const words = sentence.match(/[\p{L}\p{N}]+/gu) ?? [];
        const significantWords = words.reduce<Set<string>>((result, word, wordIndex) => {
          const normalizedWord = normalizeComparable(word);
          const isInternalProperName = wordIndex > 0 && /^\p{Lu}/u.test(word);
          if (normalizedWord.length > 2 && !briefSentenceStopWords.has(normalizedWord) && !isInternalProperName) {
            result.add(normalizedWord);
          }
          return result;
        }, new Set<string>());
        return {
          location: `${paragraph.location}, phrase ${sentenceIndex + 1}`,
          significantWords,
        };
      }),
  );

export class ArticleFinalSentenceRepetitionError extends ContentGenerationError {
  constructor(readonly firstLocation: string, readonly secondLocation: string) {
    super(
      "INVALID_PROVIDER_RESPONSE",
      `Brève Article: répétition entre ${firstLocation} et ${secondLocation}`,
    );
  }
}

const assertNoRepeatedBriefSentences = (paragraphs: Array<{ location: string; text: string }>): void => {
  const sentences = extractBriefSentenceCandidates(paragraphs);
  for (let firstIndex = 0; firstIndex < sentences.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < sentences.length; secondIndex += 1) {
      const first = sentences[firstIndex];
      const second = sentences[secondIndex];
      const commonWordCount = [...first.significantWords].filter((word) => second.significantWords.has(word)).length;
      const shortestSentenceWordCount = Math.min(first.significantWords.size, second.significantWords.size);
      if (commonWordCount >= 4 && shortestSentenceWordCount > 0 && commonWordCount / shortestSentenceWordCount >= 0.6) {
        throw new ArticleFinalSentenceRepetitionError(first.location, second.location);
      }
    }
  }
};

const temporalQualificationPattern = /\b(?:premier|premiere|dernier|derniere)\b[^.!?\n]{0,36}\b(?:apparition|titularisation|match|competition)\b|\b(?:retour progressif|calendrier de retour|reprise de competition|repris la competition|retour|reprise)\b/gi;
const recurrenceQualificationPattern = /\b(?:retrouve la competition|retrouve les terrains|de nouveau|a nouveau|reintegre|renoue avec|reapparait|revient dans|retrouve)\b/gi;
const subjectActivityPattern = /\b(?:presence|present|participation|participe|titulaire|titularisation|entre en jeu|joue|match|competition|terrain|groupe|equipe|effectif|club|entrainement|activite|role|statut|saison|championnat|tournoi|course|victoire|succes|resultat|performance)\b/i;

const finalMetaExpressions = [
  "le contexte fourni",
  "les informations fournies",
  "le dossier disponible",
  "le fait vérifié",
  "le cadre factuel",
  "le repère à retenir",
  "cette formulation repose sur",
  "les éléments disponibles",
  "il convient de",
  "pour suivre la situation avec rigueur",
] as const;

const briefUndesirableExpressions = [
  "ne permet pas d’établir",
  "ne permet pas de déterminer",
  "ne renseigne pas",
  "les informations disponibles ne permettent pas",
  "sans ajouter d’interprétation",
  "à ce stade",
  "point de situation précis",
] as const;

const assertNoFinalMetaLanguage = (candidates: Array<{ location: string; text: string }>): void => {
  for (const candidate of candidates) {
    const normalizedText = normalizeEvidence(candidate.text);
    const expression = finalMetaExpressions.find((item) => normalizedText.includes(normalizeEvidence(item)));
    if (expression) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Formulation meta interdite '${expression}' dans ${candidate.location}`,
      );
    }
  }
};

const buildArticleEvidenceCorpus = (request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest): string => [
  request.context.manualContext,
  ...request.context.knownFacts,
  ...request.context.internalFacts,
  ...request.context.externalVerifiedFacts,
  ...request.selectedContextItems.flatMap((item) => [item.title, item.summary, item.editedSummary, item.factualStatement]),
  request.brief.additionalContext,
  ...request.brief.requiredTopics,
  ...request.brief.externalVerifiedSources.map((source) => source.title),
  ...request.brief.providedCitations.flatMap((citation) => [citation.text, citation.author, citation.source]),
  ...(request.editorialContext?.facts.map((fact) => fact.text) ?? []),
  ...(request.editorialContext?.chronology.map((entry) => entry.text) ?? []),
  ...(request.editorialContext?.citations.map((citation) => citation.text) ?? []),
  ...(request.editorialContext?.editorialLeads.map((lead) => lead.text) ?? []),
].map(normalizeEvidence).filter(Boolean).join("\n");

const assertNoUnsupportedBriefLanguage = (
  request: ArticleGenerationRequest,
  candidates: Array<{ location: string; text: string }>,
): void => {
  const corpus = buildArticleEvidenceCorpus(request);
  for (const candidate of candidates) {
    const normalizedText = normalizeEvidence(candidate.text);
    const expression = briefUndesirableExpressions.find((item) => {
      const normalizedExpression = normalizeEvidence(item);
      return normalizedText.includes(normalizedExpression) && !corpus.includes(normalizedExpression);
    });
    if (expression) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Formulation editoriale indesirable '${expression}' dans ${candidate.location}`,
      );
    }
  }
};

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
    for (const match of normalizedText.matchAll(recurrenceQualificationPattern)) {
      const expression = match[0]?.trim() ?? "";
      const matchIndex = match.index ?? 0;
      const clauseStart = Math.max(
        normalizedText.lastIndexOf(".", matchIndex - 1),
        normalizedText.lastIndexOf("!", matchIndex - 1),
        normalizedText.lastIndexOf("?", matchIndex - 1),
        normalizedText.lastIndexOf("\n", matchIndex - 1),
      ) + 1;
      const nextBoundaryIndexes = [".", "!", "?", "\n"]
        .map((separator) => normalizedText.indexOf(separator, matchIndex + expression.length))
        .filter((index) => index >= 0);
      const clauseEnd = nextBoundaryIndexes.length > 0 ? Math.min(...nextBoundaryIndexes) : normalizedText.length;
      const clause = normalizedText.slice(clauseStart, clauseEnd);
      if (expression && subjectActivityPattern.test(clause) && !corpus.includes(expression)) {
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

const assertWordCountTarget = (
  wordCount: number,
  length: ArticleLengthId,
  fieldName: string,
  generationMode: EditorialGenerationMode,
): void => {
  if (generationMode !== "limited") {
    assertWordCountInRange(wordCount, length, fieldName);
    return;
  }
  const maximum = articleWordCountRangeByLength[length].max;
  if (!Number.isInteger(wordCount) || wordCount < 1 || wordCount > maximum) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      `${fieldName} invalide en mode limited: attendu 1-${maximum} mots, recu ${wordCount}`,
    );
  }
};

export class ArticleFinalLengthError extends ContentGenerationError {
  constructor(
    readonly actualWordCount: number,
    readonly minimumWordCount: number,
    readonly maximumWordCount: number,
  ) {
    super(
      "INVALID_PROVIDER_RESPONSE",
      `Longueur reelle de l Article final invalide: attendu ${minimumWordCount}-${maximumWordCount} mots, recu ${actualWordCount}`,
    );
  }
}

export class ArticleFinalParagraphCountError extends ContentGenerationError {
  constructor(
    readonly actualVisibleParagraphCount: number,
    readonly minimumVisibleParagraphCount: number,
    readonly maximumVisibleParagraphCount: number,
  ) {
    super(
      "INVALID_PROVIDER_RESPONSE",
      `Brève Article: ${minimumVisibleParagraphCount} à ${maximumVisibleParagraphCount} paragraphes visibles attendus au total, reçu ${actualVisibleParagraphCount}`,
    );
  }
}

const countWords = (value: string): number =>
  value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;

export const calculateArticleFinalWordCount = (result: ArticleFinalResult): number =>
  [
    result.lead,
    ...result.sections.flatMap((section) => section.paragraphs),
    result.conclusion,
  ].reduce((total, value) => total + countWords(value), 0);

const assertArticleFinalWordCountInRange = (
  wordCount: number,
  length: ArticleLengthId,
  generationMode: EditorialGenerationMode,
): void => {
  const range = articleWordCountRangeByLength[length];
  const minimum = generationMode === "limited" ? 1 : range.min;
  if (wordCount < minimum || wordCount > range.max) {
    throw new ArticleFinalLengthError(wordCount, minimum, range.max);
  }
};

const assertOrderedUniqueSections = (
  sections: Array<{ order: number; title?: string; heading?: string }>,
  minimum: number,
  fieldName: string,
  maximum?: number,
): void => {
  if (!Array.isArray(sections) || sections.length < minimum) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `${fieldName}: au moins ${minimum} sections sont requises`);
  }
  if (maximum !== undefined && sections.length > maximum) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `${fieldName}: ${maximum} sections maximum sont autorisees`);
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
  assertArticleEditorialReadiness(request);
};

export const validateArticleStructureSuggestions = (
  result: ArticleStructureSuggestionsResult,
  length: ArticleLengthId,
  generationMode: EditorialGenerationMode = "ready",
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
    validateArticleStructureSuggestion(structure, length, {
      validateEstimatedWordCount: true,
      generationMode,
    });
  }
};

export const validateArticleStructureSuggestion = (
  structure: ArticleStructureSuggestion,
  length: ArticleLengthId,
  options: {
    validateEstimatedWordCount?: boolean;
    generationMode?: EditorialGenerationMode;
  } = {},
): void => {
  const id = normalize(structure.id);
  if (!id || !normalize(structure.title) || !normalize(structure.editorialPromise)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure Article incomplete ou identifiant duplique");
  }
  assertNoGenericEditorialHeadings([
    { location: `structure ${id}, titre`, text: structure.title },
    ...structure.sections.map((section, index) => ({
      location: `structure ${id}, section ${index + 1}, intertitre`,
      text: section.title,
    })),
  ]);
  const generationMode = options.generationMode ?? "ready";
  const isBrief = length === "breve";
  const minimumSections = generationMode === "limited" || isBrief ? 1 : 3;
  const maximumSections = generationMode === "limited" || isBrief ? 2 : undefined;
  assertOrderedUniqueSections(structure.sections, minimumSections, `Structure Article ${id}`, maximumSections);
  if (options.validateEstimatedWordCount) {
    assertWordCountTarget(structure.estimatedWordCount, length, `Estimation de la structure ${id}`, generationMode);
  }
};

export const validateArticleFinalResult = (
  result: ArticleFinalResult,
  request: ArticleGenerationRequest,
  selectedStructure: ArticleStructureSuggestion,
): number => {
  const isBrief = request.brief.length === "breve";
  const generationMode = request.editorialGeneration?.generationMode ?? "ready";
  const requiresConclusion = !isBrief && generationMode !== "limited";
  if (!normalize(result.title) || !normalize(result.lead) || (requiresConclusion && !normalize(result.conclusion))) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article final incomplet: titre, chapeau et conclusion requis");
  }
  if (isBrief && result.subtitle !== undefined && result.subtitle !== null) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Brève Article: le sous-titre doit être null");
  }
  assertNoHeavySportsTitles(request, [{ location: "titre de l article", text: result.title }]);
  const normalizedTitle = normalizeComparable(result.title);
  if (result.subtitle && normalizeComparable(result.subtitle) === normalizedTitle) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      `Contenu identique au titre '${result.subtitle}' dans le sous-titre de l article`,
    );
  }
  if (normalizeComparable(result.lead) === normalizedTitle) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      `Contenu identique au titre '${result.lead}' dans le chapeau de l article`,
    );
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
  const finalTextCandidates = [
    { location: "titre de l article", text: result.title },
    { location: "sous-titre de l article", text: result.subtitle ?? "" },
    { location: "chapeau de l article", text: result.lead },
    ...result.sections.flatMap((section, index) => [
      { location: `section ${index + 1}, intertitre`, text: section.heading },
      ...section.paragraphs.map((paragraph, paragraphIndex) => ({
        location: `section ${index + 1} (${section.heading}), paragraphe ${paragraphIndex + 1}`,
        text: paragraph,
      })),
    ]),
    { location: "conclusion de l article", text: result.conclusion },
  ];
  assertSupportedEditorialThemes(request, finalTextCandidates);
  assertLimitedArticleQuality(request, finalTextCandidates);
  assertNoDocumentaryCommentary(request, finalTextCandidates);
  assertNoGenericEditorialHeadings([
    { location: "titre de l article", text: result.title },
    ...result.sections.map((section, index) => ({
      location: `section ${index + 1}, intertitre`,
      text: section.heading,
    })),
  ]);
  assertUniqueFinalParagraphs(
    [
      { location: "chapeau de l article", text: result.lead },
      ...result.sections.flatMap((section, sectionIndex) => section.paragraphs.map((paragraph, paragraphIndex) => ({
        location: `section ${sectionIndex + 1} (${section.heading}), paragraphe ${paragraphIndex + 1}`,
        text: paragraph,
      }))),
      ...(result.conclusion ? [{ location: "conclusion de l article", text: result.conclusion }] : []),
    ],
  );
  if (isBrief) {
    const visibleParagraphs = [
      { location: "chapeau de l article", text: result.lead },
      ...result.sections.flatMap((section, sectionIndex) => section.paragraphs.map((paragraph, paragraphIndex) => ({
        location: `section ${sectionIndex + 1} (${section.heading}), paragraphe ${paragraphIndex + 1}`,
        text: paragraph,
      }))),
      ...(normalize(result.conclusion) ? [{ location: "conclusion de l article", text: result.conclusion }] : []),
    ];
    const visibleParagraphCount = 1
      + result.sections.reduce((total, section) => total + section.paragraphs.length, 0)
      + (normalize(result.conclusion) ? 1 : 0);
    if (visibleParagraphCount < 2 || visibleParagraphCount > 3) {
      throw new ArticleFinalParagraphCountError(visibleParagraphCount, 2, 3);
    }
    assertNoRepeatedBriefSentences(visibleParagraphs);
    assertNoUnsupportedBriefLanguage(request, finalTextCandidates);
  }
  const actualWordCount = calculateArticleFinalWordCount(result);
  assertArticleFinalWordCountInRange(actualWordCount, request.brief.length, generationMode);

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
  assertNoFinalMetaLanguage(finalTextCandidates);
  assertSupportedTemporalQualifications(request, [
    { location: "titre de l article", text: result.title },
    { location: "sous-titre de l article", text: result.subtitle ?? "" },
    { location: "chapeau de l article", text: result.lead },
    { location: "conclusion de l article", text: result.conclusion },
    ...result.sections.flatMap((section, index) => section.paragraphs.map((paragraph, paragraphIndex) => ({ location: `section ${index + 1} (${section.heading}), paragraphe ${paragraphIndex + 1}`, text: paragraph }))),
  ]);
  return actualWordCount;
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
  assertArticleEditorialReadiness(request);
};

export const validateArticleAngleSuggestions = (parsedContent: unknown): PublicationAngleSuggestion[] => {
  if (!parsedContent || typeof parsedContent !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON des angles Article invalide");
  }
  const suggestions = (parsedContent as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions) || suggestions.length < 1 || suggestions.length > 3) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article: entre 1 et 3 angles sont requis");
  }

  const titles = new Set<string>();
  const validSuggestions: PublicationAngleSuggestion[] = [];
  for (const [index, suggestion] of suggestions.entries()) {
    try {
      if (!suggestion || typeof suggestion !== "object") {
        throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Suggestion d angle Article invalide");
      }
      const candidate = suggestion as { title?: unknown; rationale?: unknown };
      const title = normalize(candidate.title);
      const rationale = normalize(candidate.rationale);
      if (!title || !rationale || titles.has(title.toLowerCase())) {
        throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Suggestion d angle Article vide ou dupliquee");
      }
      assertNoGenericEditorialHeadings([{ location: `angle ${index + 1}, titre`, text: title }]);
      titles.add(title.toLowerCase());
      validSuggestions.push({ id: `article-angle-${index + 1}`, title, rationale });
    } catch (error) {
      if (!(error instanceof ContentGenerationError) || error.code !== "INVALID_PROVIDER_RESPONSE") {
        throw error;
      }
    }
  }
  if (validSuggestions.length === 0) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      "Aucun angle exploitable n'a été proposé. Le formulaire est conservé ; vous pouvez relancer manuellement.",
    );
  }
  return validSuggestions;
};

export const validateArticleAngleQualifications = (
  request: ArticleAngleSuggestionsRequest,
  suggestions: PublicationAngleSuggestion[],
): void => {
  assertNoHeavySportsTitles(request, suggestions.map((suggestion, index) => ({
    location: `angle ${index + 1}, titre`,
    text: suggestion.title,
  })));
  assertSupportedTemporalQualifications(request, suggestions.flatMap((suggestion, index) => [
    { location: `angle ${index + 1}, titre`, text: suggestion.title },
    { location: `angle ${index + 1}, promesse`, text: suggestion.rationale },
  ]));
  assertSupportedEditorialThemes(request, suggestions.flatMap((suggestion, index) => [
    { location: `angle ${index + 1}, titre`, text: suggestion.title },
    { location: `angle ${index + 1}, promesse`, text: suggestion.rationale },
  ]));
};

export const filterValidArticleAngleQualifications = (
  request: ArticleAngleSuggestionsRequest,
  suggestions: PublicationAngleSuggestion[],
): PublicationAngleSuggestion[] => {
  const validSuggestions = suggestions.filter((suggestion) => {
    try {
      validateArticleAngleQualifications(request, [suggestion]);
      return true;
    } catch (error) {
      if (error instanceof ContentGenerationError && error.code === "INVALID_PROVIDER_RESPONSE") {
        return false;
      }
      throw error;
    }
  });

  if (validSuggestions.length === 0) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      "Aucun angle n'a passé les contrôles éditoriaux. Le formulaire est conservé ; vous pouvez relancer manuellement.",
    );
  }
  return validSuggestions;
};

export const validateArticleStructureQualifications = (
  request: ArticleGenerationRequest,
  suggestions: ArticleStructureSuggestionsResult,
): void => {
  assertNoHeavySportsTitles(request, suggestions.suggestions.map((suggestion, index) => ({
    location: `structure ${index + 1}, titre`,
    text: suggestion.title,
  })));
  assertSupportedTemporalQualifications(request, suggestions.suggestions.flatMap((suggestion, suggestionIndex) => [
    { location: `structure ${suggestionIndex + 1}, titre`, text: suggestion.title },
    { location: `structure ${suggestionIndex + 1}, promesse`, text: suggestion.editorialPromise },
    ...suggestion.sections.flatMap((section, sectionIndex) => [
      { location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, titre`, text: section.title },
      { location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, objectif`, text: section.purpose },
      ...section.points.map((point, pointIndex) => ({ location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, point ${pointIndex + 1}`, text: point })),
    ]),
  ]));
  assertSupportedEditorialThemes(request, suggestions.suggestions.flatMap((suggestion, suggestionIndex) => [
    { location: `structure ${suggestionIndex + 1}, titre`, text: suggestion.title },
    { location: `structure ${suggestionIndex + 1}, promesse`, text: suggestion.editorialPromise },
    ...suggestion.sections.flatMap((section, sectionIndex) => [
      { location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, titre`, text: section.title },
      { location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, objectif`, text: section.purpose },
      ...section.points.map((point, pointIndex) => ({
        location: `structure ${suggestionIndex + 1}, section ${sectionIndex + 1}, point ${pointIndex + 1}`,
        text: point,
      })),
    ]),
  ]));
};