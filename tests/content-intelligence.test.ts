import { describe, expect, it } from "vitest";
import { ContentGenerationError } from "@/services/content-generation/errors";
import { shouldRetryGenerationError } from "@/services/content-intelligence/engine";
import { validateContentGenerationJson } from "@/services/content-intelligence/json-validator";
import type { InterviewGenerationResultRaw } from "@/services/content-intelligence/interview-schema";
import type { InterviewBrief } from "@/types/content-generation";
import type { ContextItem } from "@/types/context-intelligence";

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

const selectedFact = (overrides: Partial<ContextItem>): ContextItem => ({
  id: "fact",
  connectorId: "manual",
  category: "result",
  title: "Fait vérifié",
  summary: "Fait vérifié",
  factualStatement: "Fait vérifié",
  statementType: "fact",
  sourceType: "official",
  sourceName: "Source officielle fictive",
  retrievedAt: "2026-11-16T08:00:00.000Z",
  confidence: "high",
  verificationStatus: "verified",
  isSelected: true,
  isEditable: false,
  metadata: {},
  ...overrides,
});

const libanSelectedFacts = [
  selectedFact({
    id: "match-result",
    factualStatement: "Sion fictif 82-74 Neuchâtel fictif.",
  }),
  selectedFact({
    id: "match-quarters",
    factualStatement: "Q1 25-11, Q2 12-17, Q3 28-18, Q4 17-28.",
  }),
  selectedFact({
    id: "individual-performance",
    category: "performance",
    factualStatement: "Liban Maxamed a inscrit 21 points.",
  }),
];

const runAfterMatchValidation = (
  parsedContent: unknown,
  selectedContextItems: ContextItem[] = libanSelectedFacts,
) => validateContentGenerationJson({
  parsedContent,
  requestStartedAt: Date.now() - 15,
  provider: "openai",
  model: "test-model",
  templateKey: "interview:v1",
  templateVersion: "v1",
  promptVersion: "cie-interview-v2",
  questionCount: 3,
  interviewType: "after_match",
  selectedContextItems,
  missingInformation: [],
});

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

  it("CAS C: rejette toute sortie plus courte que le nombre demande", () => {
    expect(() => runValidation(buildValidRaw(14), 15))
      .toThrow(/15 attendu, 14 recu/);
  });

  it("CAS C bis: rejette une sortie tres courte et permet une tentative corrective", () => {
    const raw = buildValidRaw(2);

    let error: unknown;
    try {
      runValidation(raw, 15);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ContentGenerationError);
    const typedError = error as ContentGenerationError;
    expect(typedError.code).toBe("INVALID_PROVIDER_RESPONSE");
    expect(typedError.message).toContain("15 attendu, 2 recu");
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

  it("accepte le schema sans categorie et conserve une categorie historique si elle existe", () => {
    const raw = buildValidRaw(3);
    delete raw.questions[0].topic;

    const result = runValidation(raw, 3);

    expect(result.questions[0]?.topic).toBe("");
    expect(result.questions[1]?.topic).toBe("Theme 2");
  });

  it("valide la reception Liban quand les 21 points et la fin de match sont dans les questions principales", () => {
    const raw = buildValidRaw(3);
    raw.questions[0].text = "A chaud, comment avez-vous construit cette performance a 21 points ?";
    raw.questions[1].text = "Vous aviez 19 points d avance avant le dernier quart, puis 8 a la fin : comment avez-vous vecu cette fin de match ?";
    raw.questions[2].text = "Quel enseignement gardez-vous de cette victoire 82-74 ?";
    raw.conclusion = "Un mot pour conclure ?";

    expect(runAfterMatchValidation(raw).questions).toHaveLength(3);
  });

  it("refuse la reception Liban si les faits transmis restent absents des questions principales", () => {
    const raw = buildValidRaw(3);
    raw.questions[0].followUps = ["Vous avez marque 21 points : comment ?"];
    raw.questions[1].followUps = ["Pourquoi l ecart est-il passe de 19 a 8 points ?"];

    expect(() => runAfterMatchValidation(raw)).toThrow(/fait de performance individuel verifie doit apparaitre dans une question principale/);

    raw.questions[0].text = "A chaud, comment avez-vous construit cette performance a 21 points ?";
    expect(() => runAfterMatchValidation(raw)).toThrow(/avance de 19 points.*ecart final de 8 points/);
  });

  it("livre exactement 8 questions quand 8 sont demandees", () => {
    const raw = buildValidRaw(8);
    raw.questions[0].text = "Comment avez-vous construit vos 21 points ?";
    raw.questions[1].text = "De plus 19 avant le dernier quart a plus 8 au final, comment avez-vous gere cette fin de match ?";

    const result = validateContentGenerationJson({
      parsedContent: raw,
      requestStartedAt: Date.now() - 15,
      provider: "openai",
      model: "test-model",
      templateKey: "interview:v1",
      templateVersion: "v1",
      promptVersion: "cie-interview-v3",
      questionCount: 8,
      interviewType: "after_match",
      selectedContextItems: libanSelectedFacts,
      missingInformation: [],
    });

    expect(result.questions).toHaveLength(8);
    expect(result.metadata.questionCountRequested).toBe(8);
    expect(result.metadata.questionCountGenerated).toBe(8);
  });

  it("impose les deux sujets de fin renseignes uniquement dans les questions principales", () => {
    const closingFacts: InterviewBrief["afterMatchClosingFacts"] = {
      ranking: {
        value: "3e de NL1 Men",
        asOfDate: "2026-11-16",
        source: "Classement fourni",
        verificationStatus: "unverified",
        retainedFrom: "manual_brief",
        requiredMention: "3e",
      },
      nextFixture: {
        opponent: "Lausanne Basket",
        date: "2026-11-22",
        competition: "NL1 Men",
        source: "Calendrier fourni",
        verificationStatus: "unverified",
        retainedFrom: "manual_brief",
        requiredMention: "Lausanne Basket",
      },
    };
    const validateEight = (
      raw: InterviewGenerationResultRaw,
      afterMatchClosingFacts?: InterviewBrief["afterMatchClosingFacts"],
    ) => validateContentGenerationJson({
      parsedContent: raw,
      requestStartedAt: Date.now() - 15,
      provider: "openai",
      model: "test-model",
      templateKey: "interview:v1",
      templateVersion: "v1",
      promptVersion: "cie-interview-v6",
      questionCount: 8,
      interviewType: "after_match",
      selectedContextItems: libanSelectedFacts,
      afterMatchClosingFacts,
      missingInformation: [],
    });

    const accepted = buildValidRaw(8);
    accepted.questions[0].text = "Comment avez-vous construit vos 21 points ?";
    accepted.questions[1].text = "De plus 19 avant le dernier quart a plus 8 au final, comment avez-vous vecu cette fin de match ?";
    accepted.questions[6].text = "Sion est 3e de NL1 Men : qu est-ce que cette place change dans vos ambitions ?";
    accepted.questions[7].text = "Vous affrontez Lausanne Basket au prochain match : quel sera l enjeu principal ?";
    expect(validateEight(accepted, closingFacts).questions).toHaveLength(8);

    const omitted = buildValidRaw(8);
    omitted.questions[0].text = "Comment avez-vous construit vos 21 points ?";
    omitted.questions[1].text = "De plus 19 avant le dernier quart a plus 8 au final, comment avez-vous vecu cette fin de match ?";
    omitted.questions[7].text = "Quelle priorite retenez-vous pour la suite ?";
    expect(() => validateEight(omitted, closingFacts))
      .toThrow(/classement obligatoire doit citer 3e dans une question principale/);
    expect(validateEight(omitted).questions).toHaveLength(8);
  });

  it("rejette les reserves conditionnelles dans les questions principales", () => {
    const raw = buildValidRaw(3);
    raw.questions[0].text = "Si le succes est confirme, qu est-ce que cette victoire change ?";

    expect(() => runValidation(raw, 3))
      .toThrow(/reserve conditionnelle/);
  });

  it("suit un autre fait de performance sans imposer une question sur le dernier quart", () => {
    const raw = buildValidRaw(3);
    raw.questions[0].text = "Vos 12 rebonds ont pese dans ce match : qu avez-vous cherche a imposer ?";
    raw.questions[1].text = "A quel moment avez-vous senti le collectif prendre le dessus ?";
    raw.questions[2].text = "Que retenez-vous de cette victoire ?";
    const otherMatchFacts = [
      selectedFact({
        id: "other-performance",
        category: "performance",
        factualStatement: "Athlete Fictif a capte 12 rebonds.",
      }),
      selectedFact({
        id: "other-quarters",
        factualStatement: "Q1 20-20, Q2 20-20, Q3 20-20, Q4 25-10.",
      }),
    ];

    expect(runAfterMatchValidation(raw, otherMatchFacts).questions).toHaveLength(3);
  });
});
