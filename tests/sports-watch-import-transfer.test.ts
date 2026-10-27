import { describe, expect, it } from "vitest";
import { validateManualEditorialMaterials } from "@/lib/article-creation-drafts/validation";
import {
  buildSportsWatchImportCandidateContent,
} from "@/lib/sports-watch/import-service";
import { buildSportsWatchArticleMaterials } from "@/lib/sports-watch/service";
import milaBenjakBoxScore from "@/tests/fixtures/sports-watch/mila-benjak-box-score.json";
import {
  MANUAL_EDITORIAL_MATERIAL_LIMIT,
  MANUAL_EDITORIAL_TEXT_LIMIT,
} from "@/types/context-intelligence";
import type {
  SportsWatchCandidate,
  SportsWatchImportConfirmation,
} from "@/types/sports-watch";
import type { SportsWatchImportRecord } from "@/lib/sports-watch/import-repository";

describe("sports watch import to Article transfer", () => {
  it("keeps Mila's verified values and produces a valid lossless multi-note Article transfer", () => {
    const imported: SportsWatchImportRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      workspaceId: "workspace-a",
      athleteId: "mila-benjak",
      athleteName: "Mila Benjak",
      athleteSport: "Basketball",
      athleteClub: "BCF Elfic Fribourg",
      originalFilename: "mila-benjak-box-score.png",
      contentType: "image/png",
      sizeBytes: 1200,
      contentHash: "fixture-hash",
      blobPathname: "sports-watch-imports/mila-benjak-box-score.png",
      fileHref: "/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/file",
      status: "extracted",
      extraction: null,
      extractionProvider: "fixture",
      extractionModel: "fixture-vision",
      extractedAt: "2026-10-27T08:00:00.000Z",
      candidateId: null,
      version: 2,
    };
    const confirmation: SportsWatchImportConfirmation = {
      sourceName: milaBenjakBoxScore.sourceName,
      documentDate: milaBenjakBoxScore.documentDate,
      matchDate: milaBenjakBoxScore.matchDate,
      competition: milaBenjakBoxScore.competition,
      participantA: milaBenjakBoxScore.participantA,
      participantB: milaBenjakBoxScore.participantB,
      score: milaBenjakBoxScore.score,
      resultKind: "participation",
      individualParticipationExplicit: true,
      individualEvidence: milaBenjakBoxScore.individualEvidence,
      individualStatistics: milaBenjakBoxScore.individualStatistics,
    };

    const content = buildSportsWatchImportCandidateContent(imported, confirmation);
    expect(content.excerpt).toContain("Points : 1");
    expect(content.excerpt).not.toContain("Points : 0");
    expect(content.excerpt.match(/Preuves des statistiques dans le document/g)).toHaveLength(1);
    expect(content.eventDate).toBe("2026-10-25");

    const legacyLongExcerpt = [
      content.excerpt,
      ...milaBenjakBoxScore.individualStatistics.map((statistic) =>
        `Détail vérifié ${statistic.label} : ${statistic.value}. Preuve originale : ${statistic.evidence}.`),
    ].join(" ");
    expect(legacyLongExcerpt.length).toBeGreaterThan(MANUAL_EDITORIAL_TEXT_LIMIT);

    const candidate: SportsWatchCandidate = {
      id: content.id,
      athleteId: imported.athleteId,
      athleteName: imported.athleteName,
      sourceName: content.sourceName,
      sourceUrl: content.sourceUrl,
      articleUrl: content.sourceUrl,
      title: content.title,
      excerpt: legacyLongExcerpt,
      resultKind: content.resultKind,
      publicationDate: content.publicationDate,
      eventDateFrom: content.eventDate,
      eventDateTo: content.eventDate,
      collectedAt: "2026-10-27T08:00:00.000Z",
      attributionStatus: "matched",
      attributionEvidence: content.attributionEvidence,
      verificationStatus: "unverified",
      adminStatus: "validated",
      supersedesCandidateId: null,
      version: 1,
    };
    const provenance = "FIBA — document privé · Événement : 25 oct. 2026";
    const materials = buildSportsWatchArticleMaterials(
      candidate,
      provenance,
      "2026-10-25",
    );

    expect(materials.length).toBeGreaterThan(1);
    expect(materials.length).toBeLessThanOrEqual(MANUAL_EDITORIAL_MATERIAL_LIMIT);
    expect(materials.every((material) => material.text.length <= MANUAL_EDITORIAL_TEXT_LIMIT))
      .toBe(true);
    expect(materials.every((material) =>
      material.provenance === provenance && material.sourceDate === "2026-10-25"))
      .toBe(true);
    expect(materials.map((material) => material.text).join(" ")).toBe(
      legacyLongExcerpt.trim().split(/\s+/).join(" "),
    );
    expect(validateManualEditorialMaterials(materials)).toEqual(materials);
  });
});
