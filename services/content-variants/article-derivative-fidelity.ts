import { ContentGenerationError } from "@/services/content-generation/errors";
import type { ContentVariationRequest, ContentVariationResult, PublicationStructuredContent } from "@/types/content-variant";

const normalize = (value: unknown): string => String(value ?? "").trim();

const sourceText = (request: ContentVariationRequest): string => [
  request.sourceDocument.title,
  request.sourceDocument.editorialAngle,
  request.sourceDocument.introduction,
  ...request.sourceDocument.questions.flatMap((section) => [section.text, ...section.followUps]),
  request.sourceDocument.conclusion,
].filter(Boolean).join("\n");

const resultText = (result: ContentVariationResult): string => {
  const publication = result.structuredContent as PublicationStructuredContent;
  return [result.title, result.summary, publication.angle, publication.hook, publication.body].join("\n");
};

const quotedPassages = (value: string): string[] => {
  const matches = value.matchAll(/«([^»]{2,})»|“([^”]{2,})”|"([^"\n]{2,})"/g);
  return Array.from(matches, (match) => normalize(match[1] ?? match[2] ?? match[3])).filter(Boolean);
};

export const validateArticleDerivativeFidelity = (
  request: ContentVariationRequest,
  result: ContentVariationResult,
): void => {
  const source = sourceText(request);
  const output = resultText(result);
  if (/https?:\/\/|www\./i.test(output)) {
    throw new ContentGenerationError("INVALID_VARIATION_RESPONSE", "La declinaison ne peut pas inventer de lien.");
  }

  for (const quote of quotedPassages(output)) {
    if (!source.includes(quote)) {
      throw new ContentGenerationError(
        "INVALID_VARIATION_RESPONSE",
        "Une citation de la declinaison ne correspond pas exactement a l article source.",
      );
    }
  }

  for (const marker of ["fictif", "non publiable"]) {
    if (source.toLocaleLowerCase("fr").includes(marker) && !output.toLocaleLowerCase("fr").includes(marker)) {
      throw new ContentGenerationError(
        "INVALID_VARIATION_RESPONSE",
        "Une mention de reserve obligatoire manque dans la declinaison.",
      );
    }
  }
};
