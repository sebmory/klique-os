import { describe, expect, it } from "vitest";
import {
  clearInterviewSubjectContext,
  ContentCreationAssistantService,
  createInitialAssistantDraft,
} from "@/services/content-creation-assistant";
import { resolveInterviewPromptVersion } from "@/services/content-intelligence/config";
import { buildContentGenerationRequest } from "@/services/content-intelligence/context-builder";
import { assessInterviewBriefReadiness } from "@/services/content-intelligence/interview-preparation";
import { buildContentPrompt } from "@/services/content-intelligence/prompt-builder";
import { interviewTemplateV1 } from "@/services/content-intelligence/templates";
import {
  buildTournamentInterviewMaterials,
  buildTournamentSituation,
} from "@/services/tournament-interview";
import type { ContextItem } from "@/types/context-intelligence";
import type {
  SportsWatchInterviewTournament,
  SportsWatchInterviewTournamentMatch,
} from "@/types/sports-watch";

const tournamentId = "6A6DB828-DFA1-481D-8AF4-A3ECD66C80B3";
const sourceUrl = `https://sb.tournamentsoftware.com/sport/draw.aspx?id=${tournamentId}`;

const match = (
  candidateId: string,
  discipline: SportsWatchInterviewTournamentMatch["discipline"],
  tableau: string,
  opponents: string,
  athleteScore: string,
  outcome: "victory" | "defeat",
  eventDate: string,
  partner: string | null = null,
): SportsWatchInterviewTournamentMatch => ({
  candidateId,
  title: `30e BULL'MINTON CUP — ${tableau}`,
  discipline,
  tableau,
  round: "Poule",
  partner,
  opponents,
  outcome,
  outcomeLabel: outcome === "victory" ? "Victoire" : "Défaite",
  athleteScore,
  eventDate,
  sourceName: "Swiss Badminton / Tournamentsoftware",
  sourceUrl: `${sourceUrl}&draw=${tableau}`,
  verificationStatus: "unverified",
  materials: [],
});

const matches = [
  match("ca6333df-4e0b-47c0-aa22-f276a4f1bb5e", "simple", "SM1-2", "Gaëtan BOUTHORS", "16-14, 8-15, 13-15", "defeat", "2026-11-15"),
  match("b044a2a5-7d26-43a9-b7f2-abf5da0e436e", "simple", "SM1-2", "Dima POCHTIENNYKH", "16-14, 7-15, 15-3", "victory", "2026-11-15"),
  match("8b9bdb97-a0d6-4b33-a63b-63412f480077", "simple", "SM1-2", "Alexandre GILLIÉRON", "8-15, 6-15", "defeat", "2026-11-15"),
  match("84c5a8e1-644e-4c2b-865c-06164f9883c9", "simple", "SM1-2", "Jérémie ROSSIER", "7-15, 7-15", "defeat", "2026-11-15"),
  match("df0fe133-535f-4df4-a738-ec26ada5d78e", "mixte", "XD3-17", "Chloé STRITT et Kevin SCHINDLER", "15-9, 15-12", "victory", "2026-11-14", "Noelia KLIMASZEWSKI"),
  match("dab688c7-a1ab-44fe-ae7a-dd612f2d6aef", "double", "DM1-19", "Jan ROUILLER et Quentin STÖCKLI", "13-15, 5-15", "defeat", "2026-11-14", "Maël FELLAY"),
  match("bceae21e-f1e8-4d2f-8f5e-837fa0cda742", "mixte", "XD3-17", "Annie PYTHON et Lucas BOSSEL", "15-13, 8-15, 11-15", "defeat", "2026-11-14", "Noelia KLIMASZEWSKI"),
  match("81bdac15-5b08-4945-9118-617d4c7c7dd2", "mixte", "XD3-17", "Laura ECOFFEY et Samuel GREMAUD", "12-15, 15-7, 18-16", "victory", "2026-11-14", "Noelia KLIMASZEWSKI"),
];

const tournament: SportsWatchInterviewTournament = {
  id: `Swiss Badminton / Tournamentsoftware|sb.tournamentsoftware.com|${tournamentId}`,
  tournamentId,
  title: "30e BULL'MINTON CUP",
  sourceName: "Swiss Badminton / Tournamentsoftware",
  sourceUrl,
  eventDateFrom: "2026-11-14",
  eventDateTo: "2026-11-15",
  coveragePartial: false,
  coverageNote: null,
  allCandidateIds: matches.map((item) => item.candidateId),
  disciplines: [
    { discipline: "simple", matches: matches.filter((item) => item.discipline === "simple") },
    { discipline: "double", matches: matches.filter((item) => item.discipline === "double") },
    { discipline: "mixte", matches: matches.filter((item) => item.discipline === "mixte") },
  ],
};

const toContextItem = (
  material: ReturnType<typeof buildTournamentInterviewMaterials>[number],
): ContextItem => ({
  id: material.id,
  connectorId: "manual",
  category: material.category ?? "result",
  title: material.provenance,
  summary: material.text,
  factualStatement: material.text,
  statementType: material.statementType ?? "editorial_lead",
  sourceType: material.sourceType ?? "external",
  sourceName: material.provenance,
  sourceUrl: material.sourceUrl,
  publishedAt: material.sourceDate,
  retrievedAt: "2026-11-16T10:00:00.000Z",
  confidence: "high",
  verificationStatus: material.verificationStatus ?? "unverified",
  isSelected: true,
  isEditable: false,
  metadata: { factKey: material.factKey ?? "" },
});

describe("Interview tournament review", () => {
  it("selects all eight Bull’Minton Cup matches", () => {
    const materials = buildTournamentInterviewMaterials(tournament, tournament.allCandidateIds);

    expect(materials).toHaveLength(8);
    expect(new Set(materials.map((item) => item.id))).toEqual(
      new Set(tournament.allCandidateIds.map((candidateId) => `sports-watch-tournament-${candidateId}`)),
    );
  });

  it("creates eight verified anchors and a structured tournament situation", () => {
    const materials = buildTournamentInterviewMaterials(tournament, tournament.allCandidateIds);
    const contextItems = materials.map(toContextItem);
    const situation = buildTournamentSituation(tournament, tournament.allCandidateIds);
    const readiness = assessInterviewBriefReadiness({
      interviewType: "tournament_review",
      questionCount: 5,
      selectedContextItems: contextItems,
    });

    expect(readiness).toEqual({ ready: true, verifiedAnchorCount: 8, message: null });
    expect(new Set(materials.map((item) => item.factKey)).size).toBe(8);
    expect(materials.every((item) =>
      item.category === "result"
      && item.statementType === "fact"
      && item.verificationStatus === "verified")).toBe(true);
    expect(situation.matches.every((item) => item.verificationStatus === "verified")).toBe(true);
    expect(situation).toMatchObject({
      frame: "tournament_review",
      tournamentId,
      tournamentName: "30e BULL'MINTON CUP",
    });
    expect(situation.matches).toHaveLength(8);
    expect(new Set(situation.matches.map((item) => item.discipline))).toEqual(
      new Set(["simple", "double", "mixte"]),
    );
  });

  it("builds the v12 tournament prompt across all disciplines without collective perspectives", async () => {
    const materials = buildTournamentInterviewMaterials(tournament, tournament.allCandidateIds);
    const contextItems = materials.map(toContextItem);
    const draft = createInitialAssistantDraft({ mode: "free", objective: "interview" });
    draft.subject = {
      ...draft.subject,
      type: "person",
      source: "temporary",
      id: undefined,
      displayName: "Antoine Majeux",
      sport: "Badminton",
      clubOrOrganization: "BC Bulle",
    };
    draft.objective = { objective: "interview", subtypeId: "tournament_review" };
    draft.parameters.questionCountId = "q5";
    draft.parameters.tournamentSituation = buildTournamentSituation(
      tournament,
      tournament.allCandidateIds,
    );
    const payload = ContentCreationAssistantService.preparePayload({
      context: { mode: "free", objective: "interview" },
      draft,
      selectedContextItems: contextItems,
    });
    expect(payload).not.toBeNull();
    const { request } = await buildContentGenerationRequest(
      payload!,
      { workspaceId: "workspace-test", role: "admin" },
    );
    const prompt = buildContentPrompt({
      request,
      template: interviewTemplateV1,
      promptVersion: resolveInterviewPromptVersion("tournament_review"),
    });

    expect(prompt).toContain("Prompt version: cie-interview-v12");
    expect(prompt).toContain("simple");
    expect(prompt).toContain("double");
    expect(prompt).toContain("mixte");
    expect(prompt).toContain("exactement 5 questions principales");
    expect(prompt).not.toContain("afterMatchSituation");
    expect(prompt).not.toContain("afterMatchClosingFacts");
    expect(prompt).not.toContain("derniere place");
    expect(prompt).not.toContain("supporters");
  });

  it("clears Camara facts, perspectives and match selection before selecting Antoine", () => {
    const draft = createInitialAssistantDraft({ mode: "free", objective: "interview" });
    draft.parameters.afterMatchMatchFacts = "Camara est entré en jeu contre Naters.";
    draft.parameters.afterMatchRanking = {
      value: "16e et dernier",
      asOfDate: "2026-11-16",
      source: "Classement officiel",
    };
    draft.parameters.afterMatchNextFixture = {
      opponent: "Prochain adversaire",
      date: "2026-11-23",
      competition: "Championnat",
      source: "Calendrier officiel",
    };
    draft.parameters.tournamentSituation = buildTournamentSituation(
      tournament,
      tournament.allCandidateIds,
    );
    draft.parameters.tournamentObjectiveBefore = "Atteindre les finales";
    draft.parameters.requiredTopics = "Conserver ce champ sans rapport";

    const cleared = clearInterviewSubjectContext(draft.parameters);

    expect(cleared.afterMatchMatchFacts).toBe("");
    expect(cleared.afterMatchRanking).toEqual({ value: "", asOfDate: "", source: "" });
    expect(cleared.afterMatchNextFixture).toEqual({
      opponent: "",
      date: "",
      competition: "",
      source: "",
    });
    expect(cleared.tournamentSituation).toBeUndefined();
    expect(cleared.tournamentObjectiveBefore).toBe("");
    expect(cleared.requiredTopics).toBe("Conserver ce champ sans rapport");
  });
});
