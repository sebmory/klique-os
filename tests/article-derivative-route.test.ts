import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentAccessError } from "@/lib/content-storage/access";
import type { ArticleDocument } from "@/types/content-document";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  getDraft: vi.fn(),
  listVariants: vi.fn(),
  createVariant: vi.fn(),
  runVariation: vi.fn(),
  consumeCredit: vi.fn(),
  refundCredit: vi.fn(),
  getBalance: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-storage/access")>();
  return { ...actual, requireContentAccess: mocks.requireContentAccess };
});
vi.mock("@/lib/content-storage/repository", () => ({
  ContentStorageRepository: {
    getDraft: mocks.getDraft,
    listVariantsBySourceDocumentId: mocks.listVariants,
    createVariant: mocks.createVariant,
  },
}));
vi.mock("@/services/content-intelligence/variation-engine", () => ({
  runContentVariationEngine: mocks.runVariation,
}));
vi.mock("@/lib/ai-usage/credit-repository", () => ({
  consumeAiCredit: mocks.consumeCredit,
  refundAiCredit: mocks.refundCredit,
  getAiCreditBalance: mocks.getBalance,
}));

import { GET, POST } from "@/app/api/contents/article-derivatives/route";

const access = {
  workspaceId: "workspace-1",
  clerkUserId: "admin-1",
  role: "admin" as const,
  isAdmin: true,
  mediaId: null,
};

const article: ArticleDocument = {
  id: "article-fictif",
  type: "article",
  status: "draft",
  createdAt: "2026-10-21T12:00:00.000Z",
  updatedAt: "2026-10-21T12:05:00.000Z",
  versions: [{ id: "version-1", createdAt: "2026-10-21T12:00:00.000Z", label: "Version initiale", source: "generation" }],
  activeVersionId: "version-1",
  sidebar: {
    subject: "Alex Exemple",
    source: "temporary",
    objective: "portrait",
    tone: "journalistic",
    audience: "regional",
    format: "article",
    templateVersion: "1",
    provider: "simulated",
    model: "simulated",
    generatedAt: "2026-10-21T12:00:00.000Z",
  },
  metadata: {
    provider: "simulated",
    model: "simulated",
    templateId: "article",
    templateKey: "article:v1",
    templateVersion: "1",
    promptVersion: "1",
    generatedAt: "2026-10-21T12:00:00.000Z",
    generationDurationMs: 1,
    questionCountRequested: 0,
    questionCountGenerated: 0,
    reliabilityNotes: [],
    missingInformation: [],
    externalContextUsed: false,
  },
  contextUsage: {
    usedContextItemIds: [],
    usedSourceIds: [],
    unusedSelectedContextItemIds: [],
    externalContextUsed: false,
    selectedItems: [],
  },
  sections: {
    title: "Portrait fictif — non publiable",
    subtitle: null,
    lead: "Alex décrit sa routine.",
    sections: [{ order: 1, heading: "Une routine", paragraphs: ["Il explique : « Je manque encore de recul. »"] }],
    conclusion: "Les effets restent à mesurer.",
    usedCitations: [],
    usedSources: [],
    estimatedWordCount: 40,
    articleType: "portrait",
    articleLength: "court",
    selectedAngle: { id: "angle-1", title: "Une routine encore à mesurer" },
    selectedStructure: {
      id: "structure-1",
      title: "Une routine encore à mesurer",
      editorialPromise: "Décrire la routine sans conclure à une progression.",
      sections: [{ order: 1, title: "Une routine", purpose: "Décrire", points: [] }],
      estimatedWordCount: 40,
    },
  },
};

const generated = {
  id: "variant-1",
  type: "publication" as const,
  title: "Portrait fictif — non publiable",
  summary: "Résumé fidèle.",
  content: "",
  structuredContent: {
    angle: "Une routine",
    hook: "Une routine sans conclusion prématurée.",
    body: "Portrait fictif, non publiable.",
    callToAction: "Aucun",
    hashtags: ["#Basket"],
    visualIdea: "Aucune.",
  },
  generationMetadata: {
    provider: "simulated",
    model: "simulated",
    generatedAt: "2026-10-21T12:06:00.000Z",
    generationDurationMs: 1,
    promptVersion: "test",
    variationTemplateVersion: "variation-v1",
    sourceDocumentVersionId: "version-1",
    sourceDocumentUpdatedAt: article.updatedAt,
    usedContextItemIds: [],
  },
};

describe("Article derivative route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue(access);
    mocks.getDraft.mockResolvedValue({
      document: article,
      version: 2,
      storageUpdatedAt: article.updatedAt,
      workspaceId: access.workspaceId,
      userId: access.clerkUserId,
      mediaId: null,
    });
    mocks.listVariants.mockResolvedValue([]);
    mocks.runVariation.mockResolvedValue(structuredClone(generated));
    mocks.createVariant.mockImplementation(async (variant) => ({
      variant,
      workspaceId: access.workspaceId,
      userId: access.clerkUserId,
      mediaId: null,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    }));
  });

  it("reloads the saved Article server-side and stores a source-linked derivative", async () => {
    const response = await POST(new Request("http://localhost/api/contents/article-derivatives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceDocumentId: article.id,
        platform: "instagram",
        requestId: "11111111-1111-4111-8111-111111111111",
        sourceDocument: { title: "CONTENU CLIENT NON FIABLE" },
      }),
    }));
    const body = await response.json();
    const engineRequest = mocks.runVariation.mock.calls[0][0];

    expect(response.status).toBe(201);
    expect(mocks.getDraft).toHaveBeenCalledWith(article.id, access);
    expect(engineRequest.sourceDocument.title).toBe(article.sections.title);
    expect(engineRequest.sourceDocument.title).not.toContain("CLIENT");
    expect(body.variant.sourceDocumentVersionId).toBe(article.activeVersionId);
    expect(body.variant.sourceDocumentUpdatedAt).toBe(article.updatedAt);
    expect(body.variant.structuredContent.callToAction).toBe("");
    expect(body.variant.origin).toEqual({ type: "article_derivative", format: "instagram" });
    expect(mocks.createVariant).toHaveBeenCalledOnce();
    expect(mocks.consumeCredit).not.toHaveBeenCalled();
  });

  it("exposes saved derivatives and credit cost without generating", async () => {
    const response = await GET(new Request(
      `http://localhost/api/contents/article-derivatives?sourceDocumentId=${article.id}`,
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      sourceDocumentUpdatedAt: article.updatedAt,
      sourceDocumentVersionId: article.activeVersionId,
      creditCost: 0,
      variants: [],
    });
    expect(mocks.runVariation).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request before reading the Article", async () => {
    mocks.requireContentAccess.mockRejectedValueOnce(new ContentAccessError("UNAUTHORIZED"));

    const response = await POST(new Request("http://localhost/api/contents/article-derivatives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceDocumentId: article.id, platform: "linkedin" }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.getDraft).not.toHaveBeenCalled();
    expect(mocks.runVariation).not.toHaveBeenCalled();
  });
});
