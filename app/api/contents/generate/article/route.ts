import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeAiCredit, getAiCreditBalance, refundAiCredit } from "@/lib/ai-usage/credit-repository";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { ContentGenerationError } from "@/services/content-generation/errors";
import {
  runArticleAngleSuggestionsEngine,
  runArticleFinalEngine,
  runArticleStructureSuggestionsEngine,
} from "@/services/content-intelligence/article-engine";
import {
  ArticleEditorialReadinessError,
  validateArticleAngleSuggestionsRequest,
  validateArticleRequest,
  validateArticleStructureSuggestion,
} from "@/services/content-intelligence/article-validator";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleGenerationRequest,
  ArticleLengthId,
  ArticleStructureSuggestion,
} from "@/types/content-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ArticleAction = "angles" | "structures" | "final";

type ArticleGenerateBody = {
  action?: unknown;
  requestId?: unknown;
  request?: unknown;
  selectedStructure?: unknown;
};

const finalCreditCostByLength = {
  breve: 1,
  court: 2,
  moyen: 3,
  long: 4,
} as const satisfies Record<ArticleLengthId, number>;

const isArticleAction = (value: unknown): value is ArticleAction =>
  value === "angles" || value === "structures" || value === "final";

const isArticleStructureSuggestion = (value: unknown): value is ArticleStructureSuggestion =>
  Boolean(value) && typeof value === "object";

const readBody = async (request: Request): Promise<ArticleGenerateBody> => {
  try {
    return (await request.json()) as ArticleGenerateBody;
  } catch {
    throw new ContentGenerationError("INVALID_REQUEST", "Corps JSON Article invalide");
  }
};

const getCreditCost = (action: ArticleAction, request: ArticleGenerationRequest | ArticleAngleSuggestionsRequest): number => {
  if (action !== "final") return 1;
  const cost = finalCreditCostByLength[request.brief.length];
  if (!cost) {
    throw new ContentGenerationError("INVALID_REQUEST", "Longueur Article invalide pour la facturation");
  }
  return cost;
};

const errorResponse = (error: unknown) => {
  const accessResponse = contentAccessErrorResponse(error);
  if (accessResponse) return accessResponse;

  if (error instanceof ArticleEditorialReadinessError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: error.message,
        issues: error.assessment.issues,
        metrics: error.assessment.metrics,
      },
      { status: 422 },
    );
  }

  const normalized = error instanceof ContentGenerationError
    ? error
    : new ContentGenerationError("GENERATION_FAILED", "Impossible de generer le contenu Article");
  const status = normalized.code === "INVALID_REQUEST" || normalized.code === "MISSING_SUBJECT"
    ? 400
    : normalized.code === "RATE_LIMITED"
      ? 429
      : normalized.code === "PROVIDER_NOT_CONFIGURED"
        ? 503
        : normalized.code === "INVALID_PROVIDER_RESPONSE" || normalized.code === "EMPTY_PROVIDER_RESPONSE" || normalized.code === "INCOMPLETE_PROVIDER_RESPONSE"
          ? 502
          : 500;

  return NextResponse.json({ ok: false, code: normalized.code, message: normalized.message }, { status });
};

export async function POST(request: Request) {
  const consumedCreditKeys: string[] = [];
  let creditContext: { workspaceId: string; clerkUserId: string; requestGroupId: string; operation: string } | null = null;

  try {
    const accessContext = await requireContentAccess(request);
    const body = await readBody(request);
    if (!isArticleAction(body.action)) {
      throw new ContentGenerationError("INVALID_REQUEST", "Action Article invalide");
    }
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId || requestId.length > 160) {
      throw new ContentGenerationError("INVALID_REQUEST", "requestId Article obligatoire et invalide");
    }

    const articleRequest = body.request as ArticleGenerationRequest | ArticleAngleSuggestionsRequest;
    if (body.action === "angles") {
      validateArticleAngleSuggestionsRequest(articleRequest as ArticleAngleSuggestionsRequest);
    } else {
      validateArticleRequest(articleRequest as ArticleGenerationRequest);
    }
    if (body.action === "final") {
      if (!isArticleStructureSuggestion(body.selectedStructure)) {
        throw new ContentGenerationError("INVALID_REQUEST", "Structure Article selectionnee obligatoire");
      }
      validateArticleStructureSuggestion(body.selectedStructure, (articleRequest as ArticleGenerationRequest).brief.length);
    }

    const creditCost = getCreditCost(body.action, articleRequest);
    const usageContext = {
      workspaceId: accessContext.workspaceId,
      clerkUserId: accessContext.clerkUserId,
      role: accessContext.role,
      requestGroupId: randomUUID(),
    };
    const creditOperation = `article_${body.action}`;

    if (accessContext.role === "media") {
      const balance = await getAiCreditBalance({
        workspaceId: accessContext.workspaceId,
        clerkUserId: accessContext.clerkUserId,
      });
      if (!balance.hasActivePeriod || balance.currentBalance < creditCost) {
        return NextResponse.json(
          {
            ok: false,
            code: balance.hasActivePeriod ? "AI_CREDIT_INSUFFICIENT" : "AI_CREDIT_NO_ACTIVE_PERIOD",
            message: balance.hasActivePeriod ? "Credits IA insuffisants pour cette periode." : "Aucune periode de credits IA active.",
          },
          { status: 402 },
        );
      }

      creditContext = {
        workspaceId: accessContext.workspaceId,
        clerkUserId: accessContext.clerkUserId,
        requestGroupId: usageContext.requestGroupId,
        operation: creditOperation,
      };
      for (let creditIndex = 1; creditIndex <= creditCost; creditIndex += 1) {
        const idempotencyKey = `article:${body.action}:${requestId}:${creditIndex}`;
        const creditResult = await consumeAiCredit({
          workspaceId: accessContext.workspaceId,
          clerkUserId: accessContext.clerkUserId,
          requestGroupId: usageContext.requestGroupId,
          operation: creditOperation,
          idempotencyKey,
        });
        if (creditResult.status === "insufficient_credits" || creditResult.status === "no_active_period") {
          await Promise.allSettled(
            consumedCreditKeys.map((originalIdempotencyKey) =>
              refundAiCredit({
                workspaceId: accessContext.workspaceId,
                clerkUserId: accessContext.clerkUserId,
                requestGroupId: usageContext.requestGroupId,
                operation: creditOperation,
                originalIdempotencyKey,
              }),
            ),
          );
          consumedCreditKeys.splice(0);
          return NextResponse.json(
            {
              ok: false,
              code: creditResult.status === "insufficient_credits" ? "AI_CREDIT_INSUFFICIENT" : "AI_CREDIT_NO_ACTIVE_PERIOD",
              message: creditResult.status === "insufficient_credits" ? "Credits IA insuffisants pour cette periode." : "Aucune periode de credits IA active.",
            },
            { status: 402 },
          );
        }
        if (creditResult.status === "consumed") consumedCreditKeys.push(idempotencyKey);
      }
    }

    if (body.action === "angles") {
      const output = await runArticleAngleSuggestionsEngine(articleRequest as ArticleAngleSuggestionsRequest, usageContext);
      return NextResponse.json({ ok: true, action: body.action, result: output });
    }
    if (body.action === "structures") {
      const output = await runArticleStructureSuggestionsEngine(articleRequest as ArticleGenerationRequest, usageContext);
      return NextResponse.json({ ok: true, action: body.action, result: output });
    }

    const output = await runArticleFinalEngine(
      articleRequest as ArticleGenerationRequest,
      body.selectedStructure as ArticleStructureSuggestion,
      usageContext,
    );
    return NextResponse.json({ ok: true, action: body.action, result: output });
  } catch (error) {
    const refundContext = creditContext;
    if (refundContext && consumedCreditKeys.length > 0) {
      await Promise.allSettled(
        consumedCreditKeys.map((originalIdempotencyKey) =>
          refundAiCredit({
            workspaceId: refundContext.workspaceId,
            clerkUserId: refundContext.clerkUserId,
            requestGroupId: refundContext.requestGroupId,
            operation: refundContext.operation,
            originalIdempotencyKey,
          }),
        ),
      );
    }
    return errorResponse(error);
  }
}