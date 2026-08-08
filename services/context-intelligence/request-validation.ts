import type {
  ContextCollectionRequest,
  ContextConnectorId,
  ContextDateRange,
  ContextSearchDepth,
  ContextSourcePreference,
} from "@/types/context-intelligence";
import { ContextCollectionError } from "@/services/context-intelligence/errors";
import { buildDateRange, normalize } from "@/services/context-intelligence/utils";

const allowedConnectors: ContextConnectorId[] = [
  "crm",
  "productions",
  "manual",
  "external_news",
  "calendar",
  "results",
  "official_website",
  "rss",
  "social",
  "documents",
  "previous_content",
];

const parseDateRange = (value: unknown): ContextDateRange => {
  if (!value || typeof value !== "object") {
    return buildDateRange("last_30_days");
  }

  const obj = value as { preset?: string; from?: string; to?: string };
  const preset = normalize(obj.preset) as ContextDateRange["preset"];
  if (!preset) return buildDateRange("last_30_days");

  if (preset === "custom") {
    return buildDateRange("custom", obj.from, obj.to);
  }

  if (preset === "last_7_days" || preset === "last_30_days" || preset === "last_90_days" || preset === "last_12_months") {
    return buildDateRange(preset);
  }

  return buildDateRange("last_30_days");
};

export const validateContextCollectionRequest = (value: unknown): ContextCollectionRequest => {
  if (!value || typeof value !== "object") {
    throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Requete de collecte invalide.");
  }

  const payload = value as Record<string, unknown>;
  const subject = payload.subject as Record<string, unknown> | undefined;
  if (!subject) {
    throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Sujet manquant.");
  }

  const displayName = normalize(subject.displayName);
  if (!displayName) {
    throw new ContextCollectionError("INVALID_CONTEXT_REQUEST", "Nom du sujet manquant.");
  }

  const selectedConnectorIds = Array.isArray(payload.selectedConnectorIds)
    ? (payload.selectedConnectorIds
      .map((item) => normalize(item))
      .filter((item): item is ContextConnectorId => allowedConnectors.includes(item as ContextConnectorId)))
    : [];

  const sourcePreferenceRaw = normalize(payload.sourcePreference);
  const sourcePreference: ContextSourcePreference =
    sourcePreferenceRaw === "official_only" || sourcePreferenceRaw === "broad"
      ? (sourcePreferenceRaw as ContextSourcePreference)
      : "official_and_reliable";

  const searchDepthRaw = normalize(payload.searchDepth);
  const searchDepth: ContextSearchDepth =
    searchDepthRaw === "quick" || searchDepthRaw === "deep"
      ? (searchDepthRaw as ContextSearchDepth)
      : "standard";

  const languageRaw = normalize(payload.language).toLowerCase();
  const language = languageRaw === "fr" ? "fr" : "fr-CH";

  return {
    workspaceId: normalize(payload.workspaceId) || undefined,
    subject: {
      id: normalize(subject.id) || normalize(subject.subjectId) || undefined,
      source: normalize(subject.source) === "crm" ? "crm" : "temporary",
      type: normalize(subject.type) || normalize(subject.subjectType) || "other",
      displayName,
      sport: normalize(subject.sport) || undefined,
      clubOrOrganization: normalize(subject.clubOrOrganization) || normalize(subject.organization) || undefined,
      disciplineOrPosition: normalize(subject.disciplineOrPosition) || undefined,
      photoUrl: normalize(subject.photoUrl) || undefined,
      workspaceId: normalize(subject.workspaceId) || normalize(payload.workspaceId) || undefined,
      description: normalize(subject.description) || undefined,
    },
    selectedConnectorIds,
    dateRange: parseDateRange(payload.dateRange),
    sourcePreference,
    searchDepth,
    language,
    manualContext: normalize(payload.manualContext) || undefined,
    contentType: normalize(payload.contentType) || "interview",
    interviewType: normalize(payload.interviewType) || undefined,
  };
};
