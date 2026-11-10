import { describe, expect, it, vi } from "vitest";
import {
  FOOTSTATS_MANUAL_SOURCE_LABEL,
  SportsWatchManualEntryConflictError,
  createSportsWatchManualEntryService,
} from "@/lib/sports-watch/manual-entry-service";
import type {
  SportsWatchManualEntryCandidateInput,
  SportsWatchRepository,
} from "@/lib/sports-watch/repository";
import type {
  SportsWatchCandidate,
  SportsWatchParticipationStatus,
} from "@/types/sports-watch";

const identity = {
  workspaceId: "workspace-a",
  clerkUserId: "admin-a",
};

const athletes = [{
  key: "footballer",
  athleteId: "footballer",
  name: "Joueuse Football",
  sport: "Football",
  club: "FC Test",
  status: "Actif",
}, {
  key: "basketballer",
  athleteId: "basketballer",
  name: "Joueuse Basketball",
  sport: "Basketball",
  club: "BC Test",
  status: "Actif",
}, {
  key: "fighter",
  athleteId: "fighter",
  name: "Athlète Combat",
  sport: "Judo",
  club: "Dojo Test",
  status: "Actif",
}, {
  key: "inactive",
  athleteId: "inactive",
  name: "Athlète Inactif",
  sport: "Football",
  club: "FC Test",
  status: "Inactif",
}];

const candidateFromInput = (
  input: SportsWatchManualEntryCandidateInput,
): SportsWatchCandidate => ({
  id: input.id,
  athleteId: input.athlete.id,
  athleteName: input.athlete.name,
  sourceName: input.sourceName,
  sourceUrl: input.sourceUrl,
  articleUrl: input.articleUrl,
  title: input.title,
  excerpt: input.excerpt,
  resultKind: input.resultKind,
  publicationDate: null,
  eventDateFrom: input.eventDate,
  eventDateTo: input.eventDate,
  collectedAt: input.collectedAt,
  attributionStatus: "matched",
  attributionEvidence: input.attributionEvidence,
  verificationStatus: "unverified",
  adminStatus: input.initialStatus,
  supersedesCandidateId: null,
  version: 1,
  manualEntry: input.metadata,
});

const createMemoryRepository = () => {
  const records: Array<{
    workspaceId: string;
    idempotencyKey: string;
    logicalKey: string;
    contentHash: string;
    candidate: SportsWatchCandidate;
    actor: string;
  }> = [];
  const nearby: Array<{
    workspaceId: string;
    athleteId: string;
    eventDate: string;
    candidate: SportsWatchCandidate;
    sourceKey: string;
  }> = [];
  const methods = {
    async getManualEntryByIdempotency(workspaceId: string, idempotencyKey: string) {
      const record = records.find((item) =>
        item.workspaceId === workspaceId && item.idempotencyKey === idempotencyKey);
      return record
        ? { candidate: record.candidate, contentHash: record.contentHash }
        : null;
    },
    async getExactManualEntry(
      workspaceId: string,
      athleteId: string,
      logicalKey: string,
      contentHash: string,
    ) {
      return records.find((item) =>
        item.workspaceId === workspaceId
        && item.candidate.athleteId === athleteId
        && item.logicalKey === logicalKey
        && item.contentHash === contentHash)?.candidate ?? null;
    },
    async listManualEntryDuplicates(
      workspaceId: string,
      athleteId: string,
      eventDate: string,
    ) {
      return [
        ...nearby.filter((item) =>
          item.workspaceId === workspaceId
          && item.athleteId === athleteId
          && item.eventDate === eventDate),
        ...records.filter((item) =>
          item.workspaceId === workspaceId
          && item.candidate.athleteId === athleteId
          && item.candidate.eventDateFrom === eventDate)
          .map((item) => ({
            workspaceId: item.workspaceId,
            athleteId: item.candidate.athleteId,
            eventDate: item.candidate.eventDateFrom!,
            candidate: item.candidate,
            sourceKey: "manual-entry",
          })),
      ].map(({ candidate, sourceKey }) => ({ candidate, sourceKey }));
    },
    async createManualEntry(input: {
      workspaceId: string;
      clerkUserId: string;
      candidate: SportsWatchManualEntryCandidateInput;
    }) {
      const duplicate = records.some((item) =>
        item.workspaceId === input.workspaceId
        && (
          item.idempotencyKey === input.candidate.idempotencyKey
          || (
            item.candidate.athleteId === input.candidate.athlete.id
            && item.logicalKey === input.candidate.logicalKey
            && item.contentHash === input.candidate.contentHash
          )
        ));
      if (duplicate) return null;
      const candidate = candidateFromInput(input.candidate);
      records.push({
        workspaceId: input.workspaceId,
        idempotencyKey: input.candidate.idempotencyKey,
        logicalKey: input.candidate.logicalKey,
        contentHash: input.candidate.contentHash,
        candidate,
        actor: input.clerkUserId,
      });
      return candidate;
    },
  };
  return {
    repository: methods as unknown as SportsWatchRepository,
    records,
    nearby,
    createManualEntry: vi.spyOn(methods, "createManualEntry"),
  };
};

const baseRequest = (overrides: Record<string, unknown> = {}) => ({
  athleteId: "footballer",
  eventDate: "2026-11-12",
  newsType: "result_match",
  title: "Victoire du FC Test",
  summary: "Le FC Test remporte la rencontre.",
  competition: null,
  opponent: null,
  score: null,
  source: null,
  sourceReference: null,
  internalNote: null,
  initialStatus: "pending",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  football: null,
  basketball: null,
  statistics: [],
  allowPotentialDuplicate: false,
  ...overrides,
});

const createService = (
  repository: SportsWatchRepository,
  getAthletes: (admin: typeof identity) => Promise<typeof athletes> = async () => athletes,
) => createSportsWatchManualEntryService({
  repository,
  getAthletes,
  now: () => new Date("2026-11-13T10:00:00.000Z"),
});

describe("sports watch manual entry service", () => {
  it("creates a complete Footstats football candidate with explicit unofficial provenance", async () => {
    const memory = createMemoryRepository();
    const result = await createService(memory.repository).create(baseRequest({
      source: "Footstats Pro",
      sourceReference: "https://footstats.ch/player/abc",
      internalNote: "Contrôler la feuille de match.",
      initialStatus: "validated",
      football: {
        team: "FC Test",
        participationStatus: "starter",
        minutes: 90,
        goals: 1,
        assists: 0,
        yellowCards: 1,
        redCards: 0,
        opponent: "FC Adverse",
        score: "2-1",
        competition: "Championnat test",
        footstatsReference: "match-42",
        footstatsPlayerId: "player-42",
        footstatsTeamId: "team-7",
      },
    }), identity);

    expect(result.created).toBe(true);
    expect(result.candidate).toMatchObject({
      sourceName: FOOTSTATS_MANUAL_SOURCE_LABEL,
      adminStatus: "validated",
      verificationStatus: "unverified",
      sourceUrl: "https://footstats.ch/player/abc",
      manualEntry: {
        mode: "manual_entry",
        source: "Footstats Pro",
        internalNote: "Contrôler la feuille de match.",
        football: {
          participationStatus: "starter",
          minutes: 90,
          goals: 1,
          assists: 0,
          redCards: 0,
          footstatsPlayerId: "player-42",
          footstatsTeamId: "team-7",
        },
      },
    });

    expect(result.candidate.excerpt).not.toContain("Contrôler la feuille de match");
    expect(result.candidate.excerpt).toContain("source tierce non officielle");
    expect(memory.records[0]).toMatchObject({
      workspaceId: "workspace-a",
      actor: "admin-a",
    });
  });

  it("derives Footstats provenance from Footstats metadata and rejects a conflicting source", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);
    const footstatsRequest = baseRequest({
      source: null,
      football: {
        participationStatus: "unknown",
        footstatsPlayerId: "player-42",
      },
    });
    const result = await service.create(footstatsRequest, identity);
    expect(result.candidate).toMatchObject({
      sourceName: FOOTSTATS_MANUAL_SOURCE_LABEL,
      manualEntry: { source: "Footstats Pro" },
    });

    await expect(service.create({
      ...footstatsRequest,
      source: "Source officielle du club",
      idempotencyKey: "12121212-1212-4212-8212-121212121212",
    }, identity)).rejects.toThrow("doit utiliser la source « Footstats Pro »");
  });

  it("creates required-only input and preserves absent numbers as null", async () => {
    const memory = createMemoryRepository();
    const result = await createService(memory.repository).create(baseRequest({
      football: {
        team: null,
        participationStatus: "unknown",
        minutes: null,
        goals: null,
        assists: null,
        yellowCards: null,
        redCards: null,
        opponent: null,
        score: null,
        competition: null,
        footstatsReference: null,
        footstatsPlayerId: null,
        footstatsTeamId: null,
      },
    }), identity);

    expect(result.candidate.adminStatus).toBe("pending");
    expect(result.candidate.manualEntry?.football).toMatchObject({
      minutes: null,
      goals: null,
      assists: null,
      yellowCards: null,
      redCards: null,
    });
    expect(result.candidate.excerpt).not.toContain("Minutes jouées :");
  });

  it("preserves explicitly entered zero values", async () => {
    const memory = createMemoryRepository();
    const result = await createService(memory.repository).create(baseRequest({
      football: {
        team: null,
        participationStatus: "entered",
        minutes: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        opponent: null,
        score: null,
        competition: null,
        footstatsReference: null,
        footstatsPlayerId: null,
        footstatsTeamId: null,
      },
    }), identity);

    expect(result.candidate.manualEntry?.football).toMatchObject({
      minutes: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
    });
    expect(result.candidate.excerpt).toContain("Minutes jouées : 0.");
  });

  it.each([
    ["starter", 90],
    ["entered", 18],
    ["unused_substitute", null],
    ["unknown", null],
  ] satisfies Array<[SportsWatchParticipationStatus, number | null]>)(
    "accepts the football participation state %s",
    async (participationStatus, minutes) => {
      const memory = createMemoryRepository();
      const result = await createService(memory.repository).create(baseRequest({
        football: {
          team: null,
          participationStatus,
          minutes,
          goals: null,
          assists: null,
          yellowCards: null,
          redCards: null,
          opponent: null,
          score: null,
          competition: null,
          footstatsReference: null,
          footstatsPlayerId: null,
          footstatsTeamId: null,
        },
      }), identity);
      expect(result.candidate.manualEntry?.football?.participationStatus)
        .toBe(participationStatus);
    },
  );

  it("rejects ambiguous participation flags and incompatible minutes", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);
    await expect(service.create(baseRequest({
      football: {
        participationStatus: "unused_substitute",
        minutes: 12,
      },
    }), identity)).rejects.toThrow("Les minutes exigent une participation");
    await expect(service.create(baseRequest({
      football: {
        participationStatus: "starter",
        starter: true,
        entered: true,
      },
    }), identity)).rejects.toThrow("champ non reconnu");
    expect(memory.createManualEntry).not.toHaveBeenCalled();
  });

  it("creates basketball statistics without inventing missing values", async () => {
    const memory = createMemoryRepository();
    const result = await createService(memory.repository).create(baseRequest({
      athleteId: "basketballer",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      football: null,
      basketball: {
        starter: true,
        minutes: 31,
        points: 0,
        rebounds: 8,
        assists: null,
        steals: 2,
        blocks: null,
      },
    }), identity);
    expect(result.candidate.manualEntry?.basketball).toEqual({
      starter: true,
      minutes: 31,
      points: 0,
      rebounds: 8,
      assists: null,
      steals: 2,
      blocks: null,
    });
  });

  it("creates bounded custom statistics and rejects arbitrary structures or HTML", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);
    const result = await service.create(baseRequest({
      athleteId: "fighter",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      football: null,
      statistics: [{ label: "Classement", value: "2", unit: "place" }],
    }), identity);
    expect(result.candidate.manualEntry?.statistics).toEqual([
      { label: "Classement", value: "2", unit: "place" },
    ]);

    await expect(service.create(baseRequest({
      title: "<b>Titre</b>",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    }), identity)).rejects.toThrow("HTML");
    await expect(service.create(baseRequest({
      athleteId: "fighter",
      football: null,
      statistics: [{ label: "Rang", value: "1", payload: {} }],
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
    }), identity)).rejects.toThrow("champ non reconnu");
  });

  it("rejects inactive, absent, cross-workspace athletes and invalid URLs", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);
    await expect(service.create(baseRequest({ athleteId: "inactive" }), identity))
      .rejects.toThrow("athlète actif");
    await expect(service.create(baseRequest({ athleteId: "missing" }), identity))
      .rejects.toThrow("introuvable dans cet espace");
    await expect(createService(
      memory.repository,
      async (admin) => admin.workspaceId === "workspace-a" ? athletes : [],
    ).create(baseRequest(), { ...identity, workspaceId: "workspace-b" }))
      .rejects.toThrow("introuvable dans cet espace");
    await expect(service.create(baseRequest({
      sourceReference: "ftp://example.com/file",
    }), identity)).rejects.toThrow("uniquement une URL HTTP(S)");
  });

  it("is idempotent for a repeated request and exact repeated form", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory.repository);
    const first = await service.create(baseRequest(), identity);
    const replay = await service.create(baseRequest(), identity);
    const exact = await service.create(baseRequest({
      idempotencyKey: "66666666-6666-4666-8666-666666666666",
    }), identity);

    expect(first.created).toBe(true);
    expect(replay).toEqual({ candidate: first.candidate, created: false });
    expect(exact).toEqual({ candidate: first.candidate, created: false });
    expect(memory.createManualEntry).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation when a nearby automatic candidate exists", async () => {
    const memory = createMemoryRepository();
    memory.nearby.push({
      workspaceId: "workspace-a",
      athleteId: "footballer",
      eventDate: "2026-11-12",
      sourceKey: "safv",
      candidate: {
        ...candidateFromInput({
          id: "77777777-7777-4777-8777-777777777777",
          athlete: {
            id: "footballer",
            name: "Joueuse Football",
            sport: "Football",
            club: "FC Test",
          },
          sourceName: "SAFV",
          sourceUrl: "https://example.com",
          articleUrl: "https://example.com/match",
          title: "FC Test - FC Adverse",
          excerpt: "Match : FC Test 2-1 FC Adverse.",
          resultKind: "collective_result",
          eventDate: "2026-11-12",
          collectedAt: "2026-11-12T12:00:00.000Z",
          attributionEvidence: [],
          initialStatus: "pending",
          logicalKey: "auto",
          contentHash: "auto",
          metadata: {
            mode: "manual_entry",
            newsType: "result_match",
            competition: null,
            opponent: null,
            score: null,
            source: null,
            sourceReference: null,
            internalNote: null,
            football: null,
            basketball: null,
            statistics: [],
          },
          idempotencyKey: "77777777-7777-4777-8777-777777777777",
        }),
        manualEntry: null,
      },
    });
    const service = createService(memory.repository);
    const request = baseRequest({
      opponent: "FC Adverse",
      score: "2-1",
    });

    await expect(service.create(request, identity)).rejects
      .toBeInstanceOf(SportsWatchManualEntryConflictError);
    const result = await service.create({
      ...request,
      allowPotentialDuplicate: true,
    }, identity);
    expect(result.created).toBe(true);
  });
});
