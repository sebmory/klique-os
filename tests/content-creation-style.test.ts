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
});
