import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextItem } from "@/types/context-intelligence";
import type { ArticleAngleSuggestionsRequest } from "@/types/content-generation";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  getCollection: vi.fn(),
  getAiCreditBalance: vi.fn(),
  consumeAiCredit: vi.fn(),
  refundAiCredit: vi.fn(),
  runArticleAngles: vi.fn(),
  evaluatePolicy: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", () => ({
  requireContentAccess: mocks.requireContentAccess,
  contentAccessErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/context-collections/repository", () => ({
  EditorialContextCollectionRepository: {
    create: vi.fn(),
    getById: mocks.getCollection,
  },
}));

vi.mock("@/lib/ai-usage/credit-repository", () => ({
  getAiCreditBalance: mocks.getAiCreditBalance,
  consumeAiCredit: mocks.consumeAiCredit,
  refundAiCredit: mocks.refundAiCredit,
}));

vi.mock("@/services/editorial-generation/policy", async () => {
  const actual = await vi.importActual<typeof import("@/services/editorial-generation/policy")>(
    "@/services/editorial-generation/policy",
  );
  return {
    ...actual,
    evaluateEditorialGenerationEligibility: (...args: Parameters<typeof actual.evaluateEditorialGenerationEligibility>) => {
      mocks.evaluatePolicy(...args);
      return actual.evaluateEditorialGenerationEligibility(...args);
    },
  };
});

vi.mock("@/services/content-intelligence/article-engine", () => ({
  runArticleAngleSuggestionsEngine: mocks.runArticleAngles,
  runArticleFinalEngine: vi.fn(),
  runArticleStructureSuggestionsEngine: vi.fn(),
}));

import { POST } from "@/app/api/contents/generate/article/route";

const access = {
  clerkUserId: "media-user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media" as const,
  isAdmin: false,
};

const makeItem = (
  id: string,
  category: ContextItem["category"],
  title: string,
  factualStatement: string,
  semanticKey: string,
): ContextItem => ({
  id,
  connectorId: "crm",
  category,
  title,
  summary: factualStatement,
  factualStatement,
  statementType: "fact",
  sourceType: "internal",
  sourceName: "CRM",
  retrievedAt: "2026-10-19T14:49:00.000Z",
  confidence: "medium",
  verificationStatus: "reported",
  isSelected: true,
  isEditable: false,
  metadata: {
    subjectId: "athlete-aggee-wenzi",
    semanticKey,
    public: true,
  },
});

const crmItems = [
  makeItem("crm-name", "profile", "Nom public", "Aggee Wenzi", "public_name"),
  makeItem("crm-sport", "profile", "Sport", "Football", "sport"),
  makeItem("crm-club", "club_or_organization", "Club ou organisation", "FC Breitenrain", "club"),
];

const createRequest = (articleType: "portrait" | "actualite"): ArticleAngleSuggestionsRequest => ({
  requestType: "article",
  language: "fr-CH",
  template: { key: "article:v1", family: "article", name: "Article", version: "v1" },
  context: {
    source: "crm",
    subjectId: "athlete-aggee-wenzi",
    subjectType: "person",
    displayName: "Aggee Wenzi",
    sport: "Football",
    clubOrOrganization: "FC Breitenrain",
    knownFacts: [],
    objective: "article",
    audience: "grand-public",
    templateKey: "article:v1",
    contentType: "article",
    format: articleType,
    tone: "journalistique",
    internalFacts: [],
    externalVerifiedFacts: [],
    userProvidedContextItems: [],
    editorialLeads: [],
    excludedContext: [],
    constraints: { requiredTopics: [], avoidedTopics: [], questionCount: 0 },
  },
  selectedContextItems: [],
  contextSelection: {
    collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    selectedItemIds: crmItems.map((item) => item.id),
    manualEdits: [],
  },
  rulesVersion: "editorial-rules-v1",
  externalContext: null,
  brief: {
    objective: "article",
    articleType,
    length: "court",
    tone: "journalistique",
    audience: "grand-public",
    additionalContext: "",
    requiredTopics: [],
    externalVerifiedSources: [],
    providedCitations: [],
  },
});

const postAngles = (articleType: "portrait" | "actualite") =>
  POST(new Request("http://localhost/api/contents/generate/article", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "angles",
      requestId: `aggee-${articleType}`,
      request: createRequest(articleType),
    }),
  }));

describe("Article route runtime editorial policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue(access);
    mocks.getCollection.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: access.workspaceId,
      clerkUserId: access.clerkUserId,
      role: access.role,
      mediaId: access.mediaId,
      items: crmItems,
      reports: [],
      summary: {
        totalItemsFound: 3,
        selectedItemsCount: 3,
        externalSourcesCount: 0,
        researchedAt: "2026-10-19T14:49:00.000Z",
        dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
        warnings: [],
      },
      createdAt: "2026-10-19T14:49:00.000Z",
      expiresAt: "2099-10-19T15:19:00.000Z",
    });
    mocks.getAiCreditBalance.mockResolvedValue({ hasActivePeriod: true, currentBalance: 10 });
    mocks.consumeAiCredit.mockResolvedValue({ status: "consumed" });
    mocks.runArticleAngles.mockResolvedValue({
      suggestions: [
        { id: "portrait-1", title: "Aggee Wenzi, repères confirmés", rationale: "Portrait limité aux données CRM." },
        { id: "portrait-2", title: "Un profil à documenter", rationale: "Mettre en avant les éléments établis." },
        { id: "portrait-3", title: "Entre identité et club", rationale: "Éviter toute extrapolation de parcours." },
      ],
      metadata: {},
    });
  });

  it("allows the real Portrait route in limited mode with only name, sport and club", async () => {
    const response = await postAngles("portrait");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.evaluatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({
          canonicalId: "athlete-aggee-wenzi",
          displayName: "Aggee Wenzi",
          sport: "Football",
          clubOrOrganization: "FC Breitenrain",
        }),
      }),
      expect.objectContaining({ type: "article", articleType: "portrait" }),
    );
    expect(mocks.runArticleAngles).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ articleType: "portrait" }),
        editorialContext: expect.objectContaining({
          subject: expect.objectContaining({
            displayName: "Aggee Wenzi",
            sport: "Football",
            clubOrOrganization: "FC Breitenrain",
          }),
        }),
        editorialGeneration: expect.objectContaining({ generationMode: "limited" }),
      }),
      expect.objectContaining({ workspaceId: access.workspaceId }),
    );
    expect(mocks.consumeAiCredit).toHaveBeenCalledTimes(1);
    expect(mocks.runArticleAngles).toHaveBeenCalledTimes(1);
    expect(body.result.editorial).toMatchObject({
      generationMode: "limited",
      warnings: [
        "Ne pas inventer le parcours, les motivations, les résultats ni les citations du sujet.",
      ],
    });
  });

  it("keeps the same CRM-only dossier blocked for Actualité before debit or provider", async () => {
    const response = await postAngles("actualite");
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(mocks.evaluatePolicy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "article", articleType: "actualite" }),
    );
    expect(body).toMatchObject({
      code: "EDITORIAL_GENERATION_BLOCKED",
      editorial: {
        reasons: [
          "Aucun fait individuel récent, explicitement attribué au sujet et suffisamment fiable n’est disponible pour un article d’actualité.",
        ],
      },
    });
    expect(mocks.consumeAiCredit).not.toHaveBeenCalled();
    expect(mocks.runArticleAngles).not.toHaveBeenCalled();
  });
});
