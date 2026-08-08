import OpenAI from "openai";
import { ContentGenerationError, toContentGenerationError } from "@/services/content-generation/errors";
import { contentIntelligenceConfig } from "@/services/content-intelligence/config";
import { buildVariationPrompt } from "@/services/content-intelligence/variation-prompt-builder";
import { buildVariationJsonSchema } from "@/services/content-intelligence/variation-schema";
import { validateVariationResult } from "@/services/content-intelligence/variation-validator";
import type { ContentVariationRequest, ContentVariationResult } from "@/types/content-variant";
import type { Response } from "openai/resources/responses/responses";

const systemInstructions = [
  "Tu es le Content Intelligence Engine de KLIQUE OS.",
  "N invente jamais un fait absent.",
  "N invente jamais de citation.",
  "Respecte strictement le schema JSON fourni.",
].join(" ");

const extractRefusal = (response: Response): string | null => {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal" && part.refusal.trim()) return part.refusal.trim();
    }
  }
  return null;
};

const createOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const configuredBaseUrl = process.env.OPENAI_API_URL
    ? process.env.OPENAI_API_URL.replace(/\/chat\/completions\/?$/i, "")
    : undefined;

  if (!apiKey) {
    throw new ContentGenerationError("PROVIDER_NOT_AVAILABLE", "La generation de declinaison n est pas configuree");
  }

  return new OpenAI({
    apiKey,
    ...(configuredBaseUrl ? { baseURL: configuredBaseUrl } : {}),
  });
};

export const runContentVariationEngine = async (request: ContentVariationRequest): Promise<ContentVariationResult> => {
  const requestStartedAt = Date.now();

  try {
    const client = createOpenAIClient();
    const prompt = buildVariationPrompt(request, contentIntelligenceConfig.promptVersion);

    const response = await client.responses.create({
      model: contentIntelligenceConfig.defaultModel,
      instructions: systemInstructions,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "content_variation_result",
          strict: true,
          schema: buildVariationJsonSchema(request.variationType, {
            slideCount: request.constraints.slideCount,
            storyCount: request.constraints.storyCount,
          }),
        },
      },
    });

    const refusal = extractRefusal(response);
    if (refusal) {
      throw new ContentGenerationError("PROVIDER_REFUSAL", "Le modele a refuse de generer cette declinaison");
    }

    if (response.status === "incomplete") {
      throw new ContentGenerationError("VARIATION_GENERATION_FAILED", "Sortie incomplete du fournisseur");
    }

    const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
    if (!outputText) {
      throw new ContentGenerationError("INVALID_VARIATION_RESPONSE", "Sortie vide pour la declinaison");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new ContentGenerationError("INVALID_VARIATION_RESPONSE", "JSON de declinaison invalide");
    }

    return validateVariationResult({
      request,
      parsedContent: parsed,
      provider: "openai",
      model: contentIntelligenceConfig.defaultModel,
      requestStartedAt,
      promptVersion: contentIntelligenceConfig.promptVersion,
    });
  } catch (error) {
    if (error instanceof ContentGenerationError) {
      throw error;
    }

    const maybeError = error as {
      status?: number;
      code?: string;
      message?: string;
      name?: string;
    };

    if (maybeError?.name === "AbortError") {
      throw new ContentGenerationError("VARIATION_GENERATION_FAILED", "Le delai de generation est depasse");
    }

    if (maybeError?.status === 429) {
      throw new ContentGenerationError("RATE_LIMITED", "Limite de generation atteinte");
    }

    if (maybeError?.status === 401 || maybeError?.status === 403) {
      throw new ContentGenerationError("PROVIDER_NOT_AVAILABLE", "Configuration OpenAI invalide");
    }

    if (maybeError?.status && maybeError.status >= 400) {
      throw new ContentGenerationError(
        "VARIATION_GENERATION_FAILED",
        maybeError.message?.trim() || `Echec de generation (OpenAI HTTP ${maybeError.status})`
      );
    }

    throw toContentGenerationError(error);
  }
};
