import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ContextCollectionRequest,
  ContextConfidence,
  ContextItemCategory,
  ContextSearchDepth,
  ContextSourceType,
  ContextStatementType,
  ContextVerificationStatus,
  ExternalNewsSearchItem,
  ExternalNewsSearchResult,
  WebResearchCitation,
  WebResearchResult,
  WebResearchSource,
} from "@/types/context-intelligence";
import { contextIntelligenceConfig } from "@/services/context-intelligence/config";
import { ContextCollectionError } from "@/services/context-intelligence/errors";
import { isSafeHttpUrl, normalize, normalizePublishedAt } from "@/services/context-intelligence/utils";

type OpenAIResponseShape = {
  id?: string;
  output_text?: string;
  output?: unknown[];
  incomplete_details?: unknown | null;
};

type OpenAIErrorLike = {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
};

type NormalizedItem = {
  title: string;
  summary: string;
  factualStatement: string;
  category: ContextItemCategory;
  statementType: ContextStatementType;
  sourceName: string;
  sourceType: ExternalNewsSearchItem["sourceType"];
  sourceUrl: string;
  publishedAt?: string | null;
};

type NormalizationPayload = {
  items: NormalizedItem[];
};

type ExternalSearchDiagnostics = {
  webSearchCallCount: number;
  messageCount: number;
  citationCount: number;
  sourceCount: number;
  outputTextLength: number;
  normalizationWasCalled: boolean;
  normalizationOutputLength: number;
  normalizationOutputItemCount: number;
  normalizationMessageCount: number;
  normalizationOutputTextBlockCount: number;
  normalizationUsedAggregatedOutputText: boolean;
  normalizationUsedOutputFallback: boolean;
  normalizationParsed: boolean;
  normalizedItemCount: number;
  validationErrors: string[];
  rejectedItemCount: number;
  rejectionReasons: string[];
};

const createDiagnostics = (): ExternalSearchDiagnostics => ({
  webSearchCallCount: 0,
  messageCount: 0,
  citationCount: 0,
  sourceCount: 0,
  outputTextLength: 0,
  normalizationWasCalled: false,
  normalizationOutputLength: 0,
  normalizationOutputItemCount: 0,
  normalizationMessageCount: 0,
  normalizationOutputTextBlockCount: 0,
  normalizationUsedAggregatedOutputText: false,
  normalizationUsedOutputFallback: false,
  normalizationParsed: false,
  normalizedItemCount: 0,
  validationErrors: [],
  rejectedItemCount: 0,
  rejectionReasons: [],
});

export interface ExternalContextProvider {
  isAvailable(): Promise<boolean>;
  search(request: ContextCollectionRequest, signal?: AbortSignal): Promise<ExternalNewsSearchResult>;
}

const normalizationResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "summary",
          "factualStatement",
          "category",
          "statementType",
          "sourceName",
          "sourceType",
          "sourceUrl",
          "publishedAt",
        ],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          factualStatement: { type: "string" },
          category: {
            type: "string",
            enum: ["recent_news", "result", "performance", "schedule", "transfer_or_contract", "injury_or_return", "selection", "event", "other"],
          },
          statementType: { type: "string", enum: ["fact", "editorial_lead"] },
          sourceName: { type: "string" },
          sourceType: { type: "string", enum: ["official", "media", "external"] },
          sourceUrl: { type: "string" },
          publishedAt: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const nowIso = (): string => new Date().toISOString();

const NORMALIZATION_DEBUG_FILE_RELATIVE_PATH = "tests/debug/normalizationResponse.raw.json";

const shouldCaptureNormalizationResponse = (): boolean => {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.NODE_ENV === "test") return true;

  return process.env.NODE_ENV === "development" && process.env.DEBUG_EXTERNAL_NORMALIZATION_RESPONSE === "true";
};

const writeNormalizationResponseDebugFile = async (normalizationResponse: unknown): Promise<void> => {
  if (!shouldCaptureNormalizationResponse()) return;

  const debugFilePath = path.resolve(process.cwd(), NORMALIZATION_DEBUG_FILE_RELATIVE_PATH);
  const debugDir = path.dirname(debugFilePath);

  await mkdir(debugDir, { recursive: true });
  await writeFile(debugFilePath, JSON.stringify(normalizationResponse, null, 2), "utf-8");
  console.info("[external_news] Raw normalization response captured: tests/debug/normalizationResponse.raw.json");
};

const getWebSearchModel = (): string => contextIntelligenceConfig.externalNews.defaultModel;

// Chaque phase dispose de son propre budget : l expiration annule l appel OpenAI au lieu de le laisser tourner.
const runPhaseWithBudget = async <T>(
  phase: "web_search" | "normalization",
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (timedOut) {
      throw new ContextCollectionError(
        "CONTEXT_TIMEOUT",
        phase === "web_search"
          ? "La recherche Web a depasse le delai autorise."
          : "La normalisation de la reponse externe a depasse le delai autorise."
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
};

const getDepthConfig = (depth: ContextSearchDepth) => contextIntelligenceConfig.externalNews.depth[depth];

const toSafeUrl = (value: string): string | null => {
  const candidate = normalize(value);
  if (!isSafeHttpUrl(candidate)) return null;
  return candidate;
};

const normalizeCategory = (value: unknown): ContextItemCategory => {
  const category = normalize(value);
  if (
    category === "recent_news" ||
    category === "result" ||
    category === "performance" ||
    category === "schedule" ||
    category === "transfer_or_contract" ||
    category === "injury_or_return" ||
    category === "selection" ||
    category === "event" ||
    category === "other"
  ) {
    return category;
  }

  return "recent_news";
};

const normalizeSourceType = (value: unknown): ExternalNewsSearchItem["sourceType"] => {
  const sourceType = normalize(value).toLowerCase();
  if (sourceType === "official" || sourceType === "media" || sourceType === "external") return sourceType;
  return "external";
};

const normalizeStatementType = (value: unknown): ContextStatementType => {
  return normalize(value) === "editorial_lead" ? "editorial_lead" : "fact";
};

const normalizeConfidence = (sourceType: ExternalNewsSearchItem["sourceType"]): ContextConfidence => {
  if (sourceType === "official") return "high";
  if (sourceType === "media") return "medium";
  return "low";
};

const normalizeVerificationStatus = (sourceType: ExternalNewsSearchItem["sourceType"]): ExternalNewsSearchItem["verificationStatus"] => {
  if (sourceType === "official") return "verified";
  if (sourceType === "media") return "reported";
  return "unverified";
};

const isUrlCitation = (
  value: unknown
): value is { type: "url_citation"; url?: string; title?: string; start_index?: number; end_index?: number } => {
  if (!value || typeof value !== "object") return false;
  const item = value as { type?: string };
  return item.type === "url_citation";
};

const isWebSearchCall = (value: unknown): value is {
  type: "web_search_call";
  action?: { type?: string; sources?: Array<{ url?: string; title?: string }> };
  results?: Array<{ url?: string; title?: string }>;
} => {
  if (!value || typeof value !== "object") return false;
  const item = value as { type?: string };
  return item.type === "web_search_call";
};

const isMessageOutputItem = (
  value: unknown
): value is {
  type: "message";
  status?: "in_progress" | "completed" | "incomplete";
  content?: Array<{ type?: string; text?: string; refusal?: string; annotations?: unknown[] }>;
} => {
  if (!value || typeof value !== "object") return false;
  const item = value as { type?: string };
  return item.type === "message";
};

const isReasoningOutputItem = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const item = value as { type?: string };
  return item.type === "reasoning";
};

type ResponseTextExtraction = {
  text: string;
  outputItemCount: number;
  messageCount: number;
  outputTextBlockCount: number;
  usedAggregatedOutputText: boolean;
  usedOutputFallback: boolean;
  hasRefusal: boolean;
  hasIncompleteOutput: boolean;
  hasReasoningOnly: boolean;
};

const extractResponseTextDetails = (response: OpenAIResponseShape): ResponseTextExtraction => {
  const outputItems = Array.isArray(response.output) ? response.output : [];
  const aggregatedOutputText = normalize(response.output_text);
  const messageItems = outputItems.filter(isMessageOutputItem);

  let hasRefusal = false;
  let hasIncompleteOutput = false;
  let outputTextBlockCount = 0;
  const outputTextParts: string[] = [];

  for (const message of messageItems) {
    if (message.status === "incomplete") {
      hasIncompleteOutput = true;
    }

    if (!Array.isArray(message.content)) continue;
    for (const contentPart of message.content) {
      if (contentPart?.type === "refusal") {
        hasRefusal = true;
      }
      if (contentPart?.type !== "output_text" || typeof contentPart.text !== "string") continue;
      outputTextBlockCount += 1;
      outputTextParts.push(contentPart.text);
    }
  }

  if (response.incomplete_details) {
    hasIncompleteOutput = true;
  }

  const hasReasoningOnly = outputItems.length > 0 && outputItems.every((item) => isReasoningOutputItem(item));
  const fallbackText = normalize(outputTextParts.join("\n"));
  const useAggregatedOutputText = aggregatedOutputText.length > 0;
  const text = useAggregatedOutputText ? aggregatedOutputText : fallbackText;

  return {
    text,
    outputItemCount: outputItems.length,
    messageCount: messageItems.length,
    outputTextBlockCount,
    usedAggregatedOutputText: useAggregatedOutputText,
    usedOutputFallback: !useAggregatedOutputText,
    hasRefusal,
    hasIncompleteOutput,
    hasReasoningOnly,
  };
};

const extractResponseText = (response: OpenAIResponseShape): string => {
  return extractResponseTextDetails(response).text;
};

const collectResponseText = (response: OpenAIResponseShape): string => {
  return extractResponseText(response);
};

const collectWebResearchCitations = (response: OpenAIResponseShape): WebResearchCitation[] => {
  const citations: WebResearchCitation[] = [];

  for (const outputItem of response.output ?? []) {
    if (!outputItem || typeof outputItem !== "object") continue;
    const message = outputItem as {
      type?: string;
      content?: Array<{ type?: string; annotations?: unknown[] }>;
    };
    if (message.type !== "message" || !Array.isArray(message.content)) continue;

    for (const contentPart of message.content) {
      if (contentPart?.type !== "output_text" || !Array.isArray(contentPart.annotations)) continue;
      for (const annotation of contentPart.annotations) {
        if (!isUrlCitation(annotation)) continue;
        const url = toSafeUrl(annotation.url ?? "");
        if (!url) continue;
        citations.push({
          title: normalize(annotation.title) || "Source",
          url,
          startIndex: Number.isFinite(annotation.start_index) ? Number(annotation.start_index) : 0,
          endIndex: Number.isFinite(annotation.end_index) ? Number(annotation.end_index) : 0,
        });
      }
    }
  }

  const unique = new Map<string, WebResearchCitation>();
  for (const citation of citations) {
    const key = `${citation.url}|${citation.title}|${citation.startIndex}|${citation.endIndex}`;
    if (!unique.has(key)) unique.set(key, citation);
  }

  return Array.from(unique.values());
};

const collectWebResearchSources = (response: OpenAIResponseShape): WebResearchSource[] => {
  const sources = new Map<string, WebResearchSource>();

  for (const outputItem of response.output ?? []) {
    if (!isWebSearchCall(outputItem)) continue;

    if (Array.isArray(outputItem.action?.sources)) {
      for (const source of outputItem.action.sources) {
        const url = toSafeUrl(source.url ?? "");
        if (!url) continue;
        sources.set(url, {
          sourceName: normalize(source.title) || new URL(url).hostname,
          url,
        });
      }
    }

    if (Array.isArray(outputItem.results)) {
      for (const result of outputItem.results) {
        const url = toSafeUrl(result.url ?? "");
        if (!url) continue;
        sources.set(url, {
          sourceName: normalize(result.title) || new URL(url).hostname,
          url,
        });
      }
    }
  }

  return Array.from(sources.values());
};

const collectRefusalText = (response: OpenAIResponseShape): string => {
  const refusalParts: string[] = [];

  for (const outputItem of response.output ?? []) {
    if (!outputItem || typeof outputItem !== "object") continue;
    const message = outputItem as { type?: string; content?: Array<{ type?: string; refusal?: string }> };
    if (message.type !== "message" || !Array.isArray(message.content)) continue;

    for (const contentPart of message.content) {
      if (contentPart?.type !== "refusal") continue;
      refusalParts.push(normalize(contentPart.refusal));
    }
  }

  return normalize(refusalParts.join(" "));
};

const extractStructuredJsonText = (value: string): string => {
  const trimmed = normalize(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  if (!trimmed) return "";

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  return trimmed;
};

const buildQuerySummary = (request: ContextCollectionRequest): string => {
  const parts = [
    `Sujet public: ${request.subject.displayName}`,
    request.subject.type ? `Type: ${request.subject.type}` : "",
    request.subject.sport ? `Sport: ${request.subject.sport}` : "",
    request.subject.clubOrOrganization ? `Organisation: ${request.subject.clubOrOrganization}` : "",
    `Periode: ${request.dateRange.from} -> ${request.dateRange.to}`,
    `Langue: ${request.language}`,
    `Sources: ${request.sourcePreference}`,
    `Profondeur: ${request.searchDepth}`,
  ].filter(Boolean);

  return parts.join(" | ");
};

const buildPhaseAResearchPrompt = (request: ContextCollectionRequest): string => {
  const sourcePreferenceLabel =
    request.sourcePreference === "official_only"
      ? "officielles uniquement"
      : request.sourcePreference === "official_and_reliable"
        ? "officielles et fiables"
        : "elargies";

  return [
    "Tu fais une recherche web recente et factuelle pour preparer un contenu editorial sportif.",
    "N invente aucun fait et n invente aucune URL.",
    "Cite uniquement des informations verifiables avec liens.",
    request.sourcePreference === "official_only"
      ? "Tu dois privilegier strictement les sources officielles."
      : request.sourcePreference === "official_and_reliable"
        ? "Tu privilegies les sources officielles puis les medias fiables."
        : "Tu peux elargir, mais tu exclus les sources douteuses.",
    `Sujet: ${request.subject.displayName}`,
    request.subject.type ? `Type de sujet: ${request.subject.type}` : "",
    request.subject.sport ? `Sport: ${request.subject.sport}` : "",
    request.subject.clubOrOrganization ? `Organisation: ${request.subject.clubOrOrganization}` : "",
    `Periode: ${request.dateRange.from} -> ${request.dateRange.to}`,
    `Preference des sources: ${sourcePreferenceLabel}`,
    "Fournis une synthese texte concise avec faits utiles pour preparation d interview.",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildPhaseBNormalizationPrompt = (
  request: ContextCollectionRequest,
  webResearch: WebResearchResult,
  maxResults: number
): string => {
  const sourceLines = webResearch.sources.map((source, index) => `${index + 1}. ${source.sourceName} | ${source.url}`);

  return [
    "Transforme la recherche web en JSON structure uniquement.",
    "N invente aucune URL hors liste autorisee.",
    "Si une information n est pas clairement sourcable, ne la garde pas.",
    `Retourne au maximum ${maxResults} items distincts.`,
    `Sujet: ${request.subject.displayName}`,
    `Periode: ${request.dateRange.from} -> ${request.dateRange.to}`,
    "LISTE URL AUTORISEE:",
    sourceLines.join("\n") || "Aucune",
    "SYNTHESE A NORMALISER:",
    webResearch.text,
    "Pour chaque item: title, summary, factualStatement, category, statementType, sourceName, sourceType, sourceUrl, publishedAt si connue.",
  ]
    .filter(Boolean)
    .join("\n\n");
};

const mapOpenAIError = (error: unknown): ContextCollectionError => {
  const maybe = error as OpenAIErrorLike;
  const lowerMessage = normalize(maybe.message).toLowerCase();

  // Trace technique volontairement limitee au statut, au type et au message SDK : aucun prompt, resultat Web ou secret.
  console.error("[external_news][openai_error]", {
    status: maybe.status ?? null,
    type: maybe.type ?? null,
    code: maybe.code ?? null,
    message: maybe.message ?? null,
  });

  if (maybe.status === 401 || maybe.status === 403 || lowerMessage.includes("authentication") || lowerMessage.includes("api key")) {
    return new ContextCollectionError("EXTERNAL_SEARCH_NOT_CONFIGURED", "La recherche externe n est pas configuree correctement.");
  }

  if (
    maybe.status === 400 &&
    (lowerMessage.includes("web_search") || lowerMessage.includes("tool") || lowerMessage.includes("unsupported") || lowerMessage.includes("model"))
  ) {
    return new ContextCollectionError("EXTERNAL_SEARCH_MODEL_UNSUPPORTED", "Le modele configure ne prend pas en charge la recherche web.");
  }

  if (maybe.status === 429) {
    return new ContextCollectionError("EXTERNAL_SEARCH_FAILED", "La recherche externe est temporairement indisponible.");
  }

  if (lowerMessage.includes("malformed") || lowerMessage.includes("json parse") || lowerMessage.includes("could not parse")) {
    return new ContextCollectionError("EXTERNAL_NORMALIZATION_FAILED", "La normalisation de la reponse externe a echoue.");
  }

  return new ContextCollectionError("EXTERNAL_SEARCH_FAILED", "La recherche externe a echoue.");
};

const mapResponseItems = (
  payload: NormalizationPayload,
  request: ContextCollectionRequest,
  allowedSources: Map<string, WebResearchSource>,
  searchedAt: string,
  diagnostics: ExternalSearchDiagnostics
): ExternalNewsSearchItem[] => {
  const allowedSourceTypes: ContextSourceType[] =
    request.sourcePreference === "official_only"
      ? ["official"]
      : request.sourcePreference === "official_and_reliable"
        ? ["official", "media"]
        : ["official", "media", "external"];

  const invalidUrlCandidates: string[] = [];
  const rejectionReasons = new Set<string>();
  let rejectedItemCount = 0;

  const mapped = payload.items
    .map((item, index) => {
      const sourceUrl = toSafeUrl(item.sourceUrl);
      if (!sourceUrl || !allowedSources.has(sourceUrl)) {
        rejectedItemCount += 1;
        rejectionReasons.add("url_not_in_allowed_sources");
        if (sourceUrl) invalidUrlCandidates.push(sourceUrl);
        return null;
      }

      const sourceType = normalizeSourceType(item.sourceType);
      if (!allowedSourceTypes.includes(sourceType)) {
        rejectedItemCount += 1;
        rejectionReasons.add("source_type_not_allowed");
        return null;
      }

      const sourceName = normalize(item.sourceName) || allowedSources.get(sourceUrl)?.sourceName || new URL(sourceUrl).hostname;
      const title = normalize(item.title);
      const summary = normalize(item.summary);
      const factualStatement = normalize(item.factualStatement) || summary;
      if (!title || !summary || !factualStatement) {
        rejectedItemCount += 1;
        rejectionReasons.add("missing_required_text_fields");
        return null;
      }

      return {
        id: `external-news-${index + 1}-${Date.now()}`,
        title,
        summary,
        factualStatement,
        sourceName,
        sourceUrl,
        sourceType,
        publishedAt: item.publishedAt ? normalizePublishedAt(item.publishedAt) ?? null : null,
        retrievedAt: searchedAt,
        confidence: normalizeConfidence(sourceType),
        verificationStatus: normalizeVerificationStatus(sourceType),
        category: normalizeCategory(item.category),
        statementType: normalizeStatementType(item.statementType),
      } satisfies ExternalNewsSearchItem;
    })
    .filter((item): item is ExternalNewsSearchItem => Boolean(item))
    .slice(0, getDepthConfig(request.searchDepth).maxResults);

  diagnostics.rejectedItemCount = rejectedItemCount;
  diagnostics.rejectionReasons = Array.from(rejectionReasons);
  diagnostics.normalizedItemCount = mapped.length;

  if (!mapped.length && invalidUrlCandidates.length > 0) {
    diagnostics.validationErrors.push("all_items_rejected_by_source_url_validation");
    throw new ContextCollectionError("EXTERNAL_NORMALIZATION_INVALID_URL", "Les URL normalisees ne correspondent pas aux sources recherchees.");
  }

  return mapped;
};

const extractWebResearchResult = (response: OpenAIResponseShape, request: ContextCollectionRequest): WebResearchResult => {
  const text = collectResponseText(response);
  const citations = collectWebResearchCitations(response);
  const sources = collectWebResearchSources(response);
  const outputItems = Array.isArray(response.output) ? response.output : [];
  const webSearchCallCount = outputItems.filter(isWebSearchCall).length;
  const messageFound = outputItems.some((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as { type?: string }).type === "message";
  });

  if (!messageFound || !text) {
    const refusalText = collectRefusalText(response);
    if (refusalText) {
      throw new ContextCollectionError("EXTERNAL_SEARCH_EMPTY", "Aucune actualite recente verifiable n a ete trouvee pour cette periode.");
    }

    throw new ContextCollectionError("EXTERNAL_SEARCH_FAILED", "La recherche externe n a pas retourne de synthese exploitable.");
  }

  if (webSearchCallCount === 0 && sources.length === 0) {
    throw new ContextCollectionError("EXTERNAL_SEARCH_MODEL_UNSUPPORTED", "La recherche web n a pas ete executee par le modele configure.");
  }

  if (citations.length === 0 && sources.length === 0) {
    throw new ContextCollectionError("EXTERNAL_SEARCH_NO_CITATIONS", "Aucune citation verifiable n a ete retournee.");
  }

  return {
    responseId: normalize(response.id) || "",
    text,
    citations,
    sources,
    searchedAt: nowIso(),
    dateRange: request.dateRange,
    webSearchCallCount,
    messageFound,
  };
};

const normalizeWithPhaseB = async (
  client: OpenAI,
  request: ContextCollectionRequest,
  webResearch: WebResearchResult,
  diagnostics: ExternalSearchDiagnostics,
  parentSignal?: AbortSignal
): Promise<ExternalNewsSearchItem[]> => {
  diagnostics.normalizationWasCalled = true;

  const model = getWebSearchModel();
  const maxResults = getDepthConfig(request.searchDepth).maxResults;
  const prompt = buildPhaseBNormalizationPrompt(request, webResearch, maxResults);

  const normalizationResponse = await runPhaseWithBudget(
    "normalization",
    contextIntelligenceConfig.limits.normalizationPhaseTimeoutMs,
    parentSignal,
    (signal) =>
      client.responses.create(
        {
          model,
          input: [
            {
              role: "system",
              content:
                "Tu renvoies uniquement un JSON strict de normalisation. N ajoute aucun fait hors du texte fourni. N utilise pas d outil externe.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "external_news_normalization",
              strict: true,
              schema: normalizationResponseSchema,
            },
          },
        },
        {
          signal,
          timeout: contextIntelligenceConfig.limits.normalizationPhaseTimeoutMs,
          maxRetries: 0,
        }
      )
  );

  await writeNormalizationResponseDebugFile(normalizationResponse);

  const normalizationExtraction = extractResponseTextDetails(normalizationResponse);
  diagnostics.normalizationOutputItemCount = normalizationExtraction.outputItemCount;
  diagnostics.normalizationMessageCount = normalizationExtraction.messageCount;
  diagnostics.normalizationOutputTextBlockCount = normalizationExtraction.outputTextBlockCount;
  diagnostics.normalizationUsedAggregatedOutputText = normalizationExtraction.usedAggregatedOutputText;
  diagnostics.normalizationUsedOutputFallback = normalizationExtraction.usedOutputFallback;
  diagnostics.normalizationOutputLength = normalizationExtraction.text.length;

  if (!normalizationExtraction.text) {
    if (normalizationExtraction.hasRefusal) {
      diagnostics.validationErrors.push("normalization_refusal_detected");
    } else if (normalizationExtraction.hasIncompleteOutput) {
      diagnostics.validationErrors.push("normalization_response_incomplete");
    } else if (normalizationExtraction.hasReasoningOnly) {
      diagnostics.validationErrors.push("normalization_reasoning_only_without_message_text");
    }

    diagnostics.validationErrors.push("normalization_response_empty");
    throw new ContextCollectionError("EXTERNAL_NORMALIZATION_FAILED", "La normalisation de la reponse externe a echoue.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractStructuredJsonText(normalizationExtraction.text));
    diagnostics.normalizationParsed = true;
  } catch {
    diagnostics.normalizationParsed = false;
    diagnostics.validationErrors.push("normalization_json_parse_failed");
    throw new ContextCollectionError("EXTERNAL_NORMALIZATION_FAILED", "La normalisation de la reponse externe a echoue.");
  }

  const payload = parsed as NormalizationPayload;
  if (!Array.isArray(payload.items)) {
    diagnostics.validationErrors.push("normalization_payload_items_missing");
    throw new ContextCollectionError("EXTERNAL_NORMALIZATION_FAILED", "La normalisation de la reponse externe a echoue.");
  }

  const allowedSources = new Map<string, WebResearchSource>();
  for (const source of webResearch.sources) {
    const url = toSafeUrl(source.url);
    if (!url) continue;
    allowedSources.set(url, source);
  }
  for (const citation of webResearch.citations) {
    const url = toSafeUrl(citation.url);
    if (!url) continue;
    if (!allowedSources.has(url)) {
      allowedSources.set(url, {
        sourceName: normalize(citation.title) || new URL(url).hostname,
        url,
      });
    }
  }

  return mapResponseItems(payload, request, allowedSources, webResearch.searchedAt, diagnostics);
};

class OpenAIExternalContextProvider implements ExternalContextProvider {
  private client: OpenAI | null = null;

  private getClient(): OpenAI | null {
    if (this.client) return this.client;

    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) return null;

    const configuredBaseUrl = process.env.OPENAI_API_URL
      ? process.env.OPENAI_API_URL.replace(/\/chat\/completions\/?$/i, "")
      : undefined;

    this.client = new OpenAI({
      apiKey,
      ...(configuredBaseUrl ? { baseURL: configuredBaseUrl } : {}),
    });

    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.getClient());
  }

  async search(request: ContextCollectionRequest, signal?: AbortSignal): Promise<ExternalNewsSearchResult> {
    const client = this.getClient();
    if (!client) {
      throw new ContextCollectionError("EXTERNAL_SEARCH_NOT_CONFIGURED", "Provider externe non configure.");
    }

    const model = getWebSearchModel();
    const depthConfig = getDepthConfig(request.searchDepth);
    const querySummary = buildQuerySummary(request);
    const diagnostics = createDiagnostics();

    try {
      const phaseAResponse = await runPhaseWithBudget(
        "web_search",
        contextIntelligenceConfig.limits.webSearchPhaseTimeoutMs,
        signal,
        (phaseSignal) =>
          client.responses.create(
            {
              model,
              input: [
                {
                  role: "system",
                  content: "Tu recherches des faits recents verifiables et cites les sources.",
                },
                {
                  role: "user",
                  content: `${buildPhaseAResearchPrompt(request)}\n\n${querySummary}`,
                },
              ],
              include: ["web_search_call.action.sources", "web_search_call.results"],
              tools: [
                {
                  type: "web_search",
                  search_context_size: depthConfig.searchContextSize,
                },
              ],
            },
            {
              signal: phaseSignal,
              timeout: contextIntelligenceConfig.limits.webSearchPhaseTimeoutMs,
              maxRetries: 0,
            }
          )
      );

      const phaseAOutputItems = Array.isArray(phaseAResponse.output) ? phaseAResponse.output : [];
      diagnostics.webSearchCallCount = phaseAOutputItems.filter(isWebSearchCall).length;
      diagnostics.messageCount = phaseAOutputItems.filter((item) => {
        if (!item || typeof item !== "object") return false;
        return (item as { type?: string }).type === "message";
      }).length;
      diagnostics.citationCount = collectWebResearchCitations(phaseAResponse).length;
      diagnostics.sourceCount = collectWebResearchSources(phaseAResponse).length;
      diagnostics.outputTextLength = collectResponseText(phaseAResponse).length;

      const webResearch = extractWebResearchResult(phaseAResponse, request);
      const items = await normalizeWithPhaseB(client, request, webResearch, diagnostics, signal);

      if (process.env.NODE_ENV !== "production") {
        console.info(
          "[external_news]",
          JSON.stringify({
            responseId: webResearch.responseId || null,
            model,
            ...diagnostics,
            extractedItems: items.length,
            errorCode: items.length ? null : "EXTERNAL_SEARCH_EMPTY",
          })
        );
      }

      return {
        items,
        searchedAt: webResearch.searchedAt,
        dateRange: request.dateRange,
        querySummary,
      };
    } catch (error) {
      if (error instanceof ContextCollectionError) {
        if (process.env.NODE_ENV !== "production") {
          console.info(
            "[external_news]",
            JSON.stringify({
              responseId: null,
              model,
              ...diagnostics,
              extractedItems: 0,
              errorCode: error.code,
            })
          );
        }

        throw error;
      }

      const mappedError = mapOpenAIError(error);
      if (process.env.NODE_ENV !== "production") {
        console.info(
          "[external_news]",
          JSON.stringify({
            responseId: null,
            model,
            ...diagnostics,
            extractedItems: 0,
            errorCode: mappedError.code,
          })
        );
      }

      throw mappedError;
    }
  }
}

export const externalProviderTestUtils = {
  extractResponseText,
  extractResponseTextDetails,
  collectResponseText,
  collectWebResearchCitations,
  collectWebResearchSources,
  extractStructuredJsonText,
  extractWebResearchResult,
};

export const ExternalContextProviderFactory = {
  get(): ExternalContextProvider {
    return new OpenAIExternalContextProvider();
  },
};
