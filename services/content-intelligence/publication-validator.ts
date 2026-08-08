import { ContentGenerationError } from "@/services/content-generation/errors";
import type { PublicationGenerationResultRaw } from "@/services/content-intelligence/publication-schema";
import type {
  PublicationAngleSuggestion,
  PublicationBrief,
  PublicationGenerationResult,
  PublicationProposal,
  PublicationRegenerateOneResult,
} from "@/types/content-generation";
import type { ContextDateRange, ContextItem } from "@/types/context-intelligence";

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeLower = (value: unknown): string => normalize(value).toLowerCase();

const expectedTreatmentTags = ["editorial_factuel", "storytelling_humain", "social_impact"] as const;

const bannedGenericPhrases = [
  "une histoire a ecrire",
  "bien plus qu un",
  "passion et determination",
  "repousser ses limites",
  "pret pour la suite",
];

const lengthRanges: Record<Exclude<PublicationBrief["length"], "free">, { minWords: number; maxWords: number }> = {
  short: { minWords: 30, maxWords: 70 },
  medium: { minWords: 80, maxWords: 150 },
  long: { minWords: 180, maxWords: 300 },
};

const wordPattern = /\b[\w'-]+\b/g;

const countWords = (value: string): number => {
  const matches = value.match(wordPattern);
  return matches ? matches.length : 0;
};

const splitSentences = (value: string): string[] => {
  return value
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const normalizeForSimilarity = (value: string): string[] => {
  return normalizeLower(value)
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
};

const jaccardSimilarity = (a: string[], b: string[]): number => {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (!aSet.size && !bSet.size) return 1;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }

  const union = new Set([...aSet, ...bSet]).size;
  return union ? intersection / union : 0;
};

const countQuestionMarks = (value: string): number => {
  return (value.match(/\?/g) ?? []).length;
};

const detectVeryShortSentenceBurst = (value: string): boolean => {
  const sentences = splitSentences(value);
  if (sentences.length < 4) return false;
  const shortSentences = sentences.filter((sentence) => countWords(sentence) <= 6).length;
  return shortSentences >= 3;
};

const splitParagraphs = (value: string): string[] => {
  return value
    .split(/\n{2,}|\r\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
};

const hasListOrBulletMarkers = (value: string): boolean => {
  return /(^|\n)\s*(?:[-*]|\d+[.)])\s+/m.test(value);
};

const hasEmoji = (value: string): boolean => {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value);
};

const hasNarrativeProgressionMarker = (value: string): boolean => {
  const text = normalizeLower(value);
  const sentences = splitSentences(text);

  if (sentences.length < 2) return false;

  const hasPastSignal = /\b(avant|hier|au depart|jusque-la|par le passe|saison precedente|dernier|premier|deja)\b/.test(text);
  const hasPresentSignal = /\b(aujourd hui|maintenant|desormais|actuellement|ce jour)\b/.test(text);
  const hasFutureSignal = /\b(demain|prochain|a venir|objectif|cap|viser|viseront|visera|preparer|suite)\b/.test(text);

  const hasChangeSignal = /\b(progres|evolution|franchi|passe de|devenu|revient|retour|transforme|confirme|relance)\b/.test(text);
  const hasResultSignal = /\b(victoire|succes|resultat|bilan|record|performance|qualification|classement)\b/.test(text);
  const hasGoalSignal = /\b(objectif|cap|prochaine etape|prochain rendez-vous|viser|consolider|confirmer)\b/.test(text);

  const hasTemporalProgression = (hasPastSignal && (hasPresentSignal || hasFutureSignal)) || (hasPresentSignal && hasFutureSignal);
  const hasSituationToEvolution = hasChangeSignal && (hasPastSignal || hasPresentSignal || hasFutureSignal);
  const hasResultToGoal = hasResultSignal && hasGoalSignal;

  return hasTemporalProgression || hasSituationToEvolution || hasResultToGoal;
};

const extractContextKeywordPool = (items: ContextItem[]): Set<string> => {
  const pool = new Set<string>();
  for (const item of items) {
    if (!item.isSelected) continue;
    const raw = [item.title, item.factualStatement, item.summary].join(" ");
    for (const token of normalizeForSimilarity(raw)) {
      if (token.length >= 5) pool.add(token);
    }
  }
  return pool;
};

const countContextKeywordMatches = (text: string, contextPool: Set<string>): number => {
  if (!contextPool.size) return 0;
  const textTokens = new Set(normalizeForSimilarity(text));
  let matches = 0;
  for (const token of textTokens) {
    if (contextPool.has(token)) matches += 1;
  }
  return matches;
};

const collectLengthWarningOrThrow = (
  text: string,
  brief: Pick<PublicationBrief, "length" | "specialInstructions"> | undefined,
  warnings: string[]
): void => {
  if (!brief || brief.length === "free") return;

  const range = lengthRanges[brief.length];
  const words = countWords(text);
  if (words >= range.minWords && words <= range.maxWords) return;

  const tooShort = words < range.minWords;
  const severeLow = Math.floor(range.minWords * 0.6);
  const severeHigh = Math.ceil(range.maxWords * 1.5);
  if (words < severeLow || words > severeHigh) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      `Longueur invalide pour ${brief.length}: attendu ${range.minWords}-${range.maxWords} mots, recu ${words}`
    );
  }

  warnings.push(
    tooShort
      ? `Longueur legerement courte pour ${brief.length}: ${words} mots (cible ${range.minWords}-${range.maxWords}).`
      : `Longueur legerement longue pour ${brief.length}: ${words} mots (cible ${range.minWords}-${range.maxWords}).`
  );
};

const collectTreatmentTagWarning = (proposal: PublicationProposal, expectedTag: string, warnings: string[]): void => {
  const expectedPrefix = `[traitement: ${expectedTag}]`;
  if (!normalizeLower(proposal.editorialNote).startsWith(expectedPrefix)) {
    warnings.push(`Traitement storytelling insuffisamment marque (tag attendu: ${expectedPrefix}).`);
  }
};

const collectNonGenericQualityWarnings = (proposal: PublicationProposal, contextPool: Set<string>, warnings: string[]): void => {
  const textLower = normalizeLower(proposal.text);
  const fullLower = `${normalizeLower(proposal.hook)} ${textLower}`;

  if (bannedGenericPhrases.some((phrase) => fullLower.includes(phrase))) {
    warnings.push("Formulations generiques detectees.");
  }

  if (/(?:\bdans cette interview\b|\bau micro\b|\bentretien\b|\binterview\b)/.test(fullLower)) {
    warnings.push("La publication ressemble a une preparation d interview.");
  }

  if (countQuestionMarks(proposal.text) >= 2) {
    warnings.push("Questions rhetoriques excessives detectees.");
  }

  if (detectVeryShortSentenceBurst(proposal.text)) {
    warnings.push("Rythme artificiel detecte: trop de phrases tres courtes.");
  }

  const tokens = normalizeForSimilarity(proposal.text);
  const uniqueRatio = tokens.length ? new Set(tokens).size / tokens.length : 0;
  if (tokens.length >= 60 && uniqueRatio < 0.42) {
    warnings.push("Texte repetitif ou insuffisamment informatif.");
  }

  const contextMatches = countContextKeywordMatches(proposal.text, contextPool);
  if (contextPool.size >= 6 && tokens.length >= 40 && contextMatches < 2) {
    warnings.push("Les faits de contexte sont peu exploites dans cette proposition.");
  }
};

const hasManifestDuplicateProposals = (proposals: PublicationProposal[]): boolean => {
  const seen = new Set<string>();
  for (const proposal of proposals) {
    const textFingerprint = normalizeForSimilarity(proposal.text).join(" ");
    if (textFingerprint && seen.has(textFingerprint)) return true;
    if (textFingerprint) seen.add(textFingerprint);
  }
  return false;
};

const collectDistinctTreatmentsWarnings = (proposals: PublicationProposal[], warnings: string[]): void => {
  for (let i = 0; i < proposals.length; i += 1) {
    const a = proposals[i];
    const aTokens = normalizeForSimilarity(`${a.hook} ${a.text}`);
    const aOpening = normalizeForSimilarity(a.text).slice(0, 12).join(" ");

    for (let j = i + 1; j < proposals.length; j += 1) {
      const b = proposals[j];
      const bTokens = normalizeForSimilarity(`${b.hook} ${b.text}`);
      const bOpening = normalizeForSimilarity(b.text).slice(0, 12).join(" ");

      const similarity = jaccardSimilarity(aTokens, bTokens);
      if (similarity > 0.72) {
        warnings.push("Differenciation stylistique partielle: propositions editorialement proches.");
      }

      if (aOpening && aOpening === bOpening) {
        warnings.push("Differenciation stylistique partielle: plusieurs propositions partagent une ouverture similaire.");
      }
    }
  }
};

const collectTreatmentStructureWarnings = (
  proposal: PublicationProposal,
  expectedTag: (typeof expectedTreatmentTags)[number],
  brief: Pick<PublicationBrief, "platform" | "tone" | "useEmojis"> | undefined,
  warnings: string[]
): void => {
  const text = proposal.text;
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const firstSentenceWords = countWords(sentences[0] ?? "");
  const hasListMarkers = hasListOrBulletMarkers(text);
  const hasAnyEmoji = hasEmoji(text);

  if (expectedTag === "editorial_factuel") {
    if (sentences.length < 3) {
      warnings.push("Traitement editorial/factuel insuffisamment marque.");
    }
    if (firstSentenceWords > 20) {
      warnings.push("Accroche factuelle peu informative ou trop longue.");
    }
    if (hasListMarkers) {
      warnings.push("Traitement editorial/factuel proche d un format social en liste.");
    }
  }

  if (expectedTag === "storytelling_humain") {
    if (sentences.length < 3) {
      warnings.push("Traitement storytelling insuffisamment marque.");
    }
    if (!hasNarrativeProgressionMarker(text)) {
      warnings.push("Progression narrative non detectee.");
    }
  }

  if (expectedTag === "social_impact") {
    if (paragraphs.length < 2) {
      warnings.push("Structure social/impact insuffisante: blocs trop peu scindes.");
    }

    const paragraphWordCounts = paragraphs.map((paragraph) => countWords(paragraph));
    const longParagraphs = paragraphWordCounts.filter((count) => count > 65).length;
    if (longParagraphs > 0) {
      warnings.push("Rythme mobile imparfait: blocs trop longs.");
    }

    const sentenceWordCounts = sentences.map((sentence) => countWords(sentence));
    const tooLongSentences = sentenceWordCounts.filter((count) => count > 38).length;
    if (tooLongSentences > 0) {
      warnings.push("Rythme mobile imparfait: phrases trop longues.");
    }

    const avgParagraphWords = paragraphWordCounts.length
      ? paragraphWordCounts.reduce((sum, count) => sum + count, 0) / paragraphWordCounts.length
      : 0;
    if (avgParagraphWords > 36) {
      warnings.push("Lisibilite mobile imparfaite: blocs trop denses.");
    }

    const platform = brief?.platform;
    if (platform === "instagram" && paragraphs.length < 3) {
      warnings.push("Instagram: structure pas assez scindee pour mobile.");
    }

    if (platform === "instagram" && paragraphWordCounts.some((count) => count > 45)) {
      warnings.push("Instagram: paragraphes trop denses (effet article).");
    }

    if (!brief?.useEmojis && hasAnyEmoji) {
      warnings.push("Emojis utilises alors que l option n est pas activee.");
    }
  }
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalize(item)).filter(Boolean);
};

const normalizeProposal = (value: unknown, index: number): { proposal: PublicationProposal | null; warnings: string[] } => {
  const warnings: string[] = [];
  if (!value || typeof value !== "object") return { proposal: null, warnings: [] };
  const obj = value as Record<string, unknown>;

  const hook = normalize(obj.hook);
  const text = normalize(obj.text);
  const hasCta = Object.prototype.hasOwnProperty.call(obj, "cta");
  const hasHashtags = Object.prototype.hasOwnProperty.call(obj, "hashtags");
  const cta = hasCta ? normalize(obj.cta) : "";
  const hashtags = hasHashtags ? toStringArray(obj.hashtags) : [];
  const visualSuggestion = normalize(obj.visualSuggestion);
  const editorialNote = normalize(obj.editorialNote);

  if (!hook || !text || !visualSuggestion || !editorialNote) {
    return { proposal: null, warnings: [] };
  }

  if (!hasCta) {
    warnings.push(`Proposition ${index + 1}: champ cta absent, valeur vide appliquee.`);
  }
  if (!hasHashtags) {
    warnings.push(`Proposition ${index + 1}: champ hashtags absent, tableau vide applique.`);
  }

  return {
    proposal: {
      id: `proposal-${index + 1}`,
      hook,
      text,
      cta,
      hashtags,
      visualSuggestion,
      editorialNote,
    },
    warnings,
  };
};

const hasDuplicateProposals = (proposals: PublicationProposal[]): boolean => {
  const seen = new Set<string>();
  for (const proposal of proposals) {
    const fingerprint = `${normalize(proposal.hook).toLowerCase()}|${normalize(proposal.text).toLowerCase()}`;
    if (seen.has(fingerprint)) return true;
    seen.add(fingerprint);
  }
  return false;
};

const parseProviderJson = (raw: string): unknown => {
  const text = raw.trim();
  if (!text) {
    throw new ContentGenerationError("EMPTY_PROVIDER_RESPONSE", "Sortie texte vide du fournisseur");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Reponse structuree impossible a parser");
  }
};

export const validatePublicationGenerationJson = (args: {
  rawContent?: string;
  parsedContent?: unknown;
  requestStartedAt: number;
  provider: string;
  model: string;
  templateKey: "publication:v1";
  templateVersion: "v1";
  promptVersion: string;
  brief?: Pick<PublicationBrief, "length" | "specialInstructions" | "platform" | "tone" | "useEmojis">;
  selectedContextItems?: ContextItem[];
  contextResearchedAt?: string;
  contextDateRange?: ContextDateRange;
}): PublicationGenerationResult => {
  const parsed = args.parsedContent ?? parseProviderJson(args.rawContent ?? "");
  if (!parsed || typeof parsed !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON invalide");
  }

  const obj = parsed as Record<string, unknown>;
  const title = normalize(obj.title);
  const selectedAngle = normalize(obj.selectedAngle);
  const rawProposals = Array.isArray(obj.proposals) ? obj.proposals : null;
  if (!rawProposals || rawProposals.length === 0) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Tableau proposals absent ou vide");
  }

  const qualityWarnings: string[] = [];
  const normalizedTop3 = rawProposals.slice(0, 3).map((item, index) => normalizeProposal(item, index));
  normalizedTop3.forEach((entry) => qualityWarnings.push(...entry.warnings));
  const proposals = normalizedTop3
    .map((entry) => entry.proposal)
    .filter((item): item is PublicationProposal => item !== null);

  if (!title || !selectedAngle) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Champs publication essentiels vides");
  }

  if (rawProposals.length < 3 || proposals.length < 3) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Nombre de propositions invalide: attendu au moins 3, recu ${proposals.length}`);
  }

  if (rawProposals.length > 3) {
    qualityWarnings.push(`Le provider a renvoye ${rawProposals.length} propositions; seules les 3 premieres ont ete retenues.`);
  }

  if (hasDuplicateProposals(proposals) || hasManifestDuplicateProposals(proposals)) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Contenu manifestement duplique detecte dans les propositions");
  }

  const selectedContextItems = args.selectedContextItems ?? [];
  const contextPool = extractContextKeywordPool(selectedContextItems);

  proposals.forEach((proposal, index) => {
    const expectedTag = expectedTreatmentTags[index];
    collectTreatmentTagWarning(proposal, expectedTag, qualityWarnings);
    collectLengthWarningOrThrow(proposal.text, args.brief, qualityWarnings);
    collectTreatmentStructureWarnings(proposal, expectedTag, args.brief, qualityWarnings);
    collectNonGenericQualityWarnings(proposal, contextPool, qualityWarnings);
  });

  collectDistinctTreatmentsWarnings(proposals, qualityWarnings);

  const metadata = obj.metadata as PublicationGenerationResultRaw["metadata"] | undefined;
  if (!metadata || metadata.templateId !== "publication" || metadata.templateVersion !== "v1") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Metadata template incoherentes");
  }

  const usedSourceIds = Array.from(
    new Set(
      selectedContextItems
        .map((item) => `${normalize(item.sourceName)}|${normalize(item.sourceUrl)}`)
        .filter((item) => item !== "|")
    )
  );

  const selectedFactsCount = selectedContextItems.filter(
    (item) => item.isSelected && Boolean(normalize(item.factualStatement) || normalize(item.summary) || normalize(item.title))
  ).length;

  const missingInformation = selectedFactsCount < 2
    ? [
        "Contexte factuel limite: personnalisation editoriale potentiellement reduite. Le texte est reste strictement fonde sur les faits connus.",
      ]
    : [];

  return {
    title,
    selectedAngle,
    proposals,
    qualityWarnings,
    contextUsage: {
      usedContextItemIds: selectedContextItems.filter((item) => item.isSelected).map((item) => item.id),
      usedSourceIds,
      unusedSelectedContextItemIds: [],
      researchedAt: args.contextResearchedAt,
      dateRange: args.contextDateRange,
      externalContextUsed: selectedContextItems.some((item) => item.connectorId === "external_news" && item.isSelected),
      selectedItems: selectedContextItems.filter((item) => item.isSelected),
    },
    metadata: {
      provider: args.provider,
      model: args.model,
      templateId: "publication",
      templateKey: args.templateKey,
      templateVersion: args.templateVersion,
      promptVersion: args.promptVersion,
      generatedAt: new Date().toISOString(),
      generationDurationMs: Date.now() - args.requestStartedAt,
      questionCountRequested: 0,
      questionCountGenerated: 0,
      reliabilityNotes: [
        "Utiliser uniquement les faits fournis.",
        "Ne pas presenter une supposition comme un fait.",
      ],
      missingInformation,
      externalContextUsed: selectedContextItems.some((item) => item.connectorId === "external_news" && item.isSelected),
    },
  };
};

export const validatePublicationAnglesJson = (rawContent: string): PublicationAngleSuggestion[] => {
  const parsed = parseProviderJson(rawContent);
  if (!parsed || typeof parsed !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON invalide");
  }

  const obj = parsed as Record<string, unknown>;
  const suggestions = (Array.isArray(obj.suggestions) ? obj.suggestions : [])
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      const title = normalize(candidate.title);
      const rationale = normalize(candidate.rationale);
      if (!title || !rationale) return null;
      return { id: `angle-${index + 1}`, title, rationale };
    })
    .filter((item): item is PublicationAngleSuggestion => item !== null);

  if (suggestions.length < 3 || suggestions.length > 5) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Le moteur doit renvoyer entre 3 et 5 angles");
  }

  return suggestions;
};

export const validatePublicationSingleProposalJson = (args: {
  rawContent: string;
  brief?: Pick<PublicationBrief, "length" | "specialInstructions" | "platform" | "tone" | "useEmojis">;
  selectedContextItems?: ContextItem[];
  expectedTreatmentTag?: (typeof expectedTreatmentTags)[number];
}): PublicationRegenerateOneResult => {
  const parsed = parseProviderJson(args.rawContent);
  if (!parsed || typeof parsed !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON invalide");
  }

  const obj = parsed as Record<string, unknown>;
  const normalizedProposal = normalizeProposal(obj.proposal, 0);
  const proposal = normalizedProposal.proposal;
  if (!proposal) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Proposition de publication invalide");
  }

  const qualityWarnings: string[] = [...normalizedProposal.warnings];
  const contextPool = extractContextKeywordPool(args.selectedContextItems ?? []);
  if (args.expectedTreatmentTag) {
    collectTreatmentTagWarning(proposal, args.expectedTreatmentTag, qualityWarnings);
    collectTreatmentStructureWarnings(proposal, args.expectedTreatmentTag, args.brief, qualityWarnings);
  }
  collectLengthWarningOrThrow(proposal.text, args.brief, qualityWarnings);
  collectNonGenericQualityWarnings(proposal, contextPool, qualityWarnings);

  return { proposal: { ...proposal, id: "regenerated-proposal" } };
};
