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
