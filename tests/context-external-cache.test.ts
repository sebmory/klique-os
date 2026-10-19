import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextCollectionRequest, ContextConnectorResult, ContextItem } from "@/types/context-intelligence";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  consumeAiCredit: vi.fn(),
  refundAiCredit: vi.fn(),
}));

vi.mock("@/services/context-intelligence/connectors", () => ({
  resolveConnector: vi.fn(() => ({
    id: "external_news",
    isAvailable: vi.fn(async () => true),
    collect: mocks.collect,
  })),
}));

vi.mock("@/lib/ai-usage/credit-repository", () => ({
  consumeAiCredit: mocks.consumeAiCredit,
  refundAiCredit: mocks.refundAiCredit,
}));

import { collectContextIntelligence } from "@/services/context-intelligence/collector";

const makeExternalItems = (): ContextItem[] =>
  Array.from({ length: 10 }, (_, index) => ({
    id: `external-${index + 1}`,
    connectorId: "external_news",
    category: "recent_news",
    title: `Actualité ${index + 1}`,
    summary: `Information sportive vérifiée ${index + 1}.`,
    factualStatement: `Information sportive vérifiée ${index + 1}.`,
    statementType: "fact",
    sourceType: "media",
    sourceName: `Média ${index + 1}`,
    sourceUrl: `https://media-${index + 1}.example/article`,
    retrievedAt: "2026-10-19T14:49:00.000Z",
    confidence: "medium",
    verificationStatus: "reported",
    isSelected: true,
    isEditable: true,
    metadata: {},
  }));

const createRequest = (
  searchDepth: ContextCollectionRequest["searchDepth"] = "standard",
  subjectId = "athlete-aggee-wenzi-cache-test",
): ContextCollectionRequest => ({
  workspaceId: "workspace-external-cache-test",
  subject: {
    id: subjectId,
    type: "person",
    source: "crm",
    displayName: "Aggee Wenzi",
  },
  selectedConnectorIds: ["external_news"],
  dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
  sourcePreference: "official_and_reliable",
  searchDepth,
  language: "fr-CH",
  contentType: "article",
});

const usageContext = {
  requestGroupId: "request-group-cache-test",
  workspaceId: "workspace-external-cache-test",
  clerkUserId: "media-cache-test",
  role: "media" as const,
  mediaId: "11111111-1111-4111-8111-111111111111",
};

describe("external context cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeAiCredit.mockResolvedValue({ status: "consumed" });
    mocks.collect.mockResolvedValue({
      connectorId: "external_news",
      status: "completed",
      items: makeExternalItems(),
    } satisfies ContextConnectorResult);
  });

  it("reuses ten valid items for an identical request without a second provider call or debit", async () => {
    const first = await collectContextIntelligence(createRequest(), usageContext);
    const second = await collectContextIntelligence(
      createRequest(),
      { ...usageContext, requestGroupId: "request-group-cache-test-2" },
    );

    expect(first.ok && first.items).toHaveLength(10);
    expect(second.ok && second.items).toHaveLength(10);
    expect(mocks.collect).toHaveBeenCalledTimes(1);
    expect(mocks.consumeAiCredit).toHaveBeenCalledTimes(1);
    expect(mocks.refundAiCredit).not.toHaveBeenCalled();
    expect(second.ok && second.reports.find((report) => report.connectorId === "external_news")?.message)
      .toContain("réutilisés");
  });

  it("runs a distinct collection when a fingerprint parameter changes", async () => {
    await collectContextIntelligence(createRequest("standard", "athlete-cache-changed-parameter"), usageContext);
    await collectContextIntelligence(
      createRequest("deep", "athlete-cache-changed-parameter"),
      { ...usageContext, requestGroupId: "request-group-cache-test-deep" },
    );

    expect(mocks.collect).toHaveBeenCalledTimes(2);
    expect(mocks.consumeAiCredit).toHaveBeenCalledTimes(2);
  });
});
