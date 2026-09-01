import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import { recordAiUsageEvent } from "@/lib/ai-usage/repository";
import { ContentGenerationError, toContentGenerationError } from "@/services/content-generation/errors";
import {
  buildArticleAngleSuggestionsPrompt,
  buildArticleFactualCorrectionInstruction,
  buildArticleFinalCorrectionInstruction,
  buildArticleFinalPrompt,
  buildArticleStructurePrompt,
} from "@/services/content-intelligence/article-prompt-builder";
import {
  buildArticleFinalJsonSchema,
  buildArticleStructureSuggestionsJsonSchema,
  type ArticleFinalContentRaw,
} from "@/services/content-intelligence/article-schema";
import { contentIntelligenceConfig } from "@/services/content-intelligence/config";
import { buildPublicationAnglesJsonSchema } from "@/services/content-intelligence/publication-schema";
import {
  ArticleFinalLengthError,
  ArticleFinalParagraphCountError,
  ArticleFinalSentenceRepetitionError,
  validateArticleAngleSuggestions,
  validateArticleAngleQualifications,
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
].join(" ");

const createOpenAiClient = (): { client: OpenAI; model: string } => {
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
    model: contentIntelligenceConfig.defaultModel,
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

const createMetadata = (model: string, requestStartedAt: number): ArticleGenerationMetadata => ({
  provider: "openai",
  model,
  generatedAt: new Date().toISOString(),
  generationDurationMs: Math.max(1, Date.now() - requestStartedAt),
});

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
    const response = await client.responses.create({
      model,
      instructions: systemInstructions,
      input: buildArticleAngleSuggestionsPrompt(request),
      text: {
        format: {
          type: "json_schema",
          name: "article_angle_suggestions",
          strict: true,
          schema: buildPublicationAnglesJsonSchema(),
        },
      },
    });
    let suggestions = validateArticleAngleSuggestions(parseArticleResponse(response));
    try {
      validateArticleAngleQualifications(request, suggestions);
    } catch (error) {
      if (!(error instanceof ContentGenerationError) || error.code !== "INVALID_PROVIDER_RESPONSE") throw error;
      await recordArticleUsage({ callContext, operation: "article_angle_suggestions", model, status: "failed", durationMs: Math.max(1, Date.now() - requestStartedAt), response, errorCode: error.code });
      const correctionResponse = await client.responses.create({
        model,
        instructions: systemInstructions,
        input: `${buildArticleAngleSuggestionsPrompt(request)}\n\n${buildArticleFactualCorrectionInstruction(error.message, suggestions)}`,
        text: { format: { type: "json_schema", name: "article_angle_suggestions", strict: true, schema: buildPublicationAnglesJsonSchema() } },
      });
      suggestions = validateArticleAngleSuggestions(parseArticleResponse(correctionResponse));
      validateArticleAngleQualifications(request, suggestions);
      await recordArticleUsage({ callContext: callContext ? { ...callContext, retryNumber: (callContext.retryNumber ?? 0) + 1 } : undefined, operation: "article_angle_suggestions", model, status: "succeeded", durationMs: Math.max(1, Date.now() - requestStartedAt), response: correctionResponse });
      return { suggestions, metadata: createMetadata(model, requestStartedAt) };
    }
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
  const { client, model } = createOpenAiClient();

  try {
    validateArticleRequest(request);
    const response = await client.responses.create({
      model,
      instructions: systemInstructions,
      input: buildArticleStructurePrompt(request),
      text: {
        format: {
          type: "json_schema",
          name: "article_structure_suggestions",
          strict: true,
          schema: buildArticleStructureSuggestionsJsonSchema(),
        },
      },
    });
    let parsed = parseArticleResponse(response) as ArticleStructureSuggestionsResult;
    validateArticleStructureSuggestions(parsed, request.brief.length);
    try {
      validateArticleStructureQualifications(request, parsed);
    } catch (error) {
      if (!(error instanceof ContentGenerationError) || error.code !== "INVALID_PROVIDER_RESPONSE") throw error;
      await recordArticleUsage({ callContext, operation: "article_structure_suggestions", model, status: "failed", durationMs: Math.max(1, Date.now() - requestStartedAt), response, errorCode: error.code });
      const correctionResponse = await client.responses.create({
        model,
        instructions: systemInstructions,
        input: `${buildArticleStructurePrompt(request)}\n\n${buildArticleFactualCorrectionInstruction(error.message, parsed)}`,
        text: { format: { type: "json_schema", name: "article_structure_suggestions", strict: true, schema: buildArticleStructureSuggestionsJsonSchema() } },
      });
      parsed = parseArticleResponse(correctionResponse) as ArticleStructureSuggestionsResult;
      validateArticleStructureSuggestions(parsed, request.brief.length);
      validateArticleStructureQualifications(request, parsed);
      await recordArticleUsage({ callContext: callContext ? { ...callContext, retryNumber: (callContext.retryNumber ?? 0) + 1 } : undefined, operation: "article_structure_suggestions", model, status: "succeeded", durationMs: Math.max(1, Date.now() - requestStartedAt), response: correctionResponse });
      return { suggestions: parsed.suggestions, metadata: createMetadata(model, requestStartedAt) };
    }
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
    const generationError = toArticleGenerationError(error);
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
    validateArticleStructureSuggestion(selectedStructure, request.brief.length);
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