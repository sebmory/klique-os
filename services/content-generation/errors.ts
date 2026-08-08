import type { ContentGenerationErrorCode } from "@/types/content-generation";

export class ContentGenerationError extends Error {
  code: ContentGenerationErrorCode;

  constructor(code: ContentGenerationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const toContentGenerationError = (error: unknown): ContentGenerationError => {
  if (error instanceof ContentGenerationError) return error;
  return new ContentGenerationError("GENERATION_FAILED", "Impossible de generer le contenu");
};
