import { describe, expect, it } from "vitest";
import {
  createSportsWatchService,
  type SportsWatchAdminIdentity,
} from "@/lib/sports-watch/service";
import type {
  CollectedSportsWatchCandidate,
} from "@/lib/sports-watch/bcbulle-collector";
import type { SportsWatchRepository } from "@/lib/sports-watch/repository";
import type { Athlete } from "@/types/athlete";
import type { SportsWatchCandidate } from "@/types/sports-watch";

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

const collectedCandidate = (contentHash: string, excerpt: string): CollectedSportsWatchCandidate => ({
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
  };
};

describe("sports watch service", () => {
  it("deduplicates an identical result and creates a pending successor for a modified result", async () => {
    const repository = createMemoryRepository();
    let current = collectedCandidate("hash-v1", "Antoine Majeux termine à la 2ème place.");
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      collect: async () => ({ candidates: [current], scannedCount: 1, recentCount: 1 }),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    const first = await service.run(athlete.athleteId, identity("workspace-a"));
    expect(first.createdCount).toBe(1);
    const firstCandidate = first.candidates[0];
    await service.review(firstCandidate.id, "validated", firstCandidate.version, identity("workspace-a"));

    const duplicate = await service.run(athlete.athleteId, identity("workspace-a"));
    expect(duplicate.createdCount).toBe(0);

    current = collectedCandidate("hash-v2", "Antoine Majeux termine à la 1ère place.");
    const modified = await service.run(athlete.athleteId, identity("workspace-a"));
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
      collect: async () => ({
        candidates: [collectedCandidate("hash-v1", "Antoine Majeux termine à la 2ème place.")],
        scannedCount: 1,
        recentCount: 1,
      }),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });
    const run = await service.run(athlete.athleteId, identity("workspace-a"));
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
});
