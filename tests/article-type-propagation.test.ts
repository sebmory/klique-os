import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareEditorialGeneration: vi.fn(),
}));

vi.mock("@/services/editorial-generation/server-context", () => ({
  prepareEditorialGeneration: mocks.prepareEditorialGeneration,
}));

import { secureArticleRequest } from "@/services/content-intelligence/article-request-security";
import type { ArticleAngleSuggestionsRequest } from "@/types/content-generation";

describe("Article type propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareEditorialGeneration.mockResolvedValue({
      selectedItems: [],
      eligibility: { status: "limited" },
      selection: {
        modelContext: {
          generationMode: "limited",
          subject: { type: "person", displayName: "Aggee Wenzi" },
          facts: [],
          chronology: [],
          citations: [],
          editorialLeads: [],
          missingInformation: [],
          unresolvedContradictions: [],
        },
        metadata: {
          dossierRevision: 1,
          generationMode: "limited",
          confidence: { level: "medium", score: 65, explanation: [] },
          usedSources: [],
          contradictions: [],
          missingInformation: [],
          warnings: [],
        },
      },
    });
  });

  it("passes Portrait from the UI request to the server eligibility policy", async () => {
    const request = {
      requestType: "article",
      language: "fr-CH",
      template: { key: "article:v1", family: "article", name: "Article", version: "v1" },
      context: {
        source: "crm",
        subjectId: "athlete-1",
        subjectType: "person",
        displayName: "Aggee Wenzi",
        knownFacts: [],
        objective: "article",
        audience: "general",
        templateKey: "article:v1",
        contentType: "article",
        format: "portrait",
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
        selectedItemIds: ["aggee-replacement"],
        manualEdits: [],
      },
      rulesVersion: "editorial-rules-v1",
      externalContext: null,
      brief: {
        objective: "article",
        articleType: "portrait",
        length: "court",
        tone: "journalistique",
        audience: "general",
        additionalContext: "",
        requiredTopics: [],
        externalVerifiedSources: [],
        providedCitations: [],
      },
    } satisfies ArticleAngleSuggestionsRequest;

    await secureArticleRequest(request, {
      clerkUserId: "media-user-1",
      workspaceId: "workspace-1",
      mediaId: "11111111-1111-4111-8111-111111111111",
      role: "media",
      isAdmin: false,
    });

    expect(mocks.prepareEditorialGeneration).toHaveBeenCalledWith(expect.objectContaining({
      target: { type: "article", articleType: "portrait" },
    }));
  });
});
