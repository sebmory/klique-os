import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import {
  ContentStorageValidationError,
  validateContentVariantWriteBody,
} from "@/lib/content-storage/validation";
import { ContentGenerationError } from "@/services/content-generation/errors";
import { validateArticleDerivativeFidelity } from "@/services/content-variants/article-derivative-fidelity";
import { buildSourceDocumentSnapshot } from "@/services/content-variants/source-snapshot";
import type { ContentVariationRequest, ContentVariationResult } from "@/types/content-variant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de variante manquant." }, { status: 400 });
    }

    const stored = await ContentStorageRepository.getVariant(id, access);
    if (!stored) {
      return NextResponse.json({ ok: false, message: "Variante introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      workspaceId: stored.workspaceId,
      variant: stored.variant,
    });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lire la variante." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const { id } = await params;
    const variantId = id?.trim() ?? "";
    const variant = validateContentVariantWriteBody(await request.json());
    if (!variantId || variant.id !== variantId) {
      return NextResponse.json({ ok: false, message: "Identifiant de variante invalide." }, { status: 400 });
    }
    if (variant.origin?.type === "article_derivative") {
      const source = await ContentStorageRepository.getDraft(variant.sourceDocumentId, access);
      if (!source || source.document.type !== "article") {
        return NextResponse.json({ ok: false, message: "Article source introuvable." }, { status: 404 });
      }
      if (
        source.document.activeVersionId !== variant.sourceDocumentVersionId
        || source.document.updatedAt !== variant.sourceDocumentUpdatedAt
      ) {
        return NextResponse.json(
          { ok: false, code: "SOURCE_ARTICLE_CHANGED", message: "L’article source a changé. Générez une nouvelle déclinaison." },
          { status: 409 },
        );
      }
      const snapshot = buildSourceDocumentSnapshot({
        document: source.document,
        includePrivateNotes: false,
        includedPrivateNoteQuestionIds: [],
      });
      const fidelityRequest: ContentVariationRequest = {
        sourceDocument: snapshot,
        sourceDocumentId: snapshot.documentId,
        sourceDocumentType: "article",
        selectedContextItems: snapshot.selectedContextItems,
        variationType: "publication",
        platform: variant.platform,
        objective: "inform",
        tone: "journalistic",
        audience: variant.audience,
        constraints: {
          language: "fr-CH",
          audience: variant.audience,
          includeTopics: [],
          avoidTopics: [],
          includePrivateNotes: false,
          includedPrivateNoteQuestionIds: [],
        },
        language: "fr-CH",
      };
      validateArticleDerivativeFidelity(fidelityRequest, {
        id: variant.id,
        type: variant.type,
        title: variant.title,
        summary: variant.title,
        content: variant.content,
        structuredContent: variant.structuredContent,
        generationMetadata: variant.generationMetadata,
      } satisfies ContentVariationResult);
    }
    const stored = await ContentStorageRepository.updateVariant(variantId, variant, access);
    if (!stored) {
      return NextResponse.json({ ok: false, message: "Variante introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, variant: stored.variant });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof ContentStorageValidationError || error instanceof ContentGenerationError
          ? error.message
          : "Impossible de modifier la variante.",
      },
      { status: error instanceof ContentStorageValidationError || error instanceof ContentGenerationError ? 400 : 500 },
    );
  }
}
