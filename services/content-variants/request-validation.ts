import { ContentGenerationError } from "@/services/content-generation/errors";
import { isSafeHttpUrl } from "@/services/context-intelligence/utils";
import type { ContentVariationRequest, ContentVariantPlatform, ContentVariantType } from "@/types/content-variant";

const normalize = (value: unknown): string => String(value ?? "").trim();

const allowedTypes: ContentVariantType[] = [
  "publication",
  "carousel",
  "reel",
  "stories",
  "teaser",
  "short_article",
  "quote_visual",
  "podcast_intro",
];

const allowedPlatforms: ContentVariantPlatform[] = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube_shorts",
  "website",
  "newsletter",
  "media",
  "free",
];

export const validateVariationRequest = (value: unknown): ContentVariationRequest => {
  if (!value || typeof value !== "object") {
    throw new ContentGenerationError("INVALID_VARIATION_REQUEST", "Requete de declinaison invalide");
  }

  const request = value as ContentVariationRequest;

  if (!request.sourceDocument || !normalize(request.sourceDocumentId) || !normalize(request.sourceDocumentType)) {
    throw new ContentGenerationError("SOURCE_DOCUMENT_MISSING", "Document source manquant");
  }

  if (!allowedTypes.includes(request.variationType)) {
    throw new ContentGenerationError("VARIATION_TEMPLATE_NOT_FOUND", "Type de declinaison non supporte");
  }

  if (!allowedPlatforms.includes(request.platform)) {
    throw new ContentGenerationError("INVALID_VARIATION_REQUEST", "Canal de declinaison invalide");
  }

  if (!Array.isArray(request.selectedContextItems)) {
    throw new ContentGenerationError("INVALID_VARIATION_REQUEST", "Contexte selectionne invalide");
  }

  for (const item of request.selectedContextItems) {
    if (item.sourceUrl && !isSafeHttpUrl(item.sourceUrl)) {
      throw new ContentGenerationError("INVALID_VARIATION_REQUEST", "Source URL invalide dans le contexte");
    }
  }

  if (request.constraints.slideCount && (request.constraints.slideCount < 2 || request.constraints.slideCount > 12)) {
    throw new ContentGenerationError("INVALID_VARIATION_REQUEST", "Nombre de slides invalide");
  }

  if (request.constraints.storyCount && (request.constraints.storyCount < 2 || request.constraints.storyCount > 12)) {
    throw new ContentGenerationError("INVALID_VARIATION_REQUEST", "Nombre de stories invalide");
  }

  return request;
};
