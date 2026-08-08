import { describe, expect, it } from "vitest";
import { ContentGenerationError } from "@/services/content-generation/errors";
import { shouldRetryGenerationError } from "@/services/content-intelligence/engine";
import { validateContentGenerationJson } from "@/services/content-intelligence/json-validator";
import type { InterviewGenerationResultRaw } from "@/services/content-intelligence/interview-schema";

const buildQuestion = (index: number) => ({
  text: `Question ${index + 1}`,
  purpose: `Objectif ${index + 1}`,
  topic: `Theme ${index + 1}`,
  optional: false as const,
  followUps: [`Relance ${index + 1}A`, `Relance ${index + 1}B`],
});

const buildIdea = (prefix: string, index: number) => ({
  title: `${prefix} ${index + 1}`,
  concept: `${prefix} concept ${index + 1}`,
  suggestedHook: `${prefix} hook ${index + 1}`,
});

const buildValidRaw = (questionCount: number): InterviewGenerationResultRaw => ({
  title: "Interview solide",
  editorialAngle: "Comprendre la progression et les routines",
  introduction: "Introduction concise et factuelle.",
  questions: Array.from({ length: questionCount }, (_, index) => buildQuestion(index)),
  conclusion: "Conclusion claire.",
  reelIdeas: [buildIdea("Reel", 0)],
  storyIdeas: [buildIdea("Story", 0)],
  publicationIdeas: [buildIdea("Publication", 0)],
  metadata: {
    templateId: "interview",
    templateVersion: "v1",
  },
});

const runValidation = (parsedContent: unknown, questionCount: number) => {
  return validateContentGenerationJson({
    parsedContent,
    requestStartedAt: Date.now() - 15,
    provider: "openai",
    model: "test-model",
    templateKey: "interview:v1",
    templateVersion: "v1",
    promptVersion: "cie-interview-v1",
    questionCount,
    missingInformation: [],
  });
};

describe("content intelligence structured validation", () => {
  it("CAS A: accepte une sortie structuree valide avec 15 questions", () => {
    const result = runValidation(buildValidRaw(15), 15);
    expect(result.questions).toHaveLength(15);
    expect(result.questions[0]?.id).toBe("question-1");
    expect(result.metadata.templateId).toBe("interview");
  });

  it("CAS B: rejette questions vides et marque ce cas comme retryable", () => {
    const raw = buildValidRaw(15);
    raw.questions = [];

    let error: unknown;
    try {
      runValidation(raw, 15);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ContentGenerationError);
    const typedError = error as ContentGenerationError;
    expect(typedError.code).toBe("INVALID_PROVIDER_RESPONSE");
    expect(shouldRetryGenerationError(typedError)).toBe(true);
  });

  it("CAS C: rejette un ecart de compte de questions et permet une tentative corrective", () => {
    const raw = buildValidRaw(14);

    let error: unknown;
    try {
      runValidation(raw, 15);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ContentGenerationError);
    const typedError = error as ContentGenerationError;
    expect(typedError.code).toBe("INVALID_PROVIDER_RESPONSE");
    expect(shouldRetryGenerationError(typedError)).toBe(true);
  });

  it("CAS D/E: refusal et sortie vide ont des codes explicites non retryables", () => {
    const refusal = new ContentGenerationError("PROVIDER_REFUSAL", "Refus");
    const empty = new ContentGenerationError("EMPTY_PROVIDER_RESPONSE", "Vide");

    expect(shouldRetryGenerationError(refusal)).toBe(false);
    expect(shouldRetryGenerationError(empty)).toBe(false);
  });

  it("CAS F/G: sortie structuree parsee et acceptee avec questions generiques quand infos factuelles absentes", () => {
    const raw = buildValidRaw(3);
    raw.questions = [
      {
        text: "Quelles sont vos priorites du moment ?",
        purpose: "Explorer les objectifs immediats sans inventer de faits.",
        topic: "Objectifs",
        optional: false,
        followUps: ["Quel indicateur vous montre que vous progressez ?"],
      },
      {
        text: "Comment adaptez-vous votre preparation selon le contexte ?",
        purpose: "Comprendre la methode sans supposer des details non fournis.",
        topic: "Preparation",
        optional: false,
        followUps: ["Quelle partie est la plus difficile a ajuster ?"],
      },
      {
        text: "Quel message souhaitez-vous transmettre a votre audience ?",
        purpose: "Obtenir une conclusion utile meme avec peu de donnees factuelles.",
        topic: "Message",
        optional: false,
        followUps: ["Comment souhaitez-vous que ce message soit recu ?"],
      },
    ];

    const result = runValidation(raw, 3);
    expect(result.questions).toHaveLength(3);
    expect(result.storyIdeas[0]?.concept.length).toBeGreaterThan(0);
  });
});
