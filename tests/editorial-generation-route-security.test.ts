import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  validateCreationPayload: vi.fn(),
  resolveSelection: vi.fn(),
  prepareEditorialGeneration: vi.fn(),
  runContentEngine: vi.fn(),
  secureArticleRequest: vi.fn(),
  runArticleAngles: vi.fn(),
  consumeAiCredit: vi.fn(),
  refundAiCredit: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", () => ({
  requireContentAccess: mocks.requireContentAccess,
  contentAccessErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/ai-usage/credit-repository", () => ({
  consumeAiCredit: mocks.consumeAiCredit,
  refundAiCredit: mocks.refundAiCredit,
  getAiCreditBalance: vi.fn(),
}));

vi.mock("@/services/content-generation/validation", () => ({
  validateCreationPayload: mocks.validateCreationPayload,
}));

vi.mock("@/services/context-intelligence/collection-service", () => ({
  resolveEditorialContextSelection: mocks.resolveSelection,
}));

vi.mock("@/services/editorial-generation/server-context", async () => {
  const { ContentGenerationError } = await vi.importActual<typeof import("@/services/content-generation/errors")>(
    "@/services/content-generation/errors",
  );
  class EditorialGenerationBlockedError extends ContentGenerationError {
    eligibility: {
      missingInformation: string[];
      contradictionSummaries: string[];
      warnings: string[];
    };

    constructor(eligibility: {
      missingInformation: string[];
      contradictionSummaries: string[];
      warnings: string[];
    }) {
      super("EDITORIAL_GENERATION_BLOCKED", "Generation editoriale bloquee.");
      this.eligibility = eligibility;
    }
  }
  return {
    EditorialGenerationBlockedError,
    prepareEditorialGeneration: mocks.prepareEditorialGeneration,
  };
});

vi.mock("@/services/content-intelligence/engine", () => ({
  runContentIntelligenceEngine: mocks.runContentEngine,
  mapContentGenerationErrorToStatus: vi.fn((error: { code?: string }) =>
    error.code === "EDITORIAL_GENERATION_BLOCKED" ? 422 : 400),
  runPublicationAngleSuggestionsEngine: vi.fn(),
  runPublicationRegenerateOneEngine: vi.fn(),
}));

vi.mock("@/services/content-intelligence/article-request-security", () => ({
  secureArticleRequest: mocks.secureArticleRequest,
  secureGenerationContext: vi.fn(),
}));

vi.mock("@/services/content-intelligence/article-engine", () => ({
  runArticleAngleSuggestionsEngine: mocks.runArticleAngles,
  runArticleFinalEngine: vi.fn(),
  runArticleStructureSuggestionsEngine: vi.fn(),
}));

vi.mock("@/services/content-intelligence/article-validator", () => ({
  ArticleEditorialReadinessError: class extends Error {},
  validateArticleAngleSuggestionsRequest: vi.fn(),
  validateArticleRequest: vi.fn(),
  validateArticleStructureSuggestion: vi.fn(),
}));

import { POST as interviewPost } from "@/app/api/contents/generate/interview/route";
import { POST as articlePost } from "@/app/api/contents/generate/article/route";
import { ContentGenerationError } from "@/services/content-generation/errors";

const access = {
  clerkUserId: "admin-1",
  workspaceId: "workspace-1",
  mediaId: null,
  role: "admin",
  isAdmin: true,
};

describe("editorial generation route provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue(access);
    mocks.consumeAiCredit.mockResolvedValue({ status: "consumed" });
    mocks.prepareEditorialGeneration.mockResolvedValue({
      selectedItems: [{ id: "trusted-1", verificationStatus: "unverified", confidence: "low" }],
      eligibility: { status: "limited" },
      selection: {
        modelContext: { generationMode: "limited" },
        metadata: {
          dossierRevision: 1,
          generationMode: "limited",
          confidence: { level: "low", score: 35, explanation: [] },
          usedSources: [],
          contradictions: [],
          missingInformation: [],
          warnings: [],
        },
      },
    });
  });

  it("forces the Interview alias through server collection resolution", async () => {
    const forged = {
      id: "forged",
      sourceType: "internal",
      sourceName: "CRM",
      verificationStatus: "verified",
      confidence: "high",
    };
    const payload = {
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila Martin" },
      objective: { id: "interview", subtypeId: "portrait" },
      parameters: {
        contextIntelligence: {
          collectionId: "collection-1",
          selectedItemIds: ["trusted-1"],
          manualEdits: [],
          selectedContextItems: [],
        },
      },
    };
    const trusted = [{ id: "trusted-1", verificationStatus: "unverified", confidence: "low" }];
    mocks.validateCreationPayload.mockReturnValue(payload);
    mocks.runContentEngine.mockResolvedValue({ request: { requestType: "interview" }, result: {} });

    const response = await interviewPost(new Request("http://localhost/api/contents/generate/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { parameters: { contextIntelligence: { selectedContextItems: [forged] } } } }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prepareEditorialGeneration).toHaveBeenCalledWith(expect.objectContaining({
      contextSelection: expect.objectContaining({ collectionId: "collection-1", selectedItemIds: ["trusted-1"] }),
      access,
    }));
    expect(mocks.runContentEngine.mock.calls[0]?.[0]?.parameters.contextIntelligence.selectedContextItems).toEqual(trusted);
    expect(mocks.runContentEngine.mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      selection: expect.objectContaining({ metadata: expect.objectContaining({ generationMode: "limited" }) }),
    }));
  });

  it("secures the Article request before validation and generation", async () => {
    const rawRequest = {
      requestType: "article",
      context: { internalFacts: ["Fait falsifié"] },
      selectedContextItems: [{ id: "forged", verificationStatus: "verified", confidence: "high" }],
      contextSelection: { collectionId: "collection-1", selectedItemIds: ["trusted-1"] },
      brief: { length: "court" },
    };
    const securedRequest = {
      ...rawRequest,
      context: { internalFacts: [] },
      selectedContextItems: [{ id: "trusted-1", verificationStatus: "unverified", confidence: "low" }],
    };
    mocks.secureArticleRequest.mockResolvedValue(securedRequest);
    mocks.runArticleAngles.mockResolvedValue({ suggestions: [] });

    const response = await articlePost(new Request("http://localhost/api/contents/generate/article", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "angles", requestId: "request-1", request: rawRequest }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.secureArticleRequest).toHaveBeenCalledWith(rawRequest, access);
    expect(mocks.runArticleAngles).toHaveBeenCalledWith(
      securedRequest,
      expect.objectContaining({ workspaceId: "workspace-1", role: "admin" }),
    );
  });

  it("preserves Media credit consumption on successful generation", async () => {
    mocks.requireContentAccess.mockResolvedValue({
      ...access,
      clerkUserId: "media-user-1",
      role: "media",
      mediaId: "11111111-1111-4111-8111-111111111111",
      isAdmin: false,
    });
    const payload = {
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila Martin" },
      objective: { id: "interview", subtypeId: "portrait" },
      parameters: {
        contextIntelligence: {
          selectedItemIds: [],
          manualEdits: [],
          selectedContextItems: [],
        },
      },
    };
    mocks.validateCreationPayload.mockReturnValue(payload);
    mocks.resolveSelection.mockResolvedValue([]);
    mocks.runContentEngine.mockResolvedValue({ request: { requestType: "interview" }, result: {} });

    const response = await interviewPost(new Request("http://localhost/api/contents/generate/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.consumeAiCredit).toHaveBeenCalledTimes(1);
    expect(mocks.consumeAiCredit).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      clerkUserId: "media-user-1",
      operation: "generate_content",
    }));
    expect(mocks.refundAiCredit).not.toHaveBeenCalled();
  });

  it("blocks before OpenAI and credit consumption", async () => {
    const { EditorialGenerationBlockedError } = await import("@/services/editorial-generation/server-context");
    mocks.validateCreationPayload.mockReturnValue({
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila Martin" },
      objective: { id: "interview", subtypeId: "portrait" },
      parameters: {
        contextIntelligence: {
          collectionId: "collection-1",
          selectedItemIds: ["trusted-1"],
          manualEdits: [],
          selectedContextItems: [],
        },
      },
    });
    mocks.prepareEditorialGeneration.mockRejectedValue(new EditorialGenerationBlockedError({
      missingInformation: ["Aucun fait exploitable."],
      contradictionSummaries: [],
      warnings: [],
    } as never));

    const response = await interviewPost(new Request("http://localhost/api/contents/generate/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "EDITORIAL_GENERATION_BLOCKED",
      editorial: { missingInformation: ["Aucun fait exploitable."] },
    });
    expect(mocks.consumeAiCredit).not.toHaveBeenCalled();
    expect(mocks.runContentEngine).not.toHaveBeenCalled();
  });

  it("blocks an Article before OpenAI and any credit debit", async () => {
    const { EditorialGenerationBlockedError } = await import("@/services/editorial-generation/server-context");
    mocks.requireContentAccess.mockResolvedValue({
      ...access,
      clerkUserId: "media-user-1",
      role: "media",
      mediaId: "11111111-1111-4111-8111-111111111111",
      isAdmin: false,
    });
    mocks.secureArticleRequest.mockRejectedValue(new EditorialGenerationBlockedError({
      missingInformation: ["Aucun fait exploitable."],
      contradictionSummaries: ["Desaccord non resolu concernant le score."],
      warnings: [],
    } as never));

    const response = await articlePost(new Request("http://localhost/api/contents/generate/article", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "final",
        requestId: "article-blocked-1",
        request: { requestType: "article", context: {}, brief: {} },
        selectedStructure: {},
      }),
    }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "EDITORIAL_GENERATION_BLOCKED",
      editorial: {
        missingInformation: ["Aucun fait exploitable."],
        contradictions: ["Desaccord non resolu concernant le score."],
      },
    });
    expect(mocks.consumeAiCredit).not.toHaveBeenCalled();
    expect(mocks.runArticleAngles).not.toHaveBeenCalled();
  });

  it("refunds the existing Media credit when the provider fails", async () => {
    mocks.requireContentAccess.mockResolvedValue({
      ...access,
      clerkUserId: "media-user-1",
      role: "media",
      mediaId: "11111111-1111-4111-8111-111111111111",
      isAdmin: false,
    });
    mocks.validateCreationPayload.mockReturnValue({
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila Martin" },
      objective: { id: "interview", subtypeId: "portrait" },
      parameters: {
        contextIntelligence: {
          collectionId: "collection-1",
          selectedItemIds: ["trusted-1"],
          manualEdits: [],
          selectedContextItems: [],
        },
      },
    });
    mocks.runContentEngine.mockRejectedValue(new ContentGenerationError(
      "GENERATION_FAILED",
      "Fournisseur indisponible.",
    ));

    const response = await interviewPost(new Request("http://localhost/api/contents/generate/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.consumeAiCredit).toHaveBeenCalledTimes(1);
    expect(mocks.refundAiCredit).toHaveBeenCalledTimes(1);
  });
});
