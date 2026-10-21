import { describe, expect, it } from "vitest";
import { validateArticleDerivativeFidelity } from "@/services/content-variants/article-derivative-fidelity";
import type { ContentVariationRequest, ContentVariationResult } from "@/types/content-variant";

const request: ContentVariationRequest = {
  sourceDocument: {
    documentId: "article-fictif",
    documentType: "article",
    documentVersionId: "version-1",
    documentUpdatedAt: "2026-10-21T12:00:00.000Z",
    subjectName: "Alex Exemple",
    title: "Portrait fictif — non publiable",
    editorialAngle: "Une routine encore à mesurer",
    introduction: "Alex décrit une routine sans revendiquer de progression.",
    questions: [{
      id: "section-1",
      text: "Vingt lancers après chaque entraînement",
      purpose: "",
      topic: "",
      followUps: ["Alex affirme : « Je n’ai pas encore assez de recul pour le dire. »"],
    }],
    conclusion: "Les résultats restent à mesurer.",
    selectedContextItems: [],
  },
  sourceDocumentId: "article-fictif",
  sourceDocumentType: "article",
  selectedContextItems: [],
  variationType: "publication",
  platform: "instagram",
  objective: "inform",
  tone: "journalistic",
  audience: "Lecteurs Instagram",
  constraints: {
    language: "fr-CH",
    audience: "Lecteurs Instagram",
    includeTopics: [],
    avoidTopics: [],
    includePrivateNotes: false,
    includedPrivateNoteQuestionIds: [],
  },
  language: "fr-CH",
};

const result = (body: string): ContentVariationResult => ({
  id: "variant-1",
  type: "publication",
  title: "Portrait fictif — non publiable",
  summary: "Une adaptation fidèle.",
  content: body,
  structuredContent: {
    angle: "Une routine encore à mesurer",
    hook: "Vingt lancers, sans conclusion prématurée.",
    body,
    callToAction: "",
    hashtags: [],
    visualIdea: "Aucune suggestion ajoutée.",
  },
  generationMetadata: {
    provider: "simulated",
    model: "simulated",
    generatedAt: "2026-10-21T12:01:00.000Z",
    generationDurationMs: 1,
    promptVersion: "test",
    variationTemplateVersion: "variation-v1",
    sourceDocumentVersionId: "version-1",
    sourceDocumentUpdatedAt: "2026-10-21T12:00:00.000Z",
    usedContextItemIds: [],
  },
});

describe("Article derivative fidelity", () => {
  it("accepts exact quotes and preserves fictitious non-publishable disclosures", () => {
    expect(() => validateArticleDerivativeFidelity(
      request,
      result("Contenu fictif, non publiable. « Je n’ai pas encore assez de recul pour le dire. »"),
    )).not.toThrow();
  });

  it("rejects an invented quote", () => {
    expect(() => validateArticleDerivativeFidelity(
      request,
      result("Contenu fictif, non publiable. « Mes résultats ont fortement progressé. »"),
    )).toThrow(/citation.*ne correspond pas exactement/i);
  });

  it("rejects links and missing mandatory disclosures", () => {
    expect(() => validateArticleDerivativeFidelity(
      request,
      result("Lire la suite sur https://example.com"),
    )).toThrow(/lien/i);
    expect(() => validateArticleDerivativeFidelity(
      request,
      {
        ...result("Une routine décrite avec prudence."),
        title: "Une routine prudente",
        summary: "Une adaptation sobre.",
      },
    )).toThrow(/reserve obligatoire/i);
  });
});
