import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractSportsWatchImport,
  SPORTS_WATCH_IMPORT_MODEL,
} from "@/lib/sports-watch/import-extractor";
import milaBenjakBoxScore from "@/tests/fixtures/sports-watch/mila-benjak-box-score.json";

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
      documentDateEvidence: "Document publié le 25/10/2026",
      matchDate: null,
      matchDateEvidence: null,
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

  it("extracts the verified full box score and attributes Mila Benjak by exact name", async () => {
    const callProvider = vi.fn(async () => response(milaBenjakBoxScore) as never);

    const result = await extractSportsWatchImport({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
      contentType: "image/png",
      filename: "mila-benjak.png",
      bytes: new Uint8Array([1, 2, 3]),
      athlete: { name: "Mila Benjak", sport: "Basketball", club: "" },
    }, { callProvider });

    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(result.extraction).toMatchObject({
      documentDate: null,
      matchDate: "2026-10-25",
      competition: "SB League Women Preliminary phase",
      participantA: "BCF Elfic Fribourg",
      participantB: "Nyon Basket Féminin",
      score: "71-64",
      resultKind: "participation",
      individualParticipationExplicit: true,
      individualEvidence: expect.stringContaining("Mila Benjak"),
      individualStatistics: [
        {
          label: "Minutes",
          value: "2:16",
          evidence: expect.stringContaining("MIN 2:16"),
        },
        {
          label: "Points",
          value: "1",
          evidence: expect.stringContaining("PTS 1"),
        },
        {
          label: "Lancers francs",
          value: "1-2",
          evidence: expect.stringContaining("FT 1-2"),
        },
        {
          label: "Pourcentage lancers francs",
          value: "50 %",
          evidence: expect.stringContaining("FT% 50"),
        },
      ],
    });
    expect(result.extraction.warnings).toEqual([]);
  });

  it("does not turn an isolated team total into a final score", async () => {
    const callProvider = vi.fn(async () => response({
      ...milaBenjakBoxScore,
      score: "71",
    }) as never);

    const result = await extractSportsWatchImport({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
      contentType: "image/png",
      filename: "total-isole.png",
      bytes: new Uint8Array([1, 2, 3]),
      athlete: { name: "Mila Benjak", sport: "Basketball", club: "" },
    }, { callProvider });

    expect(result.extraction.score).toBeNull();
    expect(result.extraction.warnings).toContain(
      "La valeur « 71 » n’est pas retenue comme score final : deux scores opposés ne sont pas explicitement visibles.",
    );
  });

  it("keeps a missing statistic null instead of inventing zero", async () => {
    const callProvider = vi.fn(async () => response({
      ...milaBenjakBoxScore,
      individualStatistics: [
        ...milaBenjakBoxScore.individualStatistics,
        { label: "Passes décisives", value: null, evidence: null },
      ],
    }) as never);

    const result = await extractSportsWatchImport({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
      contentType: "image/png",
      filename: "valeur-absente.png",
      bytes: new Uint8Array([1, 2, 3]),
      athlete: { name: "Mila Benjak", sport: "Basketball", club: "" },
    }, { callProvider });

    expect(result.extraction.individualStatistics).not.toContainEqual(
      expect.objectContaining({ label: "Passes décisives", value: "0" }),
    );
    expect(result.extraction.warnings).toContain(
      "Statistique « Passes décisives » non retenue : la valeur est absente et aucun zéro n’est déduit.",
    );
  });

  it("keeps statistics as unattributed proposals when the selected athlete name is missing", async () => {
    const callProvider = vi.fn(async () => response({
      ...milaBenjakBoxScore,
      individualEvidence: "N° 12 — Min 02:42 ; PTS 1",
      individualStatistics: [{
        label: "Minutes",
        value: "02:42",
        evidence: "N° 12 — Min 02:42 ; PTS 1",
      }],
    }) as never);

    const result = await extractSportsWatchImport({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
      contentType: "image/png",
      filename: "numero-12.png",
      bytes: new Uint8Array([1, 2, 3]),
      athlete: { name: "Mila Benjak", sport: "Basketball", club: "" },
    }, { callProvider });

    expect(result.extraction.individualParticipationExplicit).toBe(false);
    expect(result.extraction.individualStatistics).toEqual([{
      label: "Minutes",
      value: "02:42",
      evidence: "N° 12 — Min 02:42 ; PTS 1",
    }]);
    expect(result.extraction.warnings).toContain(
      "Statistiques conservées comme proposition à confirmer : la preuve ne contient pas le nom complet « Mila Benjak ».",
    );
  });

  it("does not copy an ambiguous match date into the document date", async () => {
    const callProvider = vi.fn(async () => response({
      ...milaBenjakBoxScore,
      documentDate: "2023-10-26",
      documentDateEvidence: "GAME DETAILS Tip off: 4:00 pm GMT 25/10/26",
      matchDate: "2023-10-26",
      matchDateEvidence: "GAME DETAILS Tip off: 4:00 pm GMT 25/10/26",
      score: "71-64",
    }) as never);

    const result = await extractSportsWatchImport({
      workspaceId: "workspace-a",
      clerkUserId: "admin-a",
      contentType: "image/png",
      filename: "feuille-complete.png",
      bytes: new Uint8Array([1, 2, 3]),
      athlete: { name: "Mila Benjak", sport: "Basketball", club: "" },
    }, { callProvider });

    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(result.extraction.documentDate).toBeNull();
    expect(result.extraction.matchDate).toBe("2026-10-25");
    expect(result.extraction.warnings).toEqual(expect.arrayContaining([
      "Date du document corrigée : la valeur structurée 2023-10-26 contredit la date lisible 2026-10-25 dans le document.",
      "Date du match corrigée : la valeur structurée 2023-10-26 contredit la date lisible 2026-10-25 dans le document.",
      "Date du document ignorée : sa preuve est identique à celle du match et ne démontre pas une date documentaire distincte.",
    ]));
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
