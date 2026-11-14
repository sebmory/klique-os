import { describe, expect, it } from "vitest";
import {
  SPORTS_BRIEF_ANGLES,
  availableBriefAngles,
  generateSportsBriefText,
  sanitizeVerifiedExcerpt,
} from "@/lib/sports-watch/brief-text-generator";
import type { SportsWatchBriefCandidate } from "@/types/sports-watch";

// Données fictives équivalentes au cas réel : un résultat collectif vérifié dont
// la piste « 21 points » n’est pas attribuée individuellement.
const briefCandidate = (
  overrides: Partial<SportsWatchBriefCandidate> = {},
): SportsWatchBriefCandidate => {
  const base: SportsWatchBriefCandidate = {
    id: "00000000-0000-4000-8000-000000000001",
    athleteId: "athlete-fictif",
    athleteName: "Athlète Fictif",
    sourceName: "Source officielle fictive",
    articleUrl: "https://example.test/match-fictif",
    title: "Club Fictif 82-74 Rival Fictif",
    excerpt: "Résultat collectif — participation individuelle non vérifiée. Score tel qu’affiché : 82-74. Propositions statistiques non attribuées : Points : 21. Preuves des statistiques dans le document : feuille de match fictive.",
    resultKind: "collective_result",
    publicationDate: "2026-11-10T08:00:00.000Z",
    eventDateFrom: "2026-11-09",
    eventDateTo: "2026-11-09",
    collectedAt: "2026-11-10T09:00:00.000Z",
    verificationStatus: "verified",
    adminStatus: "validated",
    provesIndividualParticipation: false,
    verifiedStatistics: [],
    materials: [{
      id: "sports-watch-00000000-0000-4000-8000-000000000001-1",
      kind: "note",
      text: "Résultat collectif vérifié : 82-74.",
      provenance: "Source officielle fictive · Événement : 09.11.2026 · Vérification factuelle : vérifiée",
      sourceDate: "2026-11-09",
      sourceType: "external",
      verificationStatus: "verified",
      statementType: "fact",
      category: "result",
      sourceUrl: "https://example.test/match-fictif",
    }],
  };
  return { ...base, ...overrides };
};

describe("sports brief text generator", () => {
  it("offers no angle and refuses generation without verified facts", () => {
    const unverified = briefCandidate({
      verificationStatus: "unverified",
      materials: [{
        ...briefCandidate().materials[0],
        verificationStatus: "unverified",
        statementType: "editorial_lead",
      }],
    });

    expect(availableBriefAngles(unverified)).toEqual([]);
    expect(() => generateSportsBriefText(unverified, "news"))
      .toThrowError(/faits vérifiés/);
  });

  it("keeps unattributed statistics out of angles and generated text", () => {
    const candidate = briefCandidate();
    const angles = availableBriefAngles(candidate);

    expect(angles.map((angle) => angle.id)).toEqual(["result", "news"]);
    expect(angles.some((angle) => angle.id === "performance")).toBe(false);

    const draft = generateSportsBriefText(candidate, "result");
    const fullText = `${draft.title}\n${draft.lead}\n${draft.body}`;
    expect(fullText).not.toContain("21");
    expect(fullText).not.toContain("Propositions statistiques");
    expect(draft.body).toContain("82-74");
    expect(draft.body).toContain("Source : Source officielle fictive");
    expect(draft.lead).toContain("Athlète Fictif");
  });

  it("offers the individual performance angle only with verified statistics", () => {
    const candidate = briefCandidate({
      resultKind: "individual_result",
      excerpt: "Résultat individuel explicitement attribué. Statistiques individuelles confirmées : Points : 18 ; Rebonds : 7.",
      provesIndividualParticipation: true,
      verifiedStatistics: [
        { label: "Points", value: "18" },
        { label: "Rebonds", value: "7" },
      ],
      materials: [{
        ...briefCandidate().materials[0],
        text: "Résultat individuel vérifié : 18 points, 7 rebonds.",
      }],
    });

    const angles = availableBriefAngles(candidate);
    expect(angles.map((angle) => angle.id)).toEqual(["result", "performance", "news"]);

    const draft = generateSportsBriefText(candidate, "performance");
    expect(draft.title).toContain("18 points");
    expect(draft.lead).toContain("selon Source officielle fictive");
    expect(draft.body).toContain("Statistiques vérifiées : Points : 18 ; Rebonds : 7.");
  });

  it("strips unattributed proposals and document evidence from the verified excerpt", () => {
    const sanitized = sanitizeVerifiedExcerpt(briefCandidate().excerpt);

    expect(sanitized).toContain("Score tel qu’affiché : 82-74.");
    expect(sanitized).not.toContain("Propositions statistiques");
    expect(sanitized).not.toContain("Preuves des statistiques");
  });

  it("describes each angle with a title and an intent", () => {
    for (const angle of Object.values(SPORTS_BRIEF_ANGLES)) {
      expect(angle.title.length).toBeGreaterThan(0);
      expect(angle.intent.length).toBeGreaterThan(0);
    }
  });
});
