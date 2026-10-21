import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeAiCredit, getAiCreditBalance, refundAiCredit } from "@/lib/ai-usage/credit-repository";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import { ContentGenerationError } from "@/services/content-generation/errors";
import { mapContentGenerationErrorToStatus } from "@/services/content-intelligence/engine";
import { runContentVariationEngine } from "@/services/content-intelligence/variation-engine";
import { validateArticleDerivativeFidelity } from "@/services/content-variants/article-derivative-fidelity";
import { buildSourceDocumentSnapshot } from "@/services/content-variants/source-snapshot";
import { stringifyStructuredVariation } from "@/services/content-variants/serializer";
import type {
  ContentVariationRequest,
  ContentVariant,
  ContentVariantPlatform,
  PublicationStructuredContent,
} from "@/types/content-variant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedPlatforms = new Set<ContentVariantPlatform>(["instagram", "linkedin", "newsletter"]);

const readDocumentId = (value: unknown): string => {
  const documentId = String(value ?? "").trim();
  if (!documentId || documentId.length > 200) {
    throw new ContentGenerationError("INVALID_REQUEST", "Article source invalide.");
  }
  return documentId;
};

const readPlatform = (value: unknown): "instagram" | "linkedin" | "newsletter" => {
  const platform = String(value ?? "").trim() as ContentVariantPlatform;
  if (!allowedPlatforms.has(platform)) {
    throw new ContentGenerationError("INVALID_REQUEST", "Format de declinaison invalide.");
  }
  return platform as "instagram" | "linkedin" | "newsletter";
};

const audienceByPlatform = {
  instagram: "Lecteurs Instagram",
  linkedin: "Lecteurs professionnels",
  newsletter: "Abonnes a la newsletter",
} as const;

export async function GET(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const documentId = readDocumentId(new URL(request.url).searchParams.get("sourceDocumentId"));
    const source = await ContentStorageRepository.getDraft(documentId, access);
    if (!source || source.document.type !== "article") {
      return NextResponse.json({ ok: false, message: "Article enregistre introuvable." }, { status: 404 });
    }
    const variants = (await ContentStorageRepository.listVariantsBySourceDocumentId(documentId, access))
      .map((stored) => stored.variant)
      .filter((variant) => variant.origin?.type === "article_derivative");
    const balance = access.role === "media"
      ? await getAiCreditBalance({ workspaceId: access.workspaceId, clerkUserId: access.clerkUserId })
      : null;
    return NextResponse.json({
      ok: true,
      sourceDocumentUpdatedAt: source.document.updatedAt,
      sourceDocumentVersionId: source.document.activeVersionId,
      creditCost: access.role === "media" ? 1 : 0,
      creditBalance: balance?.hasActivePeriod ? balance.currentBalance : null,
      variants,
    });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Declinaisons indisponibles." },
      { status: error instanceof ContentGenerationError ? 400 : 500 },
    );
  }
}

export async function POST(request: Request) {
  let refundContext: { workspaceId: string; clerkUserId: string; requestGroupId: string } | null = null;
  try {
    const access = await requireContentAccess(request);
    const body = await request.json() as Record<string, unknown>;
    const documentId = readDocumentId(body.sourceDocumentId);
    const platform = readPlatform(body.platform);
    const providedRequestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const requestGroupId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providedRequestId)
      ? providedRequestId
      : randomUUID();
    const source = await ContentStorageRepository.getDraft(documentId, access);
    if (!source || source.document.type !== "article") {
      return NextResponse.json({ ok: false, message: "Article enregistre introuvable." }, { status: 404 });
    }

    if (access.role === "media") {
      const credit = await consumeAiCredit({
        workspaceId: access.workspaceId,
        clerkUserId: access.clerkUserId,
        requestGroupId,
        operation: "variation",
        idempotencyKey: `article-derivative:${requestGroupId}`,
      });
      if (credit.status === "insufficient_credits" || credit.status === "no_active_period") {
        return NextResponse.json({
          ok: false,
          code: credit.status === "insufficient_credits" ? "AI_CREDIT_INSUFFICIENT" : "AI_CREDIT_NO_ACTIVE_PERIOD",
          message: credit.status === "insufficient_credits"
            ? "Credits IA insuffisants pour cette periode."
            : "Aucune periode de credits IA active.",
        }, { status: 402 });
      }
      if (credit.status === "consumed") {
        refundContext = {
          workspaceId: access.workspaceId,
          clerkUserId: access.clerkUserId,
          requestGroupId,
        };
      }
    }

    const snapshot = buildSourceDocumentSnapshot({
      document: source.document,
      includePrivateNotes: false,
      includedPrivateNoteQuestionIds: [],
    });
    const variationRequest: ContentVariationRequest = {
      sourceDocument: snapshot,
      sourceDocumentId: snapshot.documentId,
      sourceDocumentType: "article",
      selectedContextItems: snapshot.selectedContextItems,
      variationType: "publication",
      platform,
      objective: "inform",
      tone: "journalistic",
      audience: audienceByPlatform[platform],
      constraints: {
        language: "fr-CH",
        audience: audienceByPlatform[platform],
        length: platform === "newsletter" ? "medium" : "short",
        includeTopics: [],
        avoidTopics: [],
        includePrivateNotes: false,
        includedPrivateNoteQuestionIds: [],
      },
      language: "fr-CH",
    };
    const result = await runContentVariationEngine(variationRequest);
    const publication = result.structuredContent as PublicationStructuredContent;
    result.structuredContent = { ...publication, callToAction: "" };
    result.content = stringifyStructuredVariation(result.structuredContent);
    validateArticleDerivativeFidelity(variationRequest, result);

    const now = new Date().toISOString();
    const variant: ContentVariant = {
      id: result.id,
      sourceDocumentId: snapshot.documentId,
      sourceDocumentType: "article",
      sourceDocumentVersionId: snapshot.documentVersionId,
      sourceDocumentUpdatedAt: snapshot.documentUpdatedAt,
      type: "publication",
      format: "text",
      platform,
      objective: "inform",
      tone: "journalistic",
      audience: audienceByPlatform[platform],
      title: result.title,
      content: result.content,
      structuredContent: result.structuredContent,
      status: "draft",
      origin: { type: "article_derivative", format: platform },
      generationMetadata: result.generationMetadata,
      createdAt: now,
      updatedAt: now,
    };
    const stored = await ContentStorageRepository.createVariant(variant, access);
    return NextResponse.json({ ok: true, variant: stored.variant }, { status: 201 });
  } catch (error) {
    if (refundContext) {
      await refundAiCredit({
        ...refundContext,
        operation: "variation",
        originalIdempotencyKey: `article-derivative:${refundContext.requestGroupId}`,
      });
    }
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const status = error instanceof ContentGenerationError ? mapContentGenerationErrorToStatus(error) : 500;
    return NextResponse.json({
      ok: false,
      code: error instanceof ContentGenerationError ? error.code : "ARTICLE_DERIVATIVE_ERROR",
      message: error instanceof Error ? error.message : "Impossible de decliner cet article.",
    }, { status });
  }
}
