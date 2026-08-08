import { ContentGenerationError } from "@/services/content-generation/errors";
import { stringifyStructuredVariation } from "@/services/content-variants/serializer";
import type {
  ContentVariationRequest,
  ContentVariationResult,
  ContentVariantGenerationMetadata,
  ContentVariantStructuredContent,
  QuoteVisualStructuredContent,
} from "@/types/content-variant";

const normalize = (value: unknown): string => String(value ?? "").trim();

const toMetadata = (args: {
  request: ContentVariationRequest;
  provider: string;
  model: string;
  requestStartedAt: number;
  promptVersion: string;
}): ContentVariantGenerationMetadata => {
  return {
    provider: args.provider,
    model: args.model,
    generatedAt: new Date().toISOString(),
    generationDurationMs: Date.now() - args.requestStartedAt,
    promptVersion: args.promptVersion,
    variationTemplateVersion: "variation-v1",
    sourceDocumentVersionId: args.request.sourceDocument.documentVersionId,
    sourceDocumentUpdatedAt: args.request.sourceDocument.documentUpdatedAt,
    usedContextItemIds: args.request.selectedContextItems.filter((item) => item.isSelected).map((item) => item.id),
  };
};

const extractAllDocumentSentences = (request: ContentVariationRequest): string[] => {
  const base = [
    request.sourceDocument.title,
    request.sourceDocument.editorialAngle,
    request.sourceDocument.introduction,
    request.sourceDocument.conclusion,
    ...request.sourceDocument.questions.map((question) => question.text),
    ...request.sourceDocument.questions.flatMap((question) => question.followUps),
  ];

  return base
    .flatMap((block) => block.split(/[\n.!?]+/))
    .map((line) => normalize(line))
    .filter((line) => line.length >= 12);
};

const assertQuoteFromSource = (request: ContentVariationRequest, structuredContent: ContentVariantStructuredContent) => {
  if (request.variationType !== "quote_visual") return;
  const quote = structuredContent as QuoteVisualStructuredContent;
  if (!quote.hasQuote) return;

  const directQuote = normalize(quote.quote);
  if (!directQuote) {
    throw new ContentGenerationError("INVALID_VARIATION_RESPONSE", "Citation vide ou invalide");
  }

  const sentences = extractAllDocumentSentences(request);
  const exactMatch = sentences.some((sentence) => sentence.includes(directQuote) || directQuote.includes(sentence));

  if (!exactMatch) {
    throw new ContentGenerationError("QUOTE_NOT_FOUND", "Aucune citation directe exploitable n a ete trouvee dans ce document.");
  }
};

export const validateVariationResult = (args: {
  request: ContentVariationRequest;
  parsedContent: unknown;
  provider: string;
  model: string;
  requestStartedAt: number;
  promptVersion: string;
}): ContentVariationResult => {
  if (!args.parsedContent || typeof args.parsedContent !== "object") {
    throw new ContentGenerationError("INVALID_VARIATION_RESPONSE", "Reponse de declinaison invalide");
  }

  const payload = args.parsedContent as {
    title?: unknown;
    summary?: unknown;
    structuredContent?: unknown;
  };

  const title = normalize(payload.title);
  const summary = normalize(payload.summary);
  const structuredContent = payload.structuredContent as ContentVariantStructuredContent | undefined;

  if (!title || !summary || !structuredContent || typeof structuredContent !== "object") {
    throw new ContentGenerationError("INVALID_VARIATION_RESPONSE", "Structure de declinaison incomplete");
  }

  assertQuoteFromSource(args.request, structuredContent);

  const id = `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    type: args.request.variationType,
    title,
    summary,
    structuredContent,
    content: stringifyStructuredVariation(structuredContent),
    generationMetadata: toMetadata({
      request: args.request,
      provider: args.provider,
      model: args.model,
      requestStartedAt: args.requestStartedAt,
      promptVersion: args.promptVersion,
    }),
  };
};
