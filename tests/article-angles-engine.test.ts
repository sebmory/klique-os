import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentGenerationError } from "@/services/content-generation/errors";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  validateRequest: vi.fn(),
  validateSuggestions: vi.fn(),
  filterQualifications: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create: mocks.create };
  },
}));

vi.mock("@/lib/ai-usage/repository", () => ({
  recordAiUsageEvent: mocks.recordUsage,
}));

vi.mock("@/services/content-intelligence/article-validator", () => ({
  ArticleFinalLengthError: class extends Error {},
  ArticleFinalParagraphCountError: class extends Error {},
  ArticleFinalSentenceRepetitionError: class extends Error {},
  filterValidArticleAngleQualifications: mocks.filterQualifications,
  validateArticleAngleSuggestions: mocks.validateSuggestions,
  validateArticleAngleQualifications: vi.fn(),
  validateArticleAngleSuggestionsRequest: mocks.validateRequest,
  validateArticleFinalResult: vi.fn(),
  validateArticleRequest: vi.fn(),
  validateArticleStructureSuggestion: vi.fn(),
  validateArticleStructureQualifications: vi.fn(),
  validateArticleStructureSuggestions: vi.fn(),
}));

import { runArticleAngleSuggestionsEngine } from "@/services/content-intelligence/article-engine";
import type { ArticleAngleSuggestionsRequest } from "@/types/content-generation";

const request = {
  requestType: "article",
  language: "fr-CH",
  template: { key: "article:v1", family: "article", name: "Article", version: "v1" },
  context: {
    source: "temporary",
    subjectId: "temporary-subject",
    subjectType: "person",
    displayName: "Alex Exemple",
    knownFacts: [],
    objective: "article",
    audience: "lecteurs d'un média sportif régional",
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
  contextSelection: {},
  rulesVersion: "editorial-rules-v1",
  externalContext: null,
  brief: {
    objective: "article",
    articleType: "portrait",
    length: "court",
    tone: "journalistique",
    audience: "lecteurs d'un média sportif régional",
    additionalContext: "",
    requiredTopics: [],
    externalVerifiedSources: [],
    providedCitations: [],
  },
} as ArticleAngleSuggestionsRequest;

const providerResponse = {
  id: "response-angles",
  status: "completed",
  output_text: JSON.stringify({
    suggestions: [
      { title: "Angle valide 1", rationale: "Promesse 1" },
      { title: "Angle valide 2", rationale: "Promesse 2" },
      { title: "Angle invalide", rationale: "Promesse invalide" },
    ],
  }),
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
};

describe("Article angles engine boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only valid proposals with one provider call and no automatic retry", async () => {
    const parsedSuggestions = [
      { id: "article-angle-1", title: "Angle valide 1", rationale: "Promesse 1" },
      { id: "article-angle-2", title: "Angle valide 2", rationale: "Promesse 2" },
      { id: "article-angle-3", title: "Angle invalide", rationale: "Promesse invalide" },
    ];
    const validSuggestions = parsedSuggestions.slice(0, 2);
    mocks.create.mockResolvedValue(providerResponse);
    mocks.validateSuggestions.mockReturnValue(parsedSuggestions);
    mocks.filterQualifications.mockReturnValue(validSuggestions);

    const result = await runArticleAngleSuggestionsEngine(request);

    expect(result.suggestions).toEqual(validSuggestions);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0]?.[1]).toMatchObject({
      timeout: 45000,
      maxRetries: 0,
    });
  });

  it("does not call the provider again when no proposal is valid", async () => {
    mocks.create.mockResolvedValue(providerResponse);
    mocks.validateSuggestions.mockReturnValue([]);
    mocks.filterQualifications.mockImplementation(() => {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        "Aucun angle n'a passé les contrôles éditoriaux.",
      );
    });

    await expect(runArticleAngleSuggestionsEngine(request)).rejects.toThrow(
      "Aucun angle n'a passé les contrôles éditoriaux.",
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
