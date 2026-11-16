import { describe, expect, it } from "vitest";
import {
  ArticleCreationDraftValidationError,
  validateArticleCreationDraftPayload,
  validateCreateArticleCreationDraftBody,
} from "@/lib/article-creation-drafts/validation";
import {
  ContentCreationAssistantService,
  createInitialAssistantDraft,
} from "@/services/content-creation-assistant";
import type { ArticleCreationDraftPayload } from "@/types/article-creation-draft";

const createPayload = (): ArticleCreationDraftPayload => {
  const draft = createInitialAssistantDraft({ mode: "free", objective: "article" });
  draft.subject = {
    ...draft.subject,
    type: "free_topic",
    source: "temporary",
    displayName: "Alex Exemple",
  };
  return {
    schemaVersion: 1,
    contextKey: "article:alex",
    draft,
    stepId: "parameters",
    contextState: {
      items: [],
      reports: [],
      hasCollected: false,
    },
    articleWorkflow: {
      suggestions: [],
      structures: [],
      selectedStructureId: "",
      choicesNeedReview: false,
    },
  };
};

describe("Article creation draft validation", () => {
  it("accepts a private Article workflow with an exact interview excerpt", () => {
    const payload = createPayload();
    const sourceText = "Alex Exemple : Je termine par vingt lancers.";
    const excerptText = "Je termine par vingt lancers.";
    const start = sourceText.indexOf(excerptText);
    payload.draft.parameters.manualInterviewSource = {
      id: "interview-1",
      provenance: "Entretien fictif",
      sourceDate: "2026-10-21",
      interviewer: "Camille Test",
      interviewee: "Alex Exemple",
      sourceText,
      excerpts: [{
        id: "excerpt-1",
        start,
        end: start + excerptText.length,
        text: excerptText,
        speakerRole: "interviewee",
        confirmed: true,
      }],
    };

    expect(validateArticleCreationDraftPayload(payload)).toEqual(payload);
    expect(validateCreateArticleCreationDraftBody({
      clientCreationId: "11111111-1111-4111-8111-111111111111",
      displayTitle: "Alex Exemple — Portrait",
      payload,
    })).toMatchObject({ payload });
  });

  it("rejects an excerpt that does not match the stored source text", () => {
    const payload = createPayload();
    payload.draft.parameters.manualInterviewSource = {
      id: "interview-1",
      provenance: "Entretien fictif",
      sourceDate: "2026-10-21",
      interviewer: "Camille Test",
      interviewee: "Alex Exemple",
      sourceText: "Texte original",
      excerpts: [{
        id: "excerpt-1",
        start: 0,
        end: 5,
        text: "Autre",
        speakerRole: "interviewee",
        confirmed: true,
      }],
    };

    expect(() => validateArticleCreationDraftPayload(payload)).toThrow(
      /non conforme au texte source/,
    );
  });

  it("accepts an incomplete interview while it is still being drafted", () => {
    const payload = createPayload();
    payload.draft.parameters.manualInterviewSource = {
      id: "interview-1",
      provenance: "",
      sourceDate: "",
      interviewer: "",
      interviewee: "",
      sourceText: "",
      excerpts: [],
    };

    expect(validateArticleCreationDraftPayload(payload)).toEqual(payload);
  });

  it("reopens a legacy tone without migration but ignores it for a new generation", () => {
    const payload = createPayload();
    payload.draft.objective.subtypeId = "portrait";
    payload.draft.parameters.articleSelectedAngle = "Le parcours documenté";
    payload.draft.parameters.toneId = "free";
    payload.draft.parameters.customTone = "Ancien ton dramatique";

    expect(validateArticleCreationDraftPayload(payload)).toEqual(payload);

    const generationPayload = ContentCreationAssistantService.preparePayload({
      context: { mode: "free", objective: "article" },
      draft: payload.draft,
    });
    expect(generationPayload).not.toBeNull();
    expect(generationPayload?.parameters.toneId).toContain("format portrait");
    expect(generationPayload?.parameters.toneId).toContain("Le parcours documenté");
    expect(generationPayload?.parameters.toneId).not.toContain("Ancien ton dramatique");
  });

  it("rejects the total payload when it exceeds the private draft limit", () => {
    const payload = createPayload();
    payload.draft.parameters.additionalContext = "x".repeat(300_000);

    expect(() => validateArticleCreationDraftPayload(payload)).toThrow(
      new ArticleCreationDraftValidationError("Brouillon Article trop volumineux."),
    );
  });
});
