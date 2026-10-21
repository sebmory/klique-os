import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import { recordAiUsageEvent } from "@/lib/ai-usage/repository";
import { ContentGenerationError, toContentGenerationError } from "@/services/content-generation/errors";
import {
  buildArticleAngleSuggestionsPrompt,
  buildArticleFinalCorrectionInstruction,
  buildArticleFinalPrompt,
  buildArticleStructurePrompt,
} from "@/services/content-intelligence/article-prompt-builder";
import {
  buildArticleAngleSuggestionsJsonSchema,
  buildArticleFinalJsonSchema,
  buildArticleStructureSuggestionsJsonSchema,
  type ArticleFinalContentRaw,
} from "@/services/content-intelligence/article-schema";
import { contentIntelligenceConfig } from "@/services/content-intelligence/config";
import {
  ArticleFinalLengthError,
  ArticleFinalParagraphCountError,
  ArticleFinalSentenceRepetitionError,
  filterValidArticleAngleQualifications,
  validateArticleAngleSuggestions,
  validateArticleAngleSuggestionsRequest,
  validateArticleFinalResult,
  validateArticleRequest,
  validateArticleStructureSuggestion,
  validateArticleStructureQualifications,
  validateArticleStructureSuggestions,
} from "@/services/content-intelligence/article-validator";
import type { AiUsageGenerationContext } from "@/types/ai-usage";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleFinalResult,
  ArticleGenerationRequest,
  PublicationAngleSuggestion,
  ArticleStructureSuggestion,
  ArticleStructureSuggestionsResult,
} from "@/types/content-generation";

type ArticleCallContext = AiUsageGenerationContext & { retryNumber?: number };

type ArticleGenerationMetadata = {
  provider: "openai";
  model: string;
  generatedAt: string;
  generationDurationMs: number;
};

const systemInstructions = [
  "Tu es le Content Intelligence Engine de KLIQUE OS.",
  "N invente jamais un fait absent.",
  "N invente jamais de statistiques, clubs, resultats, partenaires, citations, actualites, blessures ou transferts.",
  "Ne tranche jamais une contradiction et ne fabrique ni ne reformule une citation directe.",
  "Une piste ou une information manuelle non verifiee reste une hypothese.",
  "Une information manquante est omise.",
  "Un element historique ne doit jamais etre presente comme recent.",
  "Reste strictement dans le perimetre du dossier editorial fourni.",
].join(" ");

const createOpenAiClient = (modelOverride?: string): { client: OpenAI; model: string } => {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const configuredBaseUrl = process.env.OPENAI_API_URL
    ? process.env.OPENAI_API_URL.replace(/\/chat\/completions\/?$/i, "")
    : undefined;

  if (!apiKey) {
    throw new ContentGenerationError("PROVIDER_NOT_CONFIGURED", "La generation intelligente n est pas encore configuree");
  }

  return {
    client: new OpenAI({
      apiKey,
      timeout: contentIntelligenceConfig.requestTimeoutMs,
      ...(configuredBaseUrl ? { baseURL: configuredBaseUrl } : {}),
    }),
    model: modelOverride || contentIntelligenceConfig.defaultModel,
  };
};

const recordArticleUsage = async (args: {
  callContext?: ArticleCallContext;
  operation: "article_angle_suggestions" | "article_structure_suggestions" | "article_final_generation";
  model: string;
  status: "succeeded" | "failed";
  durationMs: number;
  response?: Response;
  errorCode?: string | null;
}): Promise<void> => {
  if (!args.callContext) return;

  try {
    await recordAiUsageEvent({
      requestGroupId: args.callContext.requestGroupId,
      workspaceId: args.callContext.workspaceId,
      clerkUserId: args.callContext.clerkUserId,
      role: args.callContext.role,
      feature: "content_generation",
      operation: args.operation,
      contentType: "article",
      provider: "openai",
      model: args.model,
      providerResponseId: args.response?.id ?? null,
      inputTokens: args.response?.usage?.input_tokens ?? 0,
      cachedInputTokens: args.response?.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: args.response?.usage?.output_tokens ?? 0,
      totalTokens: args.response?.usage?.total_tokens ?? 0,
      toolCalls: 0,
      retryNumber: args.callContext.retryNumber ?? 0,
      status: args.status,
      errorCode: args.errorCode ?? null,
      durationMs: args.durationMs,
      usageJson: args.response?.usage ? (args.response.usage as unknown as Record<string, unknown>) : null,
      estimatedCostMicroUsd: null,
      pricingVersion: null,
    });
  } catch (error) {
    console.error("[ai_usage] Failed to record Article generation usage event", {
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
};

const parseArticleResponse = (response: Response): unknown => {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason ? ` (${response.incomplete_details.reason})` : "";
    throw new ContentGenerationError("INCOMPLETE_PROVIDER_RESPONSE", `Sortie incomplete du fournisseur${reason}`);
  }

  const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
  if (!outputText) {
    throw new ContentGenerationError("EMPTY_PROVIDER_RESPONSE", "Sortie texte vide du fournisseur");
  }

  try {
    return JSON.parse(outputText) as unknown;
  } catch {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Reponse Article structuree impossible a parser");
  }
};

const toArticleGenerationError = (error: unknown): ContentGenerationError => {
  if (error instanceof ContentGenerationError) return error;

  const providerError = error as { status?: number; code?: string; name?: string };
  if (providerError.name === "AbortError") {
    return new ContentGenerationError("GENERATION_FAILED", "Le delai de generation est depasse");
  }
  if (providerError.status === 429) {
    return new ContentGenerationError("RATE_LIMITED", "Limite de generation atteinte");
  }
  if (providerError.status === 401 || providerError.status === 403) {
    return new ContentGenerationError("PROVIDER_NOT_CONFIGURED", "Configuration OpenAI invalide");
  }
  if (providerError.status && providerError.status >= 400) {
    return new ContentGenerationError("GENERATION_FAILED", `Echec de generation (OpenAI HTTP ${providerError.status})`);
  }
  return toContentGenerationError(error);
};

const toArticleStructureError = (error: unknown): ContentGenerationError => {
  if (error instanceof ContentGenerationError) return error;

  const providerError = error as { status?: number; name?: string };
  if (
    providerError.name === "AbortError"
    || providerError.name === "APIConnectionTimeoutError"
    || providerError.name === "TimeoutError"
  ) {
    return new ContentGenerationError(
      "ARTICLE_STRUCTURE_TIMEOUT",
      "La génération des structures a dépassé le délai autorisé. Vous pouvez réessayer.",
    );
  }
  if (typeof providerError.status === "number" && providerError.status >= 400) {
    return new ContentGenerationError(
      "ARTICLE_STRUCTURE_PROVIDER_ERROR",
      "Le fournisseur n’a pas pu générer les structures. Vous pouvez réessayer.",
    );
  }
  return new ContentGenerationError(
    "ARTICLE_STRUCTURE_PROVIDER_ERROR",
    "Le fournisseur de structures est temporairement indisponible. Vous pouvez réessayer.",
  );
};

const createMetadata = (model: string, requestStartedAt: number): ArticleGenerationMetadata => ({
  provider: "openai",
  model,
  generatedAt: new Date().toISOString(),
  generationDurationMs: Math.max(1, Date.now() - requestStartedAt),
});

const classifyArticleStructureValidationError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "";
  if (/sections? (?:sont requises|maximum)/i.test(message)) return "section_count";
  if (/Estimation de la structure/i.test(message)) return "word_target";
  if (/Theme non documente/i.test(message)) return "unsupported_theme";
  if (/Qualification temporelle non prouvee/i.test(message)) return "unsupported_temporal_qualification";
  if (/Intertitre generique interdit/i.test(message)) return "generic_heading";
  if (/Construction de titre sportif/i.test(message)) return "unsupported_sports_title";
  if (/ordre de sections|ordre incorrect/i.test(message)) return "section_order";
  if (/identifiant duplique|Structure Article incomplete/i.test(message)) return "structure_shape";
  return "other";
};

const assembleArticleFinalResult = (
  generatedContent: ArticleFinalContentRaw,
  selectedStructure: ArticleStructureSuggestion,
): ArticleFinalResult => {
  if (!Array.isArray(generatedContent.sections) || generatedContent.sections.length !== selectedStructure.sections.length) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      `Article final: ${selectedStructure.sections.length} sections attendues, recu ${Array.isArray(generatedContent.sections) ? generatedContent.sections.length : 0}`,
    );
  }

  const sections = generatedContent.sections.map((generatedSection, index) => {
    const sourceSection = selectedStructure.sections[index];
    if (!Array.isArray(generatedSection?.paragraphs) || generatedSection.paragraphs.length === 0) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Article final: paragraphe manquant pour la section ${index + 1} (${sourceSection.title})`);
    }
    if (generatedSection.paragraphs.some((paragraph) => typeof paragraph !== "string" || !paragraph.trim())) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Article final: paragraphe vide pour la section ${index + 1} (${sourceSection.title})`);
    }

    return {
      order: sourceSection.order,
      heading: sourceSection.title,
      paragraphs: generatedSection.paragraphs,
    };
  });

  return {
    ...generatedContent,
    subtitle: generatedContent.subtitle ?? undefined,
    sections,
  };
};

export const runArticleAngleSuggestionsEngine = async (
  request: ArticleAngleSuggestionsRequest,
  callContext?: ArticleCallContext,
): Promise<{ suggestions: PublicationAngleSuggestion[]; metadata: ArticleGenerationMetadata }> => {
  const requestStartedAt = Date.now();
  const { client, model } = createOpenAiClient();

  try {
    validateArticleAngleSuggestionsRequest(request);
    const response = await client.responses.create(
      {
        model,
        instructions: systemInstructions,
        input: buildArticleAngleSuggestionsPrompt(request),
        text: {
          format: {
            type: "json_schema",
            name: "article_angle_suggestions",
            strict: true,
            schema: buildArticleAngleSuggestionsJsonSchema(),
          },
        },
      },
      { timeout: contentIntelligenceConfig.requestTimeoutMs, maxRetries: 0 },
    );
    const suggestions = filterValidArticleAngleQualifications(
      request,
      validateArticleAngleSuggestions(parseArticleResponse(response)),
    );
    const metadata = createMetadata(model, requestStartedAt);
    await recordArticleUsage({
      callContext,
      operation: "article_angle_suggestions",
      model,
      status: "succeeded",
      durationMs: metadata.generationDurationMs,
      response,
    });
    return { suggestions, metadata };
  } catch (error) {
    const generationError = toArticleGenerationError(error);
    await recordArticleUsage({
      callContext,
      operation: "article_angle_suggestions",
      model,
      status: "failed",
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      errorCode: generationError.code,
    });
    throw generationError;
  }
};

export const runArticleStructureSuggestionsEngine = async (
  request: ArticleGenerationRequest,
  callContext?: ArticleCallContext,
): Promise<{ suggestions: ArticleStructureSuggestionsResult["suggestions"]; metadata: ArticleGenerationMetadata }> => {
  const requestStartedAt = Date.now();
  const { client, model } = createOpenAiClient(contentIntelligenceConfig.articleStructureModel);
  const prompt = buildArticleStructurePrompt(request);
  const promptCharacters = prompt.length;
  const contextCharacters = JSON.stringify(request).length;
  let response: Response | undefined;

  try {
    validateArticleRequest(request);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, contentIntelligenceConfig.articleStructureTimeoutMs);
    try {
      response = await client.responses.create(
        {
          model,
          max_output_tokens: contentIntelligenceConfig.maxTokens,
          instructions: systemInstructions,
          input: prompt,
          text: {
            format: {
              type: "json_schema",
              name: "article_structure_suggestions",
              strict: true,
              schema: buildArticleStructureSuggestionsJsonSchema(
                request.editorialGeneration?.generationMode,
                request.brief.length,
              ),
            },
          },
        },
        {
          signal: controller.signal,
          timeout: contentIntelligenceConfig.articleStructureTimeoutMs,
          maxRetries: 0,
        },
      );
    } catch (error) {
      if (timedOut) {
        throw new ContentGenerationError(
          "ARTICLE_STRUCTURE_TIMEOUT",
          "La génération des structures a dépassé le délai autorisé. Vous pouvez réessayer.",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    let parsed: ArticleStructureSuggestionsResult;
    try {
      parsed = parseArticleResponse(response) as ArticleStructureSuggestionsResult;
    } catch (error) {
      if (error instanceof ContentGenerationError && error.code === "EMPTY_PROVIDER_RESPONSE") {
        throw new ContentGenerationError(
          "ARTICLE_STRUCTURE_EMPTY_RESPONSE",
          "Le fournisseur a renvoyé une réponse vide pour les structures. Vous pouvez réessayer.",
        );
      }
      throw new ContentGenerationError(
        "ARTICLE_STRUCTURE_PARSE_ERROR",
        "La réponse des structures n’a pas pu être lue. Vous pouvez réessayer.",
      );
    }

    try {
      validateArticleStructureSuggestions(
        parsed,
        request.brief.length,
        request.editorialGeneration?.generationMode,
      );
      validateArticleStructureQualifications(request, parsed);
    } catch (error) {
      console.error("[article_structures_validation]", {
        rule: classifyArticleStructureValidationError(error),
      });
      throw new ContentGenerationError(
        "ARTICLE_STRUCTURE_VALIDATION_ERROR",
        "Les structures reçues sont incomplètes ou incompatibles. Vous pouvez réessayer.",
      );
    }
    console.info("[article_structures]", {
      code: "ARTICLE_STRUCTURE_SUCCEEDED",
      model,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      promptCharacters,
      contextCharacters,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    });
    const metadata = createMetadata(model, requestStartedAt);
    await recordArticleUsage({
      callContext,
      operation: "article_structure_suggestions",
      model,
      status: "succeeded",
      durationMs: metadata.generationDurationMs,
      response,
    });
    return { suggestions: parsed.suggestions, metadata };
  } catch (error) {
    const generationError = toArticleStructureError(error);
    const providerStatus = typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : null;
    console.error("[article_structures]", {
      code: generationError.code,
      providerStatus,
      model,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      promptCharacters,
      contextCharacters,
      responseStatus: response?.status ?? null,
      incompleteReason: response?.incomplete_details?.reason ?? null,
      inputTokens: response?.usage?.input_tokens ?? null,
      outputTokens: response?.usage?.output_tokens ?? null,
    });
    await recordArticleUsage({
      callContext,
      operation: "article_structure_suggestions",
      model,
      status: "failed",
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      errorCode: generationError.code,
    });
    throw generationError;
  }
};

export const runArticleFinalEngine = async (
  request: ArticleGenerationRequest,
  selectedStructure: ArticleStructureSuggestion,
  callContext?: ArticleCallContext,
): Promise<{ article: ArticleFinalResult; metadata: ArticleGenerationMetadata }> => {
  const requestStartedAt = Date.now();
  const { client, model } = createOpenAiClient();
  let latestResponse: Response | undefined;
  let activeCallContext = callContext;

  try {
    validateArticleRequest(request);
    validateArticleStructureSuggestion(selectedStructure, request.brief.length, {
      generationMode: request.editorialGeneration?.generationMode,
    });
    const firstResponse = await client.responses.create({
      model,
      instructions: systemInstructions,
      input: buildArticleFinalPrompt(request, selectedStructure),
      text: {
        format: {
          type: "json_schema",
          name: "article_final_result",
          strict: true,
          schema: buildArticleFinalJsonSchema(),
        },
      },
    });
    latestResponse = firstResponse;
    const firstParsed = parseArticleResponse(firstResponse) as ArticleFinalContentRaw;
    let article: ArticleFinalResult | null = null;
    let correctionError: ContentGenerationError | null = null;

    try {
      article = assembleArticleFinalResult(firstParsed, selectedStructure);
    } catch (error) {
      if (!(error instanceof ContentGenerationError) || error.code !== "INVALID_PROVIDER_RESPONSE") {
        throw error;
      }
      correctionError = error;
    }

    if (article) {
      try {
        article.estimatedWordCount = validateArticleFinalResult(article, request, selectedStructure);
      } catch (error) {
        if (
          !(error instanceof ArticleFinalLengthError)
          && !(error instanceof ArticleFinalParagraphCountError)
          && !(error instanceof ArticleFinalSentenceRepetitionError)
        ) throw error;
        correctionError = error;
      }
    }

    if (correctionError) {
      await recordArticleUsage({
        callContext,
        operation: "article_final_generation",
        model,
        status: "failed",
        durationMs: Math.max(1, Date.now() - requestStartedAt),
        response: firstResponse,
        errorCode: correctionError.code,
      });

      activeCallContext = callContext ? { ...callContext, retryNumber: (callContext.retryNumber ?? 0) + 1 } : undefined;
      const correctionPrompt = [
        buildArticleFinalPrompt(request, selectedStructure),
        buildArticleFinalCorrectionInstruction({
          errorMessage: correctionError.message,
          invalidResponse: firstParsed,
          ...(correctionError instanceof ArticleFinalLengthError
            ? {
                actualWordCount: correctionError.actualWordCount,
                minimumWordCount: correctionError.minimumWordCount,
                maximumWordCount: correctionError.maximumWordCount,
              }
            : {}),
          ...(correctionError instanceof ArticleFinalParagraphCountError
            ? {
                actualVisibleParagraphCount: correctionError.actualVisibleParagraphCount,
                minimumVisibleParagraphCount: correctionError.minimumVisibleParagraphCount,
                maximumVisibleParagraphCount: correctionError.maximumVisibleParagraphCount,
              }
            : {}),
          ...(correctionError instanceof ArticleFinalSentenceRepetitionError
            ? { repeatedSentenceLocations: [correctionError.firstLocation, correctionError.secondLocation] as [string, string] }
            : {}),
        }),
      ].join("\n\n");
      const correctionResponse = await client.responses.create({
        model,
        instructions: systemInstructions,
        input: correctionPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "article_final_result",
            strict: true,
            schema: buildArticleFinalJsonSchema(),
          },
        },
      });
      latestResponse = correctionResponse;
      article = assembleArticleFinalResult(parseArticleResponse(correctionResponse) as ArticleFinalContentRaw, selectedStructure);
      article.estimatedWordCount = validateArticleFinalResult(article, request, selectedStructure);
    }

    if (!article) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Article final absent apres validation");
    }

    const metadata = createMetadata(model, requestStartedAt);
    await recordArticleUsage({
      callContext: activeCallContext,
      operation: "article_final_generation",
      model,
      status: "succeeded",
      durationMs: metadata.generationDurationMs,
      response: latestResponse,
    });
    return { article, metadata };
  } catch (error) {
    const generationError = toArticleGenerationError(error);
    await recordArticleUsage({
      callContext: activeCallContext,
      operation: "article_final_generation",
      model,
      status: "failed",
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      response: latestResponse,
      errorCode: generationError.code,
    });
    throw generationError;
  }
};