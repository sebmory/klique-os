import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractSportsWatchImport,
  SPORTS_WATCH_IMPORT_MODEL,
} from "@/lib/sports-watch/import-extractor";

const mocks = vi.hoisted(() => ({
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/ai-usage/repository", () => ({
  recordAiUsageEvent: mocks.recordUsage,
}));

const response = (output: unknown) => ({
  id: "resp_fixture",
  status: "completed",
  output_text: JSON.stringify(output),
  output: [],
  usage: {
    input_tokens: 120,
    output_tokens: 40,
    total_tokens: 160,
    input_tokens_details: { cached_tokens: 0 },
  },
});

describe("sports watch import extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses one simulated provider call and preserves null or uncertain values", async () => {
    const callProvider = vi.fn(async () => response({
      sourceName: "Feuille de match officielle",
      documentDate: "2026-10-25",
      matchDate: null,
      competition: "Championnat",
      participantA: "FC Exemple",
      participantB: "FC Démo",
      score: null,
      resultKind: "collective_result",
      individualParticipationExplicit: false,
      individualEvidence: null,
      individualStatistics: [],
      warnings: ["Score illisible.", "Participation individuelle non visible."],
    }) as never);

    const result = await extractSportsWatchImport({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
      contentType: "application/pdf",
      filename: "fixture.pdf",
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
      athlete: { name: "Joueur Test", sport: "Football", club: "FC Exemple" },
    }, { callProvider });

    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(result.model).toBe(SPORTS_WATCH_IMPORT_MODEL);
    expect(result.extraction).toMatchObject({
      matchDate: null,
      score: null,
      resultKind: "collective_result",
      individualParticipationExplicit: false,
    });
    expect(mocks.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      feature: "sports_watch",
      operation: "sports_watch_import_extract",
      role: "admin",
      retryNumber: 0,
    }));
    expect(JSON.stringify(mocks.recordUsage.mock.calls)).not.toContain("Feuille de match officielle");
  });

  it("does not retry after a provider failure", async () => {
    const callProvider = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    await expect(extractSportsWatchImport({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
      contentType: "image/png",
      filename: "fixture.png",
      bytes: new Uint8Array([1, 2, 3]),
      athlete: { name: "Joueur Test", sport: "Basketball", club: "Club Test" },
    }, { callProvider })).rejects.toThrow("provider unavailable");
    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
  });
});
