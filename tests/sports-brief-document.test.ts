import { describe, expect, it } from "vitest";
import {
  briefCandidateIdFromDocument,
  briefFieldsFromDocument,
  briefSourceFromCandidate,
  buildSportsBriefDocument,
  isSportsBriefDocument,
} from "@/lib/sports-watch/brief-document";
import { SPORTS_BRIEF_ANGLES } from "@/lib/sports-watch/brief-text-generator";
import { validateContentDocumentWriteBody } from "@/lib/content-storage/validation";
import type { SportsWatchBriefCandidate } from "@/types/sports-watch";

const candidate: SportsWatchBriefCandidate = {
  id: "00000000-0000-4000-8000-000000000042",
  athleteId: "athlete-fictif",
  athleteName: "Athlète Fictif",
  sourceName: "Source officielle fictive",
  articleUrl: "https://example.test/match-fictif",
  title: "Club Fictif 82-74 Rival Fictif",
  excerpt: "Résultat collectif vérifié : 82-74.",
  resultKind: "collective_result",
  publicationDate: "2026-11-10T08:00:00.000Z",
  eventDateFrom: "2026-11-09",
  eventDateTo: "2026-11-09",
  collectedAt: "2026-11-10T09:00:00.000Z",
  verificationStatus: "verified",
  adminStatus: "validated",
  provesIndividualParticipation: false,
  verifiedStatistics: [],
  materials: [],
};

const fields = {
  title: "Victoire fictive du Club Fictif",
  lead: "Le Club Fictif s’impose 82-74 face au Rival Fictif, selon la source officielle fictive.",
  body: "Premier paragraphe factuel.\n\nSource : Source officielle fictive — 9 novembre 2026.",
};

describe("sports brief document", () => {
  it("builds a storable brief draft that passes the content storage validation", () => {
    const document = buildSportsBriefDocument({
      id: "brief-test-1",
      now: "2026-11-14T12:00:00.000Z",
      fields,
      angle: SPORTS_BRIEF_ANGLES.result,
      source: briefSourceFromCandidate(candidate),
    });

    expect(() => validateContentDocumentWriteBody({ document })).not.toThrow();
    expect(isSportsBriefDocument(document)).toBe(true);
    expect(document.sections.articleLength).toBe("breve");
    expect(document.sections.usedSources[0]).toMatchObject({
      url: "https://example.test/match-fictif",
    });
    expect(document.sections.usedSources[0].title).toContain("Source officielle fictive");
    expect(document.sections.usedSources[0].title).toContain("vérifiée");
  });

  it("reopens the draft with its fields, angle and Sports Watch source", () => {
    const document = buildSportsBriefDocument({
      id: "brief-test-2",
      now: "2026-11-14T12:00:00.000Z",
      fields,
      angle: SPORTS_BRIEF_ANGLES.result,
      source: briefSourceFromCandidate(candidate),
    });

    expect(briefFieldsFromDocument(document)).toEqual({
      title: fields.title,
      lead: fields.lead,
      body: fields.body,
    });
    expect(briefCandidateIdFromDocument(document)).toBe(candidate.id);
    expect(document.sections.selectedAngle).toEqual({ id: "result", title: "Résultat" });
  });

  it("keeps the version history when updating an existing draft", () => {
    const first = buildSportsBriefDocument({
      id: "brief-test-3",
      now: "2026-11-14T12:00:00.000Z",
      fields,
      angle: SPORTS_BRIEF_ANGLES.result,
      source: briefSourceFromCandidate(candidate),
    });
    const second = buildSportsBriefDocument({
      id: "brief-test-3",
      now: "2026-11-14T13:00:00.000Z",
      fields: { ...fields, title: "Titre modifié" },
      angle: SPORTS_BRIEF_ANGLES.news,
      source: briefSourceFromCandidate(candidate),
      existing: first,
    });

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.versions).toHaveLength(2);
    expect(second.activeVersionId).toBe(second.versions[1].id);
    expect(() => validateContentDocumentWriteBody({ document: second })).not.toThrow();
  });

  it("refuses an incomplete draft", () => {
    expect(() => buildSportsBriefDocument({
      id: "brief-test-4",
      now: "2026-11-14T12:00:00.000Z",
      fields: { ...fields, body: "   " },
      angle: SPORTS_BRIEF_ANGLES.result,
      source: briefSourceFromCandidate(candidate),
    })).toThrowError(/corps de texte/);
  });
});
