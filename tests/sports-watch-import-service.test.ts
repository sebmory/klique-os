import { describe, expect, it, vi } from "vitest";
import { createSportsWatchImportService } from "@/lib/sports-watch/import-service";
import {
  SportsWatchImportRepository,
  type SportsWatchImportRecord,
} from "@/lib/sports-watch/import-repository";
import type { Athlete } from "@/types/athlete";
import type {
  SportsWatchCandidate,
  SportsWatchImportExtraction,
} from "@/types/sports-watch";

const identity = (workspaceId: string) => ({
  workspaceId,
  clerkUserId: `admin-${workspaceId}`,
});

const athlete = {
  key: "football-test",
  athleteId: "football-test",
  name: "Joueur Football",
  sport: "Football",
  club: "FC Test",
} as Athlete;

const extraction: SportsWatchImportExtraction = {
  sourceName: "Feuille officielle",
  documentDate: "2026-10-25",
  documentDateEvidence: "Document publié le 25/10/2026",
  matchDate: "2026-10-24",
  matchDateEvidence: "Match du 24/10/2026",
  competition: "Championnat test",
  participantA: "FC Test",
  participantB: "FC Exemple",
  score: "2-1",
  resultKind: "collective_result",
  individualParticipationExplicit: false,
  individualEvidence: "N° 12 — Min 02:42 ; PTS 1",
  individualStatistics: [{
    label: "Minutes",
    value: "02:42",
    evidence: "N° 12 — Min 02:42 ; PTS 1",
  }],
  warnings: ["Participation individuelle non visible."],
};

describe("sports watch import service", () => {
  it("isolates workspaces, requires human-safe attribution and confirms idempotently", async () => {
    type CreateInput = Parameters<typeof SportsWatchImportRepository.create>[0];
    type SaveExtractionInput = Parameters<typeof SportsWatchImportRepository.saveExtraction>[0];
    type ConfirmInput = Parameters<typeof SportsWatchImportRepository.confirm>[0];
    const records = new Map<string, SportsWatchImportRecord>();
    const candidates = new Map<string, SportsWatchCandidate>();
    const repository = {
      create: vi.fn(async (input: CreateInput) => {
        const imported: SportsWatchImportRecord = {
          id: "11111111-1111-4111-8111-111111111111",
          workspaceId: input.workspaceId,
          athleteId: athlete.athleteId!,
          athleteName: athlete.name,
          athleteSport: athlete.sport,
          athleteClub: athlete.club,
          originalFilename: input.file.originalFilename,
          contentType: input.file.contentType,
          sizeBytes: input.file.sizeBytes,
          contentHash: input.file.contentHash,
          blobPathname: input.file.pathname,
          fileHref: "/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/file",
          status: "uploaded" as const,
          extraction: null,
          extractionProvider: null,
          extractionModel: null,
          extractedAt: null,
          candidateId: null,
          version: 1,
        };
        records.set(`${input.workspaceId}:${imported.id}`, imported);
        return { imported, created: true };
      }),
      getByHash: vi.fn(),
      get: vi.fn(async (workspaceId: string, importId: string) =>
        records.get(`${workspaceId}:${importId}`) ?? null),
      saveExtraction: vi.fn(async (input: SaveExtractionInput) => {
        const key = `${input.workspaceId}:${input.importId}`;
        const current = records.get(key);
        if (!current) throw new Error("fixture import missing");
        const imported: SportsWatchImportRecord = {
          ...current,
          status: "extracted" as const,
          extraction: input.extraction,
          extractionProvider: input.provider,
          extractionModel: input.model,
          extractedAt: "2026-10-26T10:00:00.000Z",
          version: 2,
        };
        records.set(key, imported);
        return imported;
      }),
      confirm: vi.fn(async (input: ConfirmInput) => {
        const key = `${input.workspaceId}:${input.importId}`;
        const current = records.get(key);
        if (!current) throw new Error("fixture import missing");
        const candidate: SportsWatchCandidate = {
          id: input.candidate.id,
          athleteId: current.athleteId,
          athleteName: current.athleteName,
          sourceName: input.candidate.sourceName,
          sourceUrl: input.candidate.sourceUrl,
          articleUrl: input.candidate.sourceUrl,
          title: input.candidate.title,
          excerpt: input.candidate.excerpt,
          resultKind: input.candidate.resultKind,
          publicationDate: input.candidate.publicationDate,
          eventDateFrom: input.candidate.eventDate,
          eventDateTo: input.candidate.eventDate,
          collectedAt: input.candidate.collectedAt,
          attributionStatus: "matched",
          attributionEvidence: input.candidate.attributionEvidence,
          verificationStatus: "unverified",
          adminStatus: "pending",
          supersedesCandidateId: null,
          version: 1,
        };
        candidates.set(candidate.id, candidate);
        records.set(key, {
          ...current,
          status: "confirmed",
          candidateId: candidate.id,
          version: 3,
        });
        return candidate;
      }),
    };
    const extract = vi.fn(async () => ({
      extraction,
      provider: "fixture",
      model: "fixture-vision",
      providerResponseId: "fixture-response",
    }));
    const service = createSportsWatchImportService({
      repository,
      getAthletes: async () => [athlete],
      uploadFile: vi.fn(async () => ({
        pathname: "sports-watch-imports/fixture.pdf",
        originalFilename: "fixture.pdf",
        contentType: "application/pdf",
        sizeBytes: 1200,
        contentHash: "fixture-hash",
      })),
      deleteFile: vi.fn(),
      readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
      extract,
      getCandidate: vi.fn(async (workspaceId, candidateId) =>
        workspaceId === "workspace-a" ? candidates.get(candidateId) ?? null : null),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    const uploaded = await service.upload(
      athlete.athleteId,
      new File(["fixture"], "fixture.pdf", { type: "application/pdf" }),
      identity("workspace-a"),
    );
    await expect(service.get(uploaded.id, identity("workspace-b")))
      .rejects.toThrow("introuvable dans cet espace");

    const extracted = await service.extract(uploaded.id, uploaded.version, identity("workspace-a"));
    expect(extract).toHaveBeenCalledTimes(1);

    await expect(service.confirm(
      extracted.id,
      extracted.version,
      {
        ...extraction,
        resultKind: "participation",
        individualParticipationExplicit: false,
      },
      identity("workspace-a"),
    )).rejects.toThrow("preuve explicite");

    await expect(service.confirm(
      extracted.id,
      extracted.version,
      {
        ...extraction,
        score: "71",
      },
      identity("workspace-a"),
    )).rejects.toThrow("deux scores opposés");

    const first = await service.confirm(
      extracted.id,
      extracted.version,
      extraction,
      identity("workspace-a"),
    );
    expect(first.candidate).toMatchObject({
      adminStatus: "pending",
      verificationStatus: "unverified",
      sourceUrl: "/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/file",
    });
    expect(first.candidate.excerpt).toContain(
      "Résultat collectif — participation individuelle non vérifiée.",
    );
    expect(first.candidate.excerpt).toContain(
      "Propositions statistiques non attribuées : Minutes : 02:42.",
    );
    expect(first.candidate.excerpt).toContain(
      "Preuves des statistiques dans le document : N° 12 — Min 02:42 ; PTS 1.",
    );
    expect(first.candidate.attributionEvidence).toContain(
      "Les statistiques visibles sont conservées comme propositions non attribuées à confirmer.",
    );

    const second = await service.confirm(
      extracted.id,
      extracted.version,
      extraction,
      identity("workspace-a"),
    );
    expect(second.candidate.id).toBe(first.candidate.id);
    expect(repository.confirm).toHaveBeenCalledTimes(1);
  });
});
