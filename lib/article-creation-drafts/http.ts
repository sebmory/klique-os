import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { contentAccessErrorResponse } from "@/lib/content-storage/access";
import { isArticleCreationDraftSchemaMissingError } from "@/lib/article-creation-drafts/repository";
import { ArticleCreationDraftValidationError } from "@/lib/article-creation-drafts/validation";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export const privateJson = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, { ...init, headers: privateHeaders });

export const articleCreationDraftsDisabledResponse = () =>
  privateJson({ ok: false, code: "ARTICLE_DRAFTS_DISABLED", message: "Fonction indisponible." }, { status: 404 });

export const articleCreationDraftStorageScope = (access: ContentAccessContext): string =>
  createHash("sha256")
    .update([
      access.workspaceId,
      access.clerkUserId,
      access.role,
      access.mediaId ?? "",
    ].join("\u001f"))
    .digest("hex")
    .slice(0, 24);

export const articleCreationDraftErrorResponse = (error: unknown): NextResponse => {
  const accessResponse = contentAccessErrorResponse(error);
  if (accessResponse) {
    accessResponse.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    accessResponse.headers.set("Pragma", privateHeaders.Pragma);
    return accessResponse;
  }
  if (error instanceof ArticleCreationDraftValidationError || error instanceof SyntaxError) {
    return privateJson(
      { ok: false, code: "INVALID_ARTICLE_DRAFT", message: error.message },
      { status: 400 },
    );
  }
  if (isArticleCreationDraftSchemaMissingError(error)) {
    return privateJson(
      {
        ok: false,
        code: "ARTICLE_DRAFT_SCHEMA_MISSING",
        message: "La sauvegarde des brouillons Article est activee, mais son schema de stockage est absent.",
      },
      { status: 503 },
    );
  }
  return privateJson(
    {
      ok: false,
      code: "ARTICLE_DRAFT_STORAGE_ERROR",
      message: "Le stockage prive des brouillons Article est indisponible.",
    },
    { status: 500 },
  );
};
