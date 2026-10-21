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
    const request: ArticleAngleSuggestionsRequest = {
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
    };

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

  it("allows an attributed user-provided verbatim quote without upgrading its status", async () => {
    mocks.prepareEditorialGeneration.mockResolvedValue({
      selectedItems: [],
      eligibility: { status: "limited" },
      selection: {
        modelContext: {
          generationMode: "limited",
          subject: { type: "person", displayName: "Aggee Wenzi" },
          facts: [],
          chronology: [],
          citations: [{
            text: "Je veux progresser avec le groupe.",
            author: "Aggee Wenzi",
            verificationStatus: "user_provided",
            freshness: "current",
            sourceNames: ["Entretien KLIQUE"],
          }],
          editorialLeads: [],
          missingInformation: [],
          unresolvedContradictions: [],
        },
        metadata: {
          dossierRevision: 1,
          generationMode: "limited",
          confidence: { level: "low", score: 35, explanation: [] },
          usedSources: [{
            name: "Entretien KLIQUE",
            official: false,
            confidence: "low",
          }],
          userProvidedMaterials: [{
            kind: "verbatim_quote",
            text: "Je veux progresser avec le groupe.",
            provenance: "Entretien KLIQUE",
            speaker: "Aggee Wenzi",
          }],
          contradictions: [],
          missingInformation: [],
          warnings: [],
        },
      },
    });
    const request: ArticleAngleSuggestionsRequest = {
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
        selectedItemIds: ["manual-material-quote-1"],
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
    };

    const secured = await secureArticleRequest(request, {
      clerkUserId: "media-user-1",
      workspaceId: "workspace-1",
      mediaId: "11111111-1111-4111-8111-111111111111",
      role: "media",
      isAdmin: false,
    });

    expect(secured.editorialContext?.citations[0]?.verificationStatus).toBe("user_provided");
    expect(secured.brief.providedCitations).toEqual([{
      text: "Je veux progresser avec le groupe.",
      author: "Aggee Wenzi",
      source: "Entretien KLIQUE",
    }]);
  });
});
