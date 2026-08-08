import {
  CREATION_MAX_QUESTION_COUNT,
  CREATION_MIN_QUESTION_COUNT,
  type CreationPreparationPayload,
} from "@/services/content-creation-assistant";
import { ContentGenerationError } from "@/services/content-generation/errors";
import type {
  PublicationLengthId,
  PublicationObjectiveId,
  PublicationPlatformId,
  ReelDurationId,
  ReelFormatId,
  ReelPlatformId,
} from "@/types/content-generation";
import type { ContextConnectorId, ContextDateRangePreset, ContextItem, ContextSearchDepth, ContextSourcePreference } from "@/types/context-intelligence";
import { isSafeHttpUrl } from "@/services/context-intelligence/utils";

const MAX_SUBJECT_NAME = 140;
const MAX_FREE_TEXT = 1600;
const MAX_TOPIC_LENGTH = 120;
const MAX_TOPICS = 12;

const normalize = (value: unknown): string => String(value ?? "").trim();

const sanitizeTopics = (items: string[]): string[] => {
  return items
    .map((item) => normalize(item))
    .filter(Boolean)
    .filter((item) => item.length <= MAX_TOPIC_LENGTH)
    .slice(0, MAX_TOPICS);
};

const sanitizeLanguage = (value: unknown): "fr" | "fr-CH" => {
  const normalized = normalize(value).toLowerCase();
  if (normalized === "fr") return "fr";
  if (normalized === "fr-ch") return "fr-CH";
  return "fr-CH";
};

const sanitizePublicationObjective = (value: unknown): PublicationObjectiveId => {
  const normalized = normalize(value);
  const allowed: PublicationObjectiveId[] = [
    "announce",
    "inform",
    "narrate",
    "highlight",
    "engage",
    "inspire",
    "promote",
    "congratulate",
    "thank",
    "introduce",
    "build_expectation",
    "free",
  ];
  return allowed.includes(normalized as PublicationObjectiveId) ? (normalized as PublicationObjectiveId) : "inform";
};

const sanitizePublicationPlatform = (value: unknown): PublicationPlatformId => {
  const normalized = normalize(value);
  const allowed: PublicationPlatformId[] = ["instagram", "facebook", "linkedin", "x", "threads", "site_blog", "newsletter", "other"];
  return allowed.includes(normalized as PublicationPlatformId) ? (normalized as PublicationPlatformId) : "instagram";
};

const sanitizePublicationLength = (value: unknown): PublicationLengthId => {
  const normalized = normalize(value);
  const allowed: PublicationLengthId[] = ["short", "medium", "long", "free"];
  return allowed.includes(normalized as PublicationLengthId) ? (normalized as PublicationLengthId) : "medium";
};

const sanitizeReelDuration = (value: unknown): ReelDurationId => {
  const normalized = normalize(value);
  const allowed: ReelDurationId[] = ["15s", "30s", "45s", "60s", "90s"];
  return allowed.includes(normalized as ReelDurationId) ? (normalized as ReelDurationId) : "30s";
};

const sanitizeReelFormat = (value: unknown): ReelFormatId => {
  const normalized = normalize(value);
  const allowed: ReelFormatId[] = ["face_camera", "voice_over", "dynamic_montage", "short_interview", "storytelling"];
  return allowed.includes(normalized as ReelFormatId) ? (normalized as ReelFormatId) : "face_camera";
};

const sanitizeReelPlatform = (value: unknown): ReelPlatformId => {
  const normalized = normalize(value);
  const allowed: ReelPlatformId[] = ["instagram", "tiktok", "youtube_shorts"];
  return allowed.includes(normalized as ReelPlatformId) ? (normalized as ReelPlatformId) : "instagram";
};

const sanitizeContextItems = (items: unknown): ContextItem[] => {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => item as ContextItem)
    .map((item) => ({
      ...item,
      id: normalize(item.id),
      title: normalize(item.title),
      summary: normalize(item.summary),
      factualStatement: normalize(item.factualStatement),
      sourceName: normalize(item.sourceName),
      sourceUrl: normalize(item.sourceUrl) || undefined,
      publishedAt: normalize(item.publishedAt) || undefined,
      editedSummary: normalize(item.editedSummary) || undefined,
      originalSummary: normalize(item.originalSummary) || undefined,
    }))
    .filter((item) => item.id && item.title && item.summary)
    .filter((item) => !item.sourceUrl || isSafeHttpUrl(item.sourceUrl));
};

export const validateCreationPayload = (value: unknown): CreationPreparationPayload => {
  if (!value || typeof value !== "object") {
    throw new ContentGenerationError("INVALID_REQUEST", "Requete invalide");
  }

  const payload = value as CreationPreparationPayload;

  if (!payload.subject || !payload.objective || !payload.parameters || !payload.templateId) {
    throw new ContentGenerationError("INVALID_REQUEST", "Requete invalide");
  }

  const displayName = normalize(payload.subject.displayName);
  if (!displayName || displayName.length > MAX_SUBJECT_NAME) {
    throw new ContentGenerationError("MISSING_SUBJECT", "Sujet manquant");
  }

  if (payload.subject.source === "crm" && !normalize(payload.subject.id)) {
    throw new ContentGenerationError("MISSING_SUBJECT", "Sujet CRM incomplet");
  }

  if (!normalize(payload.objective.id)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Objectif de contenu manquant");
  }

  if (!normalize(payload.parameters.toneId) || !normalize(payload.parameters.formatId) || !normalize(payload.parameters.audienceId)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Configuration incomplete");
  }

  const objectiveId = normalize(payload.objective.id);
  const isPublication = objectiveId === "publication";
  const isInterview = objectiveId === "interview";
  const isReel = objectiveId === "reel";

  if (isInterview && !normalize(payload.objective.subtypeId)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Type d interview manquant");
  }

  let questionCount = 3;
  if (isInterview) {
    if (!Number.isFinite(payload.parameters.questionCount)) {
      throw new ContentGenerationError("INVALID_REQUEST", "Nombre de questions invalide");
    }

    questionCount = Math.floor(payload.parameters.questionCount);
    if (questionCount < CREATION_MIN_QUESTION_COUNT || questionCount > CREATION_MAX_QUESTION_COUNT) {
      throw new ContentGenerationError(
        "INVALID_REQUEST",
        `Le nombre de questions doit etre compris entre ${CREATION_MIN_QUESTION_COUNT} et ${CREATION_MAX_QUESTION_COUNT}`
      );
    }
  }

  const additionalContext = normalize(payload.parameters.additionalContext);
  if (additionalContext.length > MAX_FREE_TEXT) {
    throw new ContentGenerationError("INVALID_REQUEST", "Contexte manuel trop long");
  }

  const requiredTopics = sanitizeTopics(payload.parameters.requiredTopics ?? []);
  const avoidedTopics = sanitizeTopics(payload.parameters.avoidedTopics ?? []);
  const selectedContextItems = sanitizeContextItems(payload.parameters.contextIntelligence?.selectedContextItems);

  const publication = payload.parameters.publication
    ? {
        objectiveId: sanitizePublicationObjective(payload.parameters.publication.objectiveId),
        customObjective: normalize(payload.parameters.publication.customObjective),
        selectedAngle: normalize(payload.parameters.publication.selectedAngle),
        platform: sanitizePublicationPlatform(payload.parameters.publication.platform),
        length: sanitizePublicationLength(payload.parameters.publication.length),
        cta: normalize(payload.parameters.publication.cta),
        hashtags: sanitizeTopics(payload.parameters.publication.hashtags ?? []),
        useEmojis: Boolean(payload.parameters.publication.useEmojis),
        specialInstructions: normalize(payload.parameters.publication.specialInstructions),
        includeElements: sanitizeTopics(payload.parameters.publication.includeElements ?? []),
        avoidElements: sanitizeTopics(payload.parameters.publication.avoidElements ?? []),
      }
    : undefined;

  if (isPublication && !publication) {
    throw new ContentGenerationError("INVALID_REQUEST", "Configuration publication manquante");
  }

  const reel = payload.parameters.reel
    ? {
        selectedAngle: normalize(payload.parameters.reel.selectedAngle),
        duration: sanitizeReelDuration(payload.parameters.reel.duration),
        format: sanitizeReelFormat(payload.parameters.reel.format),
        platform: sanitizeReelPlatform(payload.parameters.reel.platform),
      }
    : undefined;

  if (isReel) {
    if (!reel) {
      throw new ContentGenerationError("INVALID_REQUEST", "Configuration reel manquante");
    }
    if (!reel.selectedAngle) {
      throw new ContentGenerationError("INVALID_REQUEST", "Angle editorial reel manquant");
    }
  }

  return {
    ...payload,
    subject: {
      ...payload.subject,
      displayName,
      description: normalize(payload.subject.description),
      sport: normalize(payload.subject.sport),
      clubOrOrganization: normalize(payload.subject.clubOrOrganization),
      disciplineOrPosition: normalize(payload.subject.disciplineOrPosition),
      id: normalize(payload.subject.id) || undefined,
      type: normalize(payload.subject.type),
    },
    objective: {
      ...payload.objective,
      id: normalize(payload.objective.id) as CreationPreparationPayload["objective"]["id"],
      subtypeId: normalize(payload.objective.subtypeId),
    },
    parameters: {
      ...payload.parameters,
      language: sanitizeLanguage(payload.parameters.language),
      questionCount,
      toneId: normalize(payload.parameters.toneId),
      formatId: normalize(payload.parameters.formatId),
      audienceId: normalize(payload.parameters.audienceId),
      additionalContext,
      requiredTopics,
      avoidedTopics,
      contextIntelligence: {
        enabled: Boolean(payload.parameters.contextIntelligence?.enabled),
        selectedConnectorIds: Array.isArray(payload.parameters.contextIntelligence?.selectedConnectorIds)
          ? (payload.parameters.contextIntelligence.selectedConnectorIds
              .map((item) => normalize(item))
              .filter(Boolean) as ContextConnectorId[])
          : [],
        dateRange: {
          preset: (normalize(payload.parameters.contextIntelligence?.dateRange?.preset) || "last_30_days") as ContextDateRangePreset,
          from: normalize(payload.parameters.contextIntelligence?.dateRange?.from),
          to: normalize(payload.parameters.contextIntelligence?.dateRange?.to),
        },
        sourcePreference: (normalize(payload.parameters.contextIntelligence?.sourcePreference) || "official_and_reliable") as ContextSourcePreference,
        searchDepth: (normalize(payload.parameters.contextIntelligence?.searchDepth) || "standard") as ContextSearchDepth,
        selectedContextItems,
        researchedAt: normalize(payload.parameters.contextIntelligence?.researchedAt) || undefined,
      },
      publication,
      reel,
    },
  };
};
