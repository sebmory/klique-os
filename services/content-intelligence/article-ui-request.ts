import { ContentGenerationError } from "@/services/content-generation/errors";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleGenerationRequest,
  ContentContext,
} from "@/types/content-generation";

const buildContext = (payload: CreationPreparationPayload): ContentContext => ({
  subjectId: payload.subject.id,
  source: payload.subject.source,
  subjectType: payload.subject.type,
  displayName: payload.subject.displayName,
  sport: payload.subject.sport,
  disciplineOrPosition: payload.subject.disciplineOrPosition,
  clubOrOrganization: payload.subject.clubOrOrganization,
  biography: payload.subject.description,
  knownFacts: [],
  objective: "article",
  audience: payload.parameters.audienceId,
  templateKey: "article:v1",
  contentType: "article",
  format: payload.parameters.formatId,
  tone: payload.parameters.toneId,
  internalFacts: [],
  externalVerifiedFacts: [],
  userProvidedContextItems: [],
  editorialLeads: [],
  excludedContext: [],
  constraints: {
    requiredTopics: payload.parameters.requiredTopics,
    avoidedTopics: payload.parameters.avoidedTopics,
    questionCount: 0,
  },
});

const buildBase = (payload: CreationPreparationPayload) => {
  if (payload.objective.id !== "article" || !payload.parameters.article) {
    throw new ContentGenerationError("INVALID_REQUEST", "Configuration Article manquante.");
  }

  return {
    requestType: "article" as const,
    language: payload.parameters.language,
    template: {
      key: "article:v1" as const,
      family: "article" as const,
      name: "Article",
      version: "v1",
    },
    context: buildContext(payload),
    selectedContextItems: [],
    contextSelection: {
      collectionId: payload.parameters.contextIntelligence.collectionId,
      selectedItemIds: payload.parameters.contextIntelligence.selectedItemIds,
      manualEdits: payload.parameters.contextIntelligence.manualEdits,
      researchedAt: payload.parameters.contextIntelligence.researchedAt,
      dateRange: payload.parameters.contextIntelligence.dateRange,
    },
    rulesVersion: "editorial-rules-v1",
    externalContext: null,
    brief: {
      objective: "article" as const,
      articleType: payload.parameters.article.articleType,
      length: payload.parameters.article.length,
      tone: payload.parameters.toneId,
      audience: payload.parameters.audienceId,
      additionalContext: payload.parameters.additionalContext,
      requiredTopics: payload.parameters.requiredTopics,
      externalVerifiedSources: [],
      providedCitations: [],
    },
  };
};

export const buildArticleAngleSuggestionsRequest = (
  payload: CreationPreparationPayload,
): ArticleAngleSuggestionsRequest => buildBase(payload);

export const buildArticleGenerationRequest = (
  payload: CreationPreparationPayload,
  selectedAngle: string,
): ArticleGenerationRequest => {
  const base = buildBase(payload);
  return {
    ...base,
    brief: {
      ...base.brief,
      selectedAngle: selectedAngle.trim(),
    },
  };
};
