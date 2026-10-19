import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentGenerationError } from "@/services/content-generation/errors";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  secureArticleRequest: vi.fn(),
  runStructures: vi.fn(),
  getAiCreditBalance: vi.fn(),
  consumeAiCredit: vi.fn(),
  refundAiCredit: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", () => ({
  requireContentAccess: mocks.requireContentAccess,
  contentAccessErrorResponse: vi.fn(() => null),
}));

vi.mock("@/services/content-intelligence/article-request-security", () => ({
  secureArticleRequest: mocks.secureArticleRequest,
}));

vi.mock("@/services/content-intelligence/article-engine", () => ({
  runArticleAngleSuggestionsEngine: vi.fn(),
  runArticleFinalEngine: vi.fn(),
  runArticleStructureSuggestionsEngine: mocks.runStructures,
}));

vi.mock("@/services/content-intelligence/article-validator", () => ({
  ArticleEditorialReadinessError: class extends Error {},
  validateArticleAngleSuggestionsRequest: vi.fn(),
  validateArticleRequest: vi.fn(),
  validateArticleStructureSuggestion: vi.fn(),
}));

vi.mock("@/lib/ai-usage/credit-repository", () => ({
  getAiCreditBalance: mocks.getAiCreditBalance,
  consumeAiCredit: mocks.consumeAiCredit,
  refundAiCredit: mocks.refundAiCredit,
}));

import { POST } from "@/app/api/contents/generate/article/route";

const access = {
  clerkUserId: "media-user-structures",
  workspaceId: "workspace-structures",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media" as const,
  isAdmin: false,
};

const articleRequest = {
  requestType: "article",
  context: { displayName: "Aggee Wenzi" },
  contextSelection: { collectionId: "collection-1", selectedItemIds: ["crm-name", "crm-sport", "crm-club"] },
  selectedContextItems: [],
  brief: {
    articleType: "portrait",
    length: "court",
    tone: "journalistique",
    audience: "grand-public",
    selectedAngle: "Un portrait factuel",
  },
};

const postStructures = () =>
  POST(new Request("http://localhost/api/contents/generate/article", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "structures",
      requestId: "structures-request-1",
      request: articleRequest,
    }),
  }));

describe("Article structures route failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue(access);
    mocks.secureArticleRequest.mockResolvedValue(articleRequest);
    mocks.getAiCreditBalance.mockResolvedValue({ hasActivePeriod: true, currentBalance: 5 });
    mocks.consumeAiCredit.mockResolvedValue({ status: "consumed" });
    mocks.refundAiCredit.mockResolvedValue({ status: "refunded" });
  });

  it("returns a recoverable timeout and refunds the consumed credit", async () => {
    mocks.runStructures.mockRejectedValue(new ContentGenerationError(
      "ARTICLE_STRUCTURE_TIMEOUT",
      "La génération des structures a dépassé le délai autorisé. Vous pouvez réessayer.",
    ));

    const response = await postStructures();
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body).toMatchObject({
      ok: false,
      code: "ARTICLE_STRUCTURE_TIMEOUT",
      message: expect.stringContaining("réessayer"),
    });
    expect(mocks.runStructures).toHaveBeenCalledTimes(1);
    expect(mocks.consumeAiCredit).toHaveBeenCalledTimes(1);
    expect(mocks.refundAiCredit).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an invalid provider structure response and refunds", async () => {
    mocks.runStructures.mockRejectedValue(new ContentGenerationError(
      "ARTICLE_STRUCTURE_VALIDATION_ERROR",
      "Les structures reçues sont incomplètes ou incompatibles. Vous pouvez réessayer.",
    ));

    const response = await postStructures();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("ARTICLE_STRUCTURE_VALIDATION_ERROR");
    expect(mocks.runStructures).toHaveBeenCalledTimes(1);
    expect(mocks.refundAiCredit).toHaveBeenCalledTimes(1);
  });

  it("returns normal structures without refund on success", async () => {
    mocks.runStructures.mockResolvedValue({
      suggestions: [{
        id: "structure-1",
        title: "Identité et repères",
        editorialPromise: "Rester strictement sur les faits disponibles.",
        estimatedWordCount: 500,
        sections: [{ order: 1, title: "Repères", purpose: "Présenter le sujet." }],
      }],
      metadata: {
        provider: "openai",
        model: "test-model",
        generatedAt: "2026-10-19T15:00:00.000Z",
        generationDurationMs: 1200,
      },
    });

    const response = await postStructures();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      action: "structures",
      result: { suggestions: [{ id: "structure-1" }] },
    });
    expect(mocks.runStructures).toHaveBeenCalledTimes(1);
    expect(mocks.consumeAiCredit).toHaveBeenCalledTimes(1);
    expect(mocks.refundAiCredit).not.toHaveBeenCalled();
  });
});
