import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContentCreationAssistantService,
  createInitialAssistantDraft,
} from "@/services/content-creation-assistant";
import { validateCreationPayload } from "@/services/content-generation/validation";
import { buildContentGenerationRequest } from "@/services/content-intelligence/context-builder";
import { assessInterviewBriefReadiness } from "@/services/content-intelligence/interview-preparation";
import { activeContextConnectors } from "@/services/context-intelligence/connectors";
import type { EditorialContextCollectionStore } from "@/services/context-intelligence/collection-service";
import { validateContextCollectionRequest } from "@/services/context-intelligence/request-validation";
import { prepareEditorialGeneration } from "@/services/editorial-generation/server-context";
import {
  buildTournamentInterviewMaterials,
  buildTournamentSituation,
  extractSportsWatchCandidateIds,
} from "@/services/tournament-interview";
import type { ContextItem } from "@/types/context-intelligence";
import type {
  SportsWatchCandidate,
  SportsWatchInterviewTournament,
} from "@/types/sports-watch";

const mocks = vi.hoisted(() => ({
  requireContentAccess: vi.fn(),
  collect: vi.fn(),
  createCollection: vi.fn(),
  projectCollection: vi.fn((response) => response),
  getInterviewCandidates: vi.fn(),
}));

vi.mock("@/lib/content-storage/access", () => ({
  requireContentAccess: mocks.requireContentAccess,
  contentAccessErrorResponse: vi.fn(() => null),
}));

vi.mock("@/services/context-intelligence/collector", () => ({
  collectContextIntelligence: mocks.collect,
  toContextCollectionErrorResponse: vi.fn((error) => ({
    ok: false,
    code: "INVALID_CONTEXT_REQUEST",
    message: error instanceof Error ? error.message : "error",
  })),
}));

vi.mock("@/services/context-intelligence/editorial-athlete-projection", () => ({
  readEditorialAthleteProjection: vi.fn().mockResolvedValue({
    id: "athlete-1",
    displayName: "Antoine Majeux",
    sport: "Badminton",
    club: "BC Bulle",
    biography: "",
    communicationObjectives: [],
    publishedFacts: [],
  }),
}));

vi.mock("@/services/context-intelligence/collection-service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/context-intelligence/collection-service")>(),
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
    const tournament: SportsWatchInterviewTournament = {
      id: `athlete-1|Swiss Badminton / Tournamentsoftware|sb.tournamentsoftware.com|${tournamentId}`,
      tournamentId,
      title: "30e BULL'MINTON CUP",
      sourceName: "Swiss Badminton / Tournamentsoftware",
      sourceUrl: `https://sb.tournamentsoftware.com/sport/tournament.aspx?id=${tournamentId}`,
      eventDateFrom: "2026-11-15",
      eventDateTo: "2026-11-15",
      coveragePartial: false,
      coverageNote: null,
      allCandidateIds: candidateIds,
      disciplines: [{
        discipline: "simple",
        matches: candidates.map((candidate, index) => ({
          candidateId: candidate.id,
          title: candidate.title,
          discipline: "simple",
          tableau: `SM${index + 1}`,
          round: "Poule",
          partner: null,
          opponents: `Adversaire ${index + 1}`,
          outcome: index % 2 === 0 ? "victory" : "defeat",
          outcomeLabel: index % 2 === 0 ? "Victoire" : "Défaite",
          athleteScore: "15-10, 15-12",
          eventDate: candidate.eventDateFrom,
          sourceName: candidate.sourceName,
          sourceUrl: candidate.articleUrl,
          verificationStatus: candidate.verificationStatus,
          materials: [],
        })),
      }],
    };
    const uiMaterials = buildTournamentInterviewMaterials(tournament, candidateIds);
    const sportsWatchCandidateIds = extractSportsWatchCandidateIds(uiMaterials);
    const collectionBody = {
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
      manualEditorialMaterials: uiMaterials,
      sportsWatchCandidateIds,
    };
    const validatedCollectionRequest = validateContextCollectionRequest(collectionBody);
    mocks.getInterviewCandidates.mockResolvedValue(candidates);
    mocks.collect.mockImplementation(async (request) => {
      const manualResult = await activeContextConnectors.manual.collect(request);
      return {
        ok: true,
        items: manualResult.items,
        reports: [],
        summary: {
          totalItemsFound: manualResult.items.length,
          selectedItemsCount: manualResult.items.filter((item) => item.isSelected).length,
          externalSourcesCount: 0,
          researchedAt: "2026-11-16T10:00:00.000Z",
          dateRange: request.dateRange,
          warnings: [],
        },
      };
    });

    const response = await POST(new Request("http://localhost/api/context/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(collectionBody),
    }));
    const collection = await response.json() as { items: ContextItem[] };
    const selectedContextItems = collection.items.filter((item) => item.isSelected);
    const draft = createInitialAssistantDraft({ mode: "free", objective: "interview" });
    draft.subject = {
      ...draft.subject,
      type: "person",
      source: "crm",
      id: "athlete-1",
      displayName: "Antoine Majeux",
      sport: "Badminton",
      clubOrOrganization: "BC Bulle",
    };
    draft.objective = { objective: "interview", subtypeId: "tournament_review" };
    draft.parameters.questionCountId = "q8";
    draft.parameters.tournamentSituation = buildTournamentSituation(tournament, candidateIds);
    const generationPayload = ContentCreationAssistantService.preparePayload({
      context: { mode: "free", objective: "interview" },
      draft,
      contextCollectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      selectedContextItems,
    });
    const validatedGenerationPayload = validateCreationPayload(generationPayload);
    const access = {
      clerkUserId: "user-1",
      workspaceId: "workspace-server",
      mediaId: "11111111-1111-4111-8111-111111111111",
      role: "media" as const,
      isAdmin: false,
    };
    const storedCollection = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: access.workspaceId,
      clerkUserId: access.clerkUserId,
      role: access.role,
      mediaId: access.mediaId,
      items: selectedContextItems,
      reports: [],
      summary: {
        totalItemsFound: 8,
        selectedItemsCount: 8,
        externalSourcesCount: 1,
        researchedAt: "2026-11-16T10:00:00.000Z",
        dateRange: { preset: "last_30_days" as const, from: "2026-10-17", to: "2026-11-16" },
        warnings: [],
      },
      createdAt: "2026-11-16T10:00:00.000Z",
      expiresAt: "2026-11-16T10:30:00.000Z",
    };
    const store: EditorialContextCollectionStore = {
      create: vi.fn(),
      getById: vi.fn().mockResolvedValue(storedCollection),
    };
    const prepared = await prepareEditorialGeneration({
      contextSelection: {
        collectionId: validatedGenerationPayload.parameters.contextIntelligence.collectionId,
        selectedItemIds: validatedGenerationPayload.parameters.contextIntelligence.selectedItemIds,
        manualEdits: validatedGenerationPayload.parameters.contextIntelligence.manualEdits,
      },
      subject: validatedGenerationPayload.subject,
      target: { type: "interview", interviewType: "tournament_review" },
      access,
      store,
      now: new Date("2026-11-16T10:10:00.000Z"),
    });
    validatedGenerationPayload.parameters.contextIntelligence.selectedContextItems = prepared.selectedItems;
    const { request: generationRequest } = await buildContentGenerationRequest(
      validatedGenerationPayload,
      access,
      prepared.selection.modelContext,
    );
    if (generationRequest.requestType !== "interview") {
      throw new Error("La requête génération attendue doit être une interview.");
    }
    const readiness = assessInterviewBriefReadiness({
      interviewType: generationRequest.brief.interviewType,
      questionCount: generationRequest.brief.questionCount,
      selectedContextItems: generationRequest.selectedContextItems,
    });

    expect(response.status).toBe(200);
    expect(uiMaterials.every((item) =>
      item.statementType === "fact"
      && item.verificationStatus === "verified"
      && item.category === "result")).toBe(true);
    expect(sportsWatchCandidateIds).toEqual(candidateIds);
    expect(validatedCollectionRequest.manualEditorialMaterials?.every((item) =>
      item.statementType === undefined
      && item.verificationStatus === undefined
      && item.category === undefined)).toBe(true);
    expect(selectedContextItems).toHaveLength(8);
    expect(selectedContextItems.every((item) =>
      item.statementType === "fact"
      && item.verificationStatus === "verified"
      && item.category === "result"
      && item.isSelected)).toBe(true);
    expect(readiness).toEqual({ ready: true, verifiedAnchorCount: 8, message: null });
  });
});
