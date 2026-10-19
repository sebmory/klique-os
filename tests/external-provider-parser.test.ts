import { describe, expect, it } from "vitest";
import { ContextCollectionError } from "@/services/context-intelligence/errors";
import { externalProviderTestUtils } from "@/services/context-intelligence/external-provider";
import type { ContextCollectionRequest } from "@/types/context-intelligence";

const baseRequest: ContextCollectionRequest = {
  workspaceId: "workspace-1",
  subject: {
    id: "athlete-1",
    type: "person",
    source: "crm",
    displayName: "Athlete Test",
    sport: "Tennis",
    clubOrOrganization: "Klique Club",
  },
  selectedConnectorIds: ["external_news"],
  dateRange: {
    preset: "last_30_days",
    from: "2026-07-01",
    to: "2026-07-31",
  },
  sourcePreference: "official_and_reliable",
  searchDepth: "standard",
  language: "fr-CH",
  contentType: "interview",
};

describe("external provider parser", () => {
  it("canonicalizes known journalistic and sports source type variants without trusting unknown values", () => {
    const observedMediaTypes = [
      "sports_media",
      "sports-media",
      "sports media",
      "sport_media",
      "sports_news",
      "sports_press",
      "presse_sportive",
      "news_media",
      "news_website",
      "journalistic_media",
    ];

    for (const sourceType of observedMediaTypes) {
      expect(externalProviderTestUtils.normalizeSourceType(sourceType)).toEqual({
        sourceType: "media",
        recognized: true,
      });
    }
    expect(externalProviderTestUtils.normalizeSourceType("club_official")).toEqual({
      sourceType: "official",
      recognized: true,
    });
    expect(externalProviderTestUtils.normalizeSourceType("blog_personnel_inconnu")).toEqual({
      sourceType: "external",
      recognized: false,
    });

    const sources = observedMediaTypes.map((_, index) => ({
      sourceName: `Journal sportif ${index + 1}`,
      url: `https://sports-news-${index + 1}.example/article`,
    }));
    const mapped = externalProviderTestUtils.mapResponseItems(
      {
        items: observedMediaTypes.map((sourceType, index) => ({
          title: `Actualité ${index + 1}`,
          summary: `Résumé vérifiable ${index + 1}`,
          factualStatement: `Fait vérifiable ${index + 1}`,
          category: "recent_news",
          statementType: "fact",
          sourceName: sources[index].sourceName,
          sourceType: sourceType as "media",
          sourceUrl: sources[index].url,
          publishedAt: "2026-07-15",
        })),
      },
      baseRequest,
      sources,
      "2026-07-31T10:00:00.000Z",
    );

    expect(mapped.items).toHaveLength(10);
    expect(mapped.items.every((item) =>
      item.sourceType === "media"
      && item.confidence === "medium"
      && item.verificationStatus === "reported"
      && item.sourceUrl.startsWith("https://"))).toBe(true);
    expect(mapped.diagnostics).toMatchObject({
      rejectedItemCount: 0,
      normalizedItemCount: 10,
    });
    expect(mapped.diagnostics.observedSourceTypes).toHaveProperty("sports media", 3);

    const externallyLabeled = externalProviderTestUtils.mapResponseItems(
      {
        items: sources.map((source, index) => ({
          title: `Résultat ${index + 1}`,
          summary: `Résumé sportif ${index + 1}`,
          factualStatement: `Fait sportif ${index + 1}`,
          category: "result",
          statementType: "fact",
          sourceName: source.sourceName,
          sourceType: "external",
          sourceUrl: source.url,
          publishedAt: "2026-07-15",
        })),
      },
      baseRequest,
      sources,
      "2026-07-31T10:00:00.000Z",
    );
    expect(externallyLabeled.items).toHaveLength(10);
    expect(externallyLabeled.items.every((item) =>
      item.sourceType === "media"
      && item.confidence === "medium"
      && item.verificationStatus === "reported")).toBe(true);
    expect(externallyLabeled.diagnostics.observedSourceTypes).toEqual({ external: 10 });

    const unknown = externalProviderTestUtils.mapResponseItems(
      {
        items: [{
          title: "Billet non qualifié",
          summary: "Résumé",
          factualStatement: "Fait allégué",
          category: "recent_news",
          statementType: "fact",
          sourceName: sources[0].sourceName,
          sourceType: "blog_personnel_inconnu" as "external",
          sourceUrl: sources[0].url,
          publishedAt: "2026-07-15",
        }],
      },
      baseRequest,
      sources,
      "2026-07-31T10:00:00.000Z",
    );
    expect(unknown.items).toEqual([]);
    expect(unknown.diagnostics.rejectionReasons).toContain("unknown_source_type_not_allowed");
  });

  it("extracts phase A research with web search call, citations and deduped sources", () => {
    const response = {
      id: "resp_123",
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            sources: [
              { url: "https://site-a.example/news", title: "Site A" },
              { url: "https://site-a.example/news", title: "Site A" },
            ],
          },
          results: [
            { url: "https://site-b.example/report", title: "Site B" },
          ],
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Resume factuel avec deux liens.",
              annotations: [
                {
                  type: "url_citation",
                  title: "Site A",
                  url: "https://site-a.example/news",
                  start_index: 3,
                  end_index: 12,
                },
                {
                  type: "url_citation",
                  title: "Site A",
                  url: "https://site-a.example/news",
                  start_index: 3,
                  end_index: 12,
                },
                {
                  type: "url_citation",
                  title: "Insecure",
                  url: "http://insecure.example/news",
                  start_index: 14,
                  end_index: 20,
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = externalProviderTestUtils.extractWebResearchResult(response, baseRequest);

    expect(parsed.responseId).toBe("resp_123");
    expect(parsed.webSearchCallCount).toBe(1);
    expect(parsed.citations).toHaveLength(1);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.text.length).toBeGreaterThan(0);
  });

  it("throws EXTERNAL_SEARCH_NO_CITATIONS when web search runs but no references are returned", () => {
    const response = {
      id: "resp_no_citations",
      output: [
        {
          type: "web_search_call",
          action: { type: "search", sources: [] },
          results: [],
        },
        {
          type: "message",
          content: [{ type: "output_text", text: "Texte sans sources" }],
        },
      ],
    };

    expect(() => externalProviderTestUtils.extractWebResearchResult(response, baseRequest)).toThrowError(ContextCollectionError);

    try {
      externalProviderTestUtils.extractWebResearchResult(response, baseRequest);
    } catch (error) {
      const typed = error as ContextCollectionError;
      expect(typed.code).toBe("EXTERNAL_SEARCH_NO_CITATIONS");
    }
  });

  it("extracts wrapped json text from markdown fences", () => {
    const wrapped = "```json\n{\"items\":[{\"title\":\"A\"}]}\n```";
    const json = externalProviderTestUtils.extractStructuredJsonText(wrapped);
    expect(json).toBe('{"items":[{"title":"A"}]}');
  });

  it("throws EXTERNAL_SEARCH_EMPTY when message content is missing", () => {
    const response = {
      id: "resp_empty",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "Aucune information exploitable" }],
        },
      ],
    };

    try {
      externalProviderTestUtils.extractWebResearchResult(response, baseRequest);
      expect.fail("Expected ContextCollectionError");
    } catch (error) {
      const typed = error as ContextCollectionError;
      expect(typed.code).toBe("EXTERNAL_SEARCH_EMPTY");
    }
  });

  it("merges text across multiple messages and keeps citations", () => {
    const response = {
      id: "resp_multi_message",
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            sources: [{ url: "https://site-a.example/news", title: "Site A" }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Bloc 1",
              annotations: [
                {
                  type: "url_citation",
                  title: "Site A",
                  url: "https://site-a.example/news",
                  start_index: 0,
                  end_index: 5,
                },
              ],
            },
          ],
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Bloc 2",
            },
          ],
        },
      ],
    };

    const parsed = externalProviderTestUtils.extractWebResearchResult(response, baseRequest);
    expect(parsed.text).toContain("Bloc 1");
    expect(parsed.text).toContain("Bloc 2");
    expect(parsed.citations).toHaveLength(1);
  });
});

describe("extractResponseText", () => {
  it("CAS A: uses output_text when non-empty", () => {
    const response = {
      output_text: "  {\"items\":[]}  ",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "ignored fallback" }],
        },
      ],
    };

    const text = externalProviderTestUtils.extractResponseText(response);
    const details = externalProviderTestUtils.extractResponseTextDetails(response);

    expect(text).toBe('{"items":[]}');
    expect(details.usedAggregatedOutputText).toBe(true);
    expect(details.usedOutputFallback).toBe(false);
  });

  it("CAS B: falls back to message output_text when output_text is empty", () => {
    const response = {
      output_text: "",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: '{"items":[]}' }],
        },
      ],
    };

    const text = externalProviderTestUtils.extractResponseText(response);
    const details = externalProviderTestUtils.extractResponseTextDetails(response);

    expect(text).toBe('{"items":[]}');
    expect(details.usedAggregatedOutputText).toBe(false);
    expect(details.usedOutputFallback).toBe(true);
  });

  it("CAS C: concatenates multiple output_text blocks in order", () => {
    const response = {
      output_text: "",
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "{\"items\":" },
            { type: "output_text", text: "[]}" },
          ],
        },
      ],
    };

    const text = externalProviderTestUtils.extractResponseText(response);
    const details = externalProviderTestUtils.extractResponseTextDetails(response);

    expect(text).toBe('{"items":\n[]}');
    expect(details.outputTextBlockCount).toBe(2);
  });

  it("CAS D: returns empty string when output has only reasoning", () => {
    const response = {
      output_text: "",
      output: [{ type: "reasoning" }],
    };

    const text = externalProviderTestUtils.extractResponseText(response);
    const details = externalProviderTestUtils.extractResponseTextDetails(response);

    expect(text).toBe("");
    expect(details.hasReasoningOnly).toBe(true);
  });

  it("CAS E: detects refusal and does not treat it as JSON text", () => {
    const response = {
      output_text: "",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "Je ne peux pas aider" }],
        },
      ],
    };

    const text = externalProviderTestUtils.extractResponseText(response);
    const details = externalProviderTestUtils.extractResponseTextDetails(response);

    expect(text).toBe("");
    expect(details.hasRefusal).toBe(true);
    expect(details.outputTextBlockCount).toBe(0);
  });

  it("CAS F: returns empty string when output is missing or empty", () => {
    const withoutOutput = {
      output_text: "",
    };
    const emptyOutput = {
      output_text: "",
      output: [],
    };

    expect(externalProviderTestUtils.extractResponseText(withoutOutput)).toBe("");
    expect(externalProviderTestUtils.extractResponseText(emptyOutput)).toBe("");
  });
});
