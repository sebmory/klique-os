import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessInterviewBriefReadiness } from "@/services/content-intelligence/interview-preparation";
import type { ContextItem } from "@/types/context-intelligence";
import type { SportsWatchCandidate } from "@/types/sports-watch";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  validateRequest: vi.fn(),
  collect: vi.fn(),
  createCollection: vi.fn(),
  projectCollection: vi.fn((response) => response),
  getInterviewCandidates: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", () => ({
  requireContentAccess: mocks.requireContentAccess,
  contentAccessErrorResponse: vi.fn(() => null),
}));

vi.mock("@/services/context-intelligence/request-validation", () => ({
  validateContextCollectionRequest: mocks.validateRequest,
}));

vi.mock("@/services/context-intelligence/collector", () => ({
  collectContextIntelligence: mocks.collect,
  toContextCollectionErrorResponse: vi.fn((error) => ({
    ok: false,
    code: "INVALID_CONTEXT_REQUEST",
    message: error instanceof Error ? error.message : "error",
  })),
}));

vi.mock("@/services/context-intelligence/collection-service", () => ({
  createEditorialContextCollection: mocks.createCollection,
  projectEditorialCollectionForAccess: mocks.projectCollection,
}));

vi.mock("@/lib/sports-watch/repository", () => ({
  PostgresSportsWatchRepository: {
    getInterviewCandidates: mocks.getInterviewCandidates,
  },
}));

import { POST } from "@/app/api/context/collect/route";

describe("context collection route workspace security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContentAccess.mockResolvedValue({
      clerkUserId: "user-1",
      workspaceId: "workspace-server",
      mediaId: "11111111-1111-4111-8111-111111111111",
      role: "media",
      isAdmin: false,
    });
    mocks.validateRequest.mockReturnValue({
      workspaceId: "",
      subject: {
        id: "athlete-1",
        type: "person",
        source: "crm",
        displayName: "Mila Martin",
      },
      selectedConnectorIds: ["crm"],
      dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr",
      contentType: "interview",
    });
    mocks.collect.mockResolvedValue({
      ok: true,
      items: [],
      reports: [],
      summary: {
        totalItemsFound: 0,
        selectedItemsCount: 0,
        externalSourcesCount: 0,
        researchedAt: "2026-10-19T10:00:00.000Z",
        dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
        warnings: [],
      },
    });
    mocks.createCollection.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expiresAt: "2026-10-19T10:30:00.000Z",
    });
  });

  it("ignores client workspace identifiers and injects authenticated workspace", async () => {
    const response = await POST(new Request("http://localhost/api/context/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "workspace-client",
        subject: { workspaceId: "workspace-client", displayName: "Mila Martin" },
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-server",
        subject: expect.objectContaining({ workspaceId: "workspace-server" }),
      }),
      expect.objectContaining({
        workspaceId: "workspace-server",
        role: "media",
      }),
    );
  });

  it("keeps eight selected Tournamentsoftware results verified through preflight", async () => {
    const tournamentId = "6A6DB828-DFA1-481D-8AF4-A3ECD66C80B3";
    const candidateIds = [
      "ca6333df-4e0b-47c0-aa22-f276a4f1bb5e",
      "b044a2a5-7d26-43a9-b7f2-abf5da0e436e",
      "8b9bdb97-a0d6-4b33-a63b-63412f480077",
      "84c5a8e1-644e-4c2b-865c-06164f9883c9",
      "df0fe133-535f-4df4-a738-ec26ada5d78e",
      "dab688c7-a1ab-44fe-ae7a-dd612f2d6aef",
      "bceae21e-f1e8-4d2f-8f5e-837fa0cda742",
      "81bdac15-5b08-4945-9118-617d4c7c7dd2",
    ];
    const candidates: SportsWatchCandidate[] = candidateIds.map((id, index) => {
      const opponent = `Adversaire ${index + 1}`;
      const athleteWon = index % 2 === 0;
      return {
        id,
        athleteId: "athlete-1",
        athleteName: "Antoine Majeux",
        sourceName: "Swiss Badminton / Tournamentsoftware",
        sourceUrl: `https://sb.tournamentsoftware.com/sport/tournament.aspx?id=${tournamentId}`,
        articleUrl: `https://sb.tournamentsoftware.com/sport/draw.aspx?id=${tournamentId}&draw=${index + 1}`,
        title: `30e BULL'MINTON CUP — SM${index + 1}`,
        excerpt: [
          `30e BULL'MINTON CUP — SM${index + 1} (simple) — Poule.`,
          `Ordre officiel : Antoine Majeux puis ${opponent}.`,
          `Vainqueur explicite : ${athleteWon ? "Antoine Majeux" : opponent}.`,
          "Scores dans l’ordre officiel : 15-10, 15-12.",
          "Score du point de vue d’Antoine Majeux : 15-10, 15-12.",
        ].join(" "),
        resultKind: "individual_result",
        publicationDate: null,
        eventDateFrom: "2026-11-15",
        eventDateTo: "2026-11-15",
        collectedAt: "2026-11-16T10:00:00.000Z",
        attributionStatus: "matched",
        attributionEvidence: [],
        verificationStatus: "unverified",
        adminStatus: "validated",
        supersedesCandidateId: null,
        version: 1,
        manualEntry: null,
        footballEvidence: null,
        footballCompletion: null,
        footballResolution: null,
      };
    });
    mocks.getInterviewCandidates.mockResolvedValue(candidates);
    mocks.validateRequest.mockReturnValue({
      workspaceId: "",
      subject: {
        id: "athlete-1",
        type: "person",
        source: "crm",
        displayName: "Antoine Majeux",
      },
      selectedConnectorIds: ["manual"],
      dateRange: { preset: "last_30_days", from: "2026-10-17", to: "2026-11-16" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr-CH",
      contentType: "interview",
      interviewType: "tournament_review",
      manualEditorialMaterials: [],
    });

    const response = await POST(new Request("http://localhost/api/context/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sportsWatchCandidateIds: candidateIds }),
    }));
    const collectedRequest = mocks.collect.mock.calls[0][0];
    const selectedContextItems: ContextItem[] = collectedRequest.manualEditorialMaterials.map(
      (material: {
        id: string;
        text: string;
        statementType: ContextItem["statementType"];
        verificationStatus: ContextItem["verificationStatus"];
        category: ContextItem["category"];
      }): ContextItem => ({
        id: material.id,
        connectorId: "manual",
        category: material.category,
        title: material.id,
        summary: material.text,
        factualStatement: material.text,
        statementType: material.statementType,
        sourceType: "official",
        sourceName: "Swiss Badminton / Tournamentsoftware",
        publishedAt: "2026-11-15T00:00:00.000Z",
        retrievedAt: "2026-11-16T10:00:00.000Z",
        confidence: "high",
        verificationStatus: material.verificationStatus,
        isSelected: true,
        isEditable: false,
        metadata: {},
      }),
    );
    const readiness = assessInterviewBriefReadiness({
      interviewType: "tournament_review",
      questionCount: 5,
      selectedContextItems,
    });

    expect(response.status).toBe(200);
    expect(selectedContextItems).toHaveLength(8);
    expect(selectedContextItems.every((item) =>
      item.statementType === "fact"
      && item.verificationStatus === "verified"
      && item.category === "result"
      && item.isSelected)).toBe(true);
    expect(readiness).toEqual({ ready: true, verifiedAnchorCount: 8, message: null });
  });
});
