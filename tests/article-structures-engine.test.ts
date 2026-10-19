import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentGenerationError } from "@/services/content-generation/errors";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  validateRequest: vi.fn(),
  validateSuggestions: vi.fn(),
  validateQualifications: vi.fn(),
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
  validateArticleAngleSuggestions: vi.fn(),
  validateArticleAngleQualifications: vi.fn(),
  validateArticleAngleSuggestionsRequest: vi.fn(),
  validateArticleFinalResult: vi.fn(),
  validateArticleRequest: mocks.validateRequest,
  validateArticleStructureSuggestion: vi.fn(),
  validateArticleStructureQualifications: mocks.validateQualifications,
  validateArticleStructureSuggestions: mocks.validateSuggestions,
}));

import { runArticleStructureSuggestionsEngine } from "@/services/content-intelligence/article-engine";
import type { ArticleGenerationRequest } from "@/types/content-generation";

const request = {
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
    knownFacts: ["Football", "FC Breitenrain"],
    objective: "article",
    audience: "grand-public",
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
    audience: "grand-public",
    selectedAngle: "Un portrait factuel",
    additionalContext: "",
    requiredTopics: [],
    externalVerifiedSources: [],
    providedCitations: [],
  },
} as ArticleGenerationRequest;

const providerResponse = (output: unknown) => ({
  id: "response-structures",
  status: "completed",
  output_text: JSON.stringify(output),
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
});

describe("Article structures engine boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses one provider call with retries disabled on success", async () => {
    const output = { suggestions: [{ id: "structure-1" }] };
    mocks.create.mockResolvedValue(providerResponse(output));

    const result = await runArticleStructureSuggestionsEngine(request);

    expect(result.suggestions).toEqual(output.suggestions);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      reasoning: { effort: "low" },
      max_output_tokens: 2400,
    });
    expect(mocks.create.mock.calls[0]?.[1]).toMatchObject({
      timeout: 45000,
      maxRetries: 0,
      signal: expect.any(AbortSignal),
    });
  });

  it("does not retry when provider output fails structure validation", async () => {
    mocks.create.mockResolvedValue(providerResponse({ suggestions: [{ id: "invalid" }] }));
    mocks.validateSuggestions.mockImplementation(() => {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "invalid structure");
    });

    await expect(runArticleStructureSuggestionsEngine(request)).rejects.toMatchObject({
      code: "ARTICLE_STRUCTURE_VALIDATION_ERROR",
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("aborts the single provider call at the explicit Structures timeout", async () => {
    vi.useFakeTimers();
    mocks.create.mockImplementation((_body, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }));

    const generation = runArticleStructureSuggestionsEngine(request);
    const rejection = expect(generation).rejects.toMatchObject({ code: "ARTICLE_STRUCTURE_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(45000);

    await rejection;
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
