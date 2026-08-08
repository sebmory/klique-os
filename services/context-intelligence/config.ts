import type { ContextConnectorId, ContextSearchDepth, ContextSourcePreference } from "@/types/context-intelligence";

export const contextIntelligenceConfig = {
  defaultDateRangePreset: "last_30_days",
  defaultSourcePreference: "official_and_reliable" as ContextSourcePreference,
  defaultSearchDepth: "standard" as ContextSearchDepth,
  defaultConnectors: ["crm", "productions", "manual", "external_news"] as ContextConnectorId[],
  externalNews: {
    defaultModel: process.env.OPENAI_WEB_SEARCH_MODEL || "gpt-4.1",
    depth: {
      quick: {
        maxResults: 5,
        searchContextSize: "low",
      },
      standard: {
        maxResults: 10,
        searchContextSize: "medium",
      },
      deep: {
        maxResults: 20,
        searchContextSize: "high",
      },
    },
  },
  limits: {
    maxExternalResults: 8,
    maxContextItems: 40,
    maxCharactersPerItem: 680,
    maxTotalContextCharacters: 8000,
    maxSourcesPerItem: 4,
    searchTimeoutMs: 30000,
    cacheDurationMs: 5 * 60 * 1000,
  },
} as const;
