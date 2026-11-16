import { describe, expect, it } from "vitest";
import {
  ContentCreationAssistantService,
  createInitialAssistantDraft,
} from "@/services/content-creation-assistant";
import { validateCreationPayload } from "@/services/content-generation/validation";

describe("automatic creation style", () => {
  it("derives style without a selected tone and ignores legacy tone values", () => {
    const draft = createInitialAssistantDraft({ mode: "free", objective: "interview" });
    draft.subject = {
      ...draft.subject,
      type: "person",
      source: "crm",
      id: "liban-maxamed",
      displayName: "Liban Maxamed",
      sport: "Basketball",
    };
    draft.objective.subtypeId = "after_match";
    draft.parameters.interviewAngleId = "after-match-reading";
    draft.parameters.toneId = "";
    draft.parameters.customTone = "";

    const withoutTone = ContentCreationAssistantService.preparePayload({
      context: { mode: "free", objective: "interview" },
      draft,
    });
    expect(withoutTone).not.toBeNull();
    expect(withoutTone?.parameters.toneId).toContain("format written");
    expect(withoutTone?.parameters.toneId).toContain("public Grand public");
    expect(withoutTone?.parameters.toneId).toContain("Lire le match");
    expect(withoutTone?.parameters.toneId).toContain("Voix de journaliste sportif");

    draft.parameters.toneId = "humoristic";
    draft.parameters.customTone = "Ancien ton impose";
    const withLegacyTone = ContentCreationAssistantService.preparePayload({
      context: { mode: "free", objective: "interview" },
      draft,
    });
    expect(withLegacyTone?.parameters.toneId).toBe(withoutTone?.parameters.toneId);
    expect(withLegacyTone?.parameters.toneId).not.toContain("Ancien ton impose");

    const validated = validateCreationPayload({
      ...withLegacyTone,
      parameters: {
        ...withLegacyTone?.parameters,
        toneId: "institutional",
      },
    });
    expect(validated.parameters.toneId).toBe(withoutTone?.parameters.toneId);
  });

  it("derives style from each format, audience and editorial angle", () => {
    const cases = [
      {
        objective: "article" as const,
        subtypeId: "portrait",
        angle: "Le parcours documenté",
        configure: (draft: ReturnType<typeof createInitialAssistantDraft>) => {
          draft.parameters.articleSelectedAngle = "Le parcours documenté";
        },
        expectedFormat: "portrait",
      },
      {
        objective: "publication" as const,
        subtypeId: "",
        angle: "Le collectif après le match",
        configure: (draft: ReturnType<typeof createInitialAssistantDraft>) => {
          draft.parameters.publicationSelectedAngle = "Le collectif après le match";
        },
        expectedFormat: "instagram",
      },
      {
        objective: "reel" as const,
        subtypeId: "",
        angle: "Trois faits en images",
        configure: (draft: ReturnType<typeof createInitialAssistantDraft>) => {
          draft.parameters.reelSelectedAngle = "Trois faits en images";
        },
        expectedFormat: "face_camera",
      },
      {
        objective: "story" as const,
        subtypeId: "",
        angle: "Le score en cinq étapes",
        configure: (draft: ReturnType<typeof createInitialAssistantDraft>) => {
          draft.parameters.storySelectedAngle = "Le score en cinq étapes";
        },
        expectedFormat: "instagram",
      },
    ];

    for (const testCase of cases) {
      const draft = createInitialAssistantDraft({ mode: "free", objective: testCase.objective });
      draft.subject = {
        ...draft.subject,
        type: "person",
        source: "temporary",
        displayName: "Athlète Exemple",
      };
      draft.objective.subtypeId = testCase.subtypeId;
      draft.parameters.toneId = "";
      draft.parameters.customTone = "";
      testCase.configure(draft);

      const payload = ContentCreationAssistantService.preparePayload({
        context: { mode: "free", objective: testCase.objective },
        draft,
      });
      expect(payload).not.toBeNull();
      expect(payload?.parameters.toneId).toContain(`format ${testCase.expectedFormat}`);
      expect(payload?.parameters.toneId).toContain("public Grand public");
      expect(payload?.parameters.toneId).toContain(testCase.angle);
    }
  });

  it("keeps complete editor-verified after-match perspectives and rejects partial ones", () => {
    const draft = createInitialAssistantDraft({ mode: "free", objective: "interview" });
    draft.subject = {
      ...draft.subject,
      type: "person",
      source: "temporary",
      displayName: "Athlète Exemple",
    };
    draft.objective.subtypeId = "after_match";
    draft.parameters.afterMatchRanking = {
      value: "3e de NL1 Men",
      asOfDate: "2026-11-16",
      source: "Classement officiel fictif",
    };
    draft.parameters.afterMatchNextFixture = {
      opponent: "Adversaire fictif",
      date: "2026-11-22",
      competition: "NL1 Men",
      source: "Calendrier officiel fictif",
    };

    const payload = ContentCreationAssistantService.preparePayload({
      context: { mode: "free", objective: "interview" },
      draft,
    });
    if (!payload) throw new Error("Payload interview attendu");
    expect(payload?.parameters.afterMatchClosingFacts).toEqual({
      ranking: {
        ...draft.parameters.afterMatchRanking,
        verificationStatus: "verified",
      },
      nextFixture: {
        ...draft.parameters.afterMatchNextFixture,
        verificationStatus: "verified",
      },
    });
    expect(validateCreationPayload(payload).parameters.afterMatchClosingFacts)
      .toEqual(payload?.parameters.afterMatchClosingFacts);

    const forgedVerification = validateCreationPayload({
      ...payload,
      parameters: {
        ...payload?.parameters,
        afterMatchClosingFacts: {
          ranking: {
            value: "3e de NL1 Men",
            asOfDate: "2026-11-16",
            source: "Classement officiel fictif",
            verificationStatus: "verified",
          },
        },
      },
    });
    expect(forgedVerification.parameters.afterMatchClosingFacts?.ranking?.verificationStatus)
      .toBe("verified");

    expect(() => validateCreationPayload({
      ...payload,
      parameters: {
        ...payload?.parameters,
        afterMatchClosingFacts: {
          ranking: {
            value: "3e de NL1 Men",
            asOfDate: "",
            source: "",
            verificationStatus: "verified",
          },
        },
      },
    })).toThrow("Le classement facultatif exige le rang, la date et la source");
  });
});
