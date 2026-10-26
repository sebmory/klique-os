import { describe, expect, it, vi } from "vitest";
import {
  createSportsWatchService,
  type SportsWatchAdminIdentity,
} from "@/lib/sports-watch/service";
import type {
  CollectedSportsWatchCandidate,
} from "@/lib/sports-watch/bcbulle-collector";
import type { SportsWatchRepository } from "@/lib/sports-watch/repository";
import type { Athlete } from "@/types/athlete";
import type {
  IwwfBinding,
  SportsWatchCandidate,
  SwissBadmintonBinding,
} from "@/types/sports-watch";

const identity = (workspaceId: string): SportsWatchAdminIdentity => ({
  workspaceId,
  clerkUserId: `admin-${workspaceId}`,
});

const athlete = {
  key: "antoine-majeux",
  athleteId: "antoine-majeux",
  name: "Antoine Majeux",
  sport: "Badminton",
  club: "BC Bulle",
} as Athlete;

const swissVerification = (selectedAthlete = athlete, playerId = "206063") => ({
  athlete: {
    id: selectedAthlete.athleteId!,
    name: selectedAthlete.name,
    sport: selectedAthlete.sport,
    club: selectedAthlete.club,
  },
  officialIdentity: {
    profileUrl: `https://sb.tournamentsoftware.com/player-profile/00000000-0000-4000-8000-${playerId.padStart(12, "0")}`,
    profileUuid: `00000000-0000-4000-8000-${playerId.padStart(12, "0")}`,
    playerId,
    name: selectedAthlete.name,
    club: selectedAthlete.club,
  },
  clubComparison: "matching" as const,
  evidence: [`Identifiant joueur ${playerId}.`],
  verifiedAt: "2026-10-26T10:00:00.000Z",
});

const iwwfAthlete = {
  key: "giuliano-muret",
  athleteId: "giuliano-muret",
  name: "Giuliano Muret",
  sport: "Wakesurf",
  club: "Aloha Wake à Estavayer-le-Lac",
} as Athlete;

const iwwfVerification = (selectedAthlete = iwwfAthlete, officialAthleteId = "SUI982014944") => ({
  athlete: {
    id: selectedAthlete.athleteId!,
    name: selectedAthlete.name,
    sport: selectedAthlete.sport,
    club: selectedAthlete.club,
  },
  officialIdentity: {
    profileUrl: `https://ems.iwwf.sport/Athletes/Profile/${officialAthleteId}`,
    athleteId: officialAthleteId,
    name: selectedAthlete.name,
    birthYear: 2015,
  },
  evidence: [`Identifiant athlète IWWF ${officialAthleteId}.`],
  verifiedAt: "2026-10-26T10:00:00.000Z",
});

const collectedCandidate = (contentHash: string, excerpt: string): CollectedSportsWatchCandidate => ({
  sourceKey: "bc-bulle",
  athlete: {
    id: athlete.athleteId!,
    name: athlete.name,
    sport: athlete.sport,
    club: athlete.club,
  },
  sourceName: "Badminton Club Bulle",
  sourceUrl: "https://bcbulle.ch/feed/",
  articleUrl: "https://bcbulle.ch/resultats-seen-turnier/",
  title: "Résultats : Seen-Turnier",
  excerpt,
  resultKind: "individual_result",
  publicationDate: "2026-10-20T15:26:03.000Z",
  eventDateFrom: "2026-10-18",
  eventDateTo: "2026-10-18",
  collectedAt: "2026-10-26T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: [
    "Nom complet présent dans la publication officielle de Badminton Club Bulle.",
    "Le sport CRM concorde avec le badminton.",
    "Le club CRM concorde avec BC Bulle.",
  ],
  logicalKey: "logical-key",
  contentHash,
});

const createMemoryRepository = (): SportsWatchRepository => {
  const records: Array<{
    workspaceId: string;
    logicalKey: string;
    contentHash: string;
    candidate: SportsWatchCandidate;
  }> = [];
  let sequence = 0;
  let runActive = false;
  const bindings: Array<{ workspaceId: string; binding: SwissBadmintonBinding }> = [];
  const iwwfBindings: Array<{ workspaceId: string; binding: IwwfBinding }> = [];

  return {
    async startRun() {
      if (runActive) return null;
      runActive = true;
      return "11111111-1111-4111-8111-111111111111";
    },
    async completeRun() {
      runActive = false;
    },
    async failRun() {
      runActive = false;
    },
    async saveCandidates(workspaceId, candidates) {
      let created = 0;
      for (const item of candidates) {
        if (records.some((record) =>
          record.workspaceId === workspaceId
          && record.candidate.athleteId === item.athlete.id
          && record.logicalKey === item.logicalKey
          && record.contentHash === item.contentHash)) {
          continue;
        }
        const previous = records
          .filter((record) =>
            record.workspaceId === workspaceId
            && record.candidate.athleteId === item.athlete.id
            && record.logicalKey === item.logicalKey)
          .at(-1);
        sequence += 1;
        records.push({
          workspaceId,
          logicalKey: item.logicalKey,
          contentHash: item.contentHash,
          candidate: {
            id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
            athleteId: item.athlete.id,
            athleteName: item.athlete.name,
            sourceName: item.sourceName,
            sourceUrl: item.sourceUrl,
            articleUrl: item.articleUrl,
            title: item.title,
            excerpt: item.excerpt,
            resultKind: item.resultKind,
            publicationDate: item.publicationDate,
            eventDateFrom: item.eventDateFrom,
            eventDateTo: item.eventDateTo,
            collectedAt: item.collectedAt,
            attributionStatus: item.attributionStatus,
            attributionEvidence: item.attributionEvidence,
            verificationStatus: "unverified",
            adminStatus: "pending",
            supersedesCandidateId: previous?.candidate.id ?? null,
            version: 1,
          },
        });
        created += 1;
      }
      return created;
    },
    async listCandidates(workspaceId) {
      return records.filter((record) => record.workspaceId === workspaceId).map((record) => record.candidate);
    },
    async reviewCandidate(input) {
      const record = records.find((item) =>
        item.workspaceId === input.workspaceId
        && item.candidate.id === input.candidateId
        && item.candidate.version === input.expectedVersion);
      if (!record) return null;
      record.candidate = {
        ...record.candidate,
        adminStatus: input.status,
        version: record.candidate.version + 1,
      };
      return record.candidate;
    },
    async getValidatedCandidate(workspaceId, candidateId) {
      return records.find((record) =>
        record.workspaceId === workspaceId
        && record.candidate.id === candidateId
        && record.candidate.adminStatus === "validated")?.candidate ?? null;
    },
    async listSwissBindings(workspaceId) {
      return bindings
        .filter((record) => record.workspaceId === workspaceId)
        .map((record) => record.binding);
    },
    async getActiveSwissBinding(workspaceId, athleteId) {
      return bindings.find((record) =>
        record.workspaceId === workspaceId
        && record.binding.athleteId === athleteId
        && record.binding.active)?.binding ?? null;
    },
    async saveSwissBinding(input) {
      const existing = bindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.verification.athlete.id);
      if (existing && existing.binding.version !== input.expectedVersion) return null;
      const duplicate = bindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId !== input.verification.athlete.id
        && record.binding.active
        && (
          record.binding.officialIdentity.playerId === input.verification.officialIdentity.playerId
          || record.binding.officialIdentity.profileUuid === input.verification.officialIdentity.profileUuid
        ));
      if (duplicate) throw Object.assign(new Error("duplicate"), { code: "23505" });
      const binding: SwissBadmintonBinding = {
        id: existing?.binding.id ?? `10000000-0000-4000-8000-${String(bindings.length + 1).padStart(12, "0")}`,
        athleteId: input.verification.athlete.id,
        officialIdentity: input.verification.officialIdentity,
        clubComparison: input.verification.clubComparison,
        evidence: input.verification.evidence,
        verifiedAt: input.verification.verifiedAt,
        confirmedAt: input.confirmedAt,
        active: true,
        disabledAt: null,
        version: existing ? existing.binding.version + 1 : 1,
      };
      if (existing) existing.binding = binding;
      else bindings.push({ workspaceId: input.workspaceId, binding });
      return binding;
    },
    async disableSwissBinding(input) {
      const existing = bindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.athleteId
        && record.binding.active
        && record.binding.version === input.expectedVersion);
      if (!existing) return null;
      existing.binding = {
        ...existing.binding,
        active: false,
        disabledAt: "2026-10-26T10:00:00.000Z",
        version: existing.binding.version + 1,
      };
      return existing.binding;
    },
    async listIwwfBindings(workspaceId) {
      return iwwfBindings
        .filter((record) => record.workspaceId === workspaceId)
        .map((record) => record.binding);
    },
    async getActiveIwwfBinding(workspaceId, athleteId) {
      return iwwfBindings.find((record) =>
        record.workspaceId === workspaceId
        && record.binding.athleteId === athleteId
        && record.binding.active)?.binding ?? null;
    },
    async saveIwwfBinding(input) {
      const existing = iwwfBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.verification.athlete.id);
      if (existing && existing.binding.version !== input.expectedVersion) return null;
      const duplicate = iwwfBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId !== input.verification.athlete.id
        && record.binding.active
        && (
          record.binding.officialIdentity.athleteId === input.verification.officialIdentity.athleteId
          || record.binding.officialIdentity.profileUrl === input.verification.officialIdentity.profileUrl
        ));
      if (duplicate) throw Object.assign(new Error("duplicate"), { code: "23505" });
      const binding: IwwfBinding = {
        id: existing?.binding.id ?? `20000000-0000-4000-8000-${String(iwwfBindings.length + 1).padStart(12, "0")}`,
        athleteId: input.verification.athlete.id,
        officialIdentity: input.verification.officialIdentity,
        evidence: input.verification.evidence,
        verifiedAt: input.verification.verifiedAt,
        confirmedAt: input.confirmedAt,
        active: true,
        disabledAt: null,
        version: existing ? existing.binding.version + 1 : 1,
      };
      if (existing) existing.binding = binding;
      else iwwfBindings.push({ workspaceId: input.workspaceId, binding });
      return binding;
    },
    async disableIwwfBinding(input) {
      const existing = iwwfBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.athleteId
        && record.binding.active
        && record.binding.version === input.expectedVersion);
      if (!existing) return null;
      existing.binding = {
        ...existing.binding,
        active: false,
        disabledAt: "2026-10-26T10:00:00.000Z",
        version: existing.binding.version + 1,
      };
      return existing.binding;
    },
  };
};

describe("sports watch service", () => {
  it("verifies, confirms and injects an IWWF binding into the shared collector flow", async () => {
    const repository = createMemoryRepository();
    const collectIwwf = vi.fn(async () => ({
      candidates: [{
        ...collectedCandidate("iwwf-hash", "Tour : Final. Score explicite : 36,67."),
        sourceKey: "iwwf-wakesurf",
        athlete: {
          id: iwwfAthlete.athleteId!,
          name: iwwfAthlete.name,
          sport: iwwfAthlete.sport,
          club: iwwfAthlete.club,
        },
        sourceName: "IWWF Event Management System",
        sourceUrl: iwwfVerification().officialIdentity.profileUrl,
        articleUrl: "https://ems.iwwf.sport/Competitions/Details/official",
      }],
      scannedCount: 1,
      recentCount: 1,
    }));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [iwwfAthlete],
      collectors: { "iwwf-wakesurf": collectIwwf },
      verifyIwwfProfile: vi.fn(async () => iwwfVerification()),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await expect(service.run(
      "iwwf-wakesurf",
      iwwfAthlete.athleteId,
      identity("workspace-a"),
    )).rejects.toThrow("Configurez et confirmez");

    const binding = await service.confirmIwwfBinding(
      iwwfAthlete.athleteId,
      iwwfVerification().officialIdentity.profileUrl,
      0,
      identity("workspace-a"),
    );
    const result = await service.run(
      "iwwf-wakesurf",
      iwwfAthlete.athleteId,
      identity("workspace-a"),
    );

    expect(binding).toMatchObject({
      athleteId: "giuliano-muret",
      active: true,
      officialIdentity: { athleteId: "SUI982014944" },
    });
    expect(collectIwwf).toHaveBeenCalledWith(
      expect.objectContaining({ id: "giuliano-muret" }),
      expect.objectContaining({
        iwwfProfile: expect.objectContaining({ athleteId: "SUI982014944" }),
      }),
    );
    expect(result).toMatchObject({
      sourceName: "IWWF Event Management System",
      sourceUrl: iwwfVerification().officialIdentity.profileUrl,
      createdCount: 1,
    });
    const candidate = await service.review(
      result.candidates[0].id,
      "validated",
      result.candidates[0].version,
      identity("workspace-a"),
    );
    const prefill = await service.buildArticlePrefill(candidate.id, identity("workspace-a"));
    expect(prefill).toMatchObject({
      athleteId: "giuliano-muret",
      verificationStatus: "unverified",
      material: {
        text: "Tour : Final. Score explicite : 36,67.",
      },
    });
    expect(prefill.material.provenance).toContain(
      "https://ems.iwwf.sport/Competitions/Details/official",
    );

    await service.disableIwwfBinding(
      iwwfAthlete.athleteId,
      binding.version,
      identity("workspace-a"),
    );
    await expect(service.run(
      "iwwf-wakesurf",
      iwwfAthlete.athleteId,
      identity("workspace-a"),
    )).rejects.toThrow("Configurez et confirmez");
    expect(await service.list(identity("workspace-a"))).toEqual([
      expect.objectContaining({ id: candidate.id, adminStatus: "validated" }),
    ]);
    expect(await service.listIwwfBindings(identity("workspace-b"))).toEqual([]);
  });

  it("uses the server-selected collector and run key", async () => {
    const repository = createMemoryRepository();
    const startRun = vi.spyOn(repository, "startRun");
    const collectSwiss = vi.fn(async () => ({
      candidates: [{
        ...collectedCandidate("swiss-hash", "Résultat officiel Swiss Badminton."),
        sourceKey: "swiss-badminton",
        sourceName: "Swiss Badminton / Tournamentsoftware",
        sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
        articleUrl: "https://sb.tournamentsoftware.com/sport/draw.aspx?id=official&draw=1",
      }],
      scannedCount: 1,
      recentCount: 1,
    }));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      collectors: { "swiss-badminton": collectSwiss },
      verifySwissProfile: vi.fn(async () => swissVerification()),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await service.run("swiss-badminton", athlete.athleteId, identity("workspace-a"));

    expect(collectSwiss).toHaveBeenCalledOnce();
    expect(collectSwiss).toHaveBeenCalledWith(
      expect.objectContaining({ id: "antoine-majeux" }),
      expect.objectContaining({
        swissProfile: expect.objectContaining({ playerId: "206063" }),
      }),
    );
    expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a",
      sourceKey: "swiss-badminton",
      athleteId: "antoine-majeux",
    }));
  });

  it("deduplicates an identical result and creates a pending successor for a modified result", async () => {
    const repository = createMemoryRepository();
    let current = collectedCandidate("hash-v1", "Antoine Majeux termine à la 2ème place.");
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      collectors: {
        "bc-bulle": async () => ({ candidates: [current], scannedCount: 1, recentCount: 1 }),
      },
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    const first = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    expect(first.createdCount).toBe(1);
    const firstCandidate = first.candidates[0];
    await service.review(firstCandidate.id, "validated", firstCandidate.version, identity("workspace-a"));

    const duplicate = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    expect(duplicate.createdCount).toBe(0);

    current = collectedCandidate("hash-v2", "Antoine Majeux termine à la 1ère place.");
    const modified = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    expect(modified.createdCount).toBe(1);
    expect(modified.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstCandidate.id, adminStatus: "validated" }),
      expect.objectContaining({
        excerpt: "Antoine Majeux termine à la 1ère place.",
        adminStatus: "pending",
        supersedesCandidateId: firstCandidate.id,
      }),
    ]));
  });

  it("reconstructs a faithful Article material only for a validated candidate in the same workspace", async () => {
    const repository = createMemoryRepository();
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      collectors: {
        "bc-bulle": async () => ({
          candidates: [collectedCandidate("hash-v1", "Antoine Majeux termine à la 2ème place.")],
          scannedCount: 1,
          recentCount: 1,
        }),
      },
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });
    const run = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    const candidate = await service.review(
      run.candidates[0].id,
      "validated",
      run.candidates[0].version,
      identity("workspace-a"),
    );

    const prefill = await service.buildArticlePrefill(candidate.id, identity("workspace-a"));
    expect(prefill).toMatchObject({
      candidateId: candidate.id,
      athleteId: "antoine-majeux",
      verificationStatus: "unverified",
      material: {
        kind: "note",
        text: "Antoine Majeux termine à la 2ème place.",
        sourceDate: "2026-10-18",
      },
    });
    expect(prefill.material.provenance).toContain("https://bcbulle.ch/resultats-seen-turnier/");
    expect(prefill.material.provenance).toContain("Vérification factuelle : non vérifiée");

    await expect(service.buildArticlePrefill(candidate.id, identity("workspace-b")))
      .rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps distinct verified profiles isolated by athlete and workspace", async () => {
    const repository = createMemoryRepository();
    const secondAthlete = {
      ...athlete,
      key: "second-athlete",
      athleteId: "second-athlete",
      name: "Deuxième Athlète",
      club: "Autre Club",
    } as Athlete;
    const verifySwissProfile = vi.fn(async (selected: {
      id: string;
      name: string;
      sport: string;
      club: string;
    }) => swissVerification(
      selected.id === athlete.athleteId ? athlete : secondAthlete,
      selected.id === athlete.athleteId ? "206063" : "306064",
    ));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete, secondAthlete],
      verifySwissProfile,
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification(athlete, "206063").officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await service.confirmSwissBinding(
      secondAthlete.athleteId,
      swissVerification(secondAthlete, "306064").officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );

    expect(await service.listSwissBindings(identity("workspace-a"))).toHaveLength(2);
    expect(await service.listSwissBindings(identity("workspace-b"))).toEqual([]);
    await expect(service.run(
      "swiss-badminton",
      athlete.athleteId,
      identity("workspace-b"),
    )).rejects.toThrow("Configurez et confirmez");
  });

  it("rejects a duplicate active official profile in the same workspace", async () => {
    const repository = createMemoryRepository();
    const secondAthlete = {
      ...athlete,
      key: "second-athlete",
      athleteId: "second-athlete",
      name: "Deuxième Athlète",
    } as Athlete;
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete, secondAthlete],
      verifySwissProfile: vi.fn(async (selected) => ({
        ...swissVerification(athlete, "206063"),
        athlete: selected,
        officialIdentity: {
          ...swissVerification(athlete, "206063").officialIdentity,
          name: selected.name,
        },
      })),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await expect(service.confirmSwissBinding(
      secondAthlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "206063",
      0,
      identity("workspace-a"),
    )).rejects.toMatchObject({ code: "conflict" });
  });

  it("disables and re-verifies a binding without deleting historical candidates", async () => {
    const repository = createMemoryRepository();
    const verifySwissProfile = vi.fn(async () => swissVerification());
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      verifySwissProfile,
      collectors: {
        "swiss-badminton": async () => ({
          candidates: [{
            ...collectedCandidate("swiss-history", "Résultat Swiss historique."),
            sourceKey: "swiss-badminton",
          }],
          scannedCount: 1,
          recentCount: 1,
        }),
      },
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    const active = await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await service.run("swiss-badminton", athlete.athleteId, identity("workspace-a"));
    const disabled = await service.disableSwissBinding(
      athlete.athleteId,
      active.version,
      identity("workspace-a"),
    );

    expect(disabled.active).toBe(false);
    expect(await service.list(identity("workspace-a"))).toEqual([
      expect.objectContaining({ excerpt: "Résultat Swiss historique." }),
    ]);
    await expect(service.run(
      "swiss-badminton",
      athlete.athleteId,
      identity("workspace-a"),
    )).rejects.toThrow("Configurez et confirmez");

    const reactivated = await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "206063",
      disabled.version,
      identity("workspace-a"),
    );
    expect(reactivated.active).toBe(true);
    expect(verifySwissProfile).toHaveBeenCalledTimes(2);
  });
});
