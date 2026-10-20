import { describe, expect, it } from "vitest";
import {
  buildArticleAngleSuggestionsPrompt,
  buildArticleFinalPrompt,
  buildArticleStructurePrompt,
} from "@/services/content-intelligence/article-prompt-builder";
import { buildArticleStructureSuggestionsJsonSchema } from "@/services/content-intelligence/article-schema";
import {
  validateArticleAngleQualifications,
  validateArticleFinalResult,
  validateArticleStructureSuggestion,
} from "@/services/content-intelligence/article-validator";
import {
  isDocumentaryAbsenceText,
  sanitizeLineupDerivedRole,
} from "@/services/content-intelligence/article-request-security";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleFinalResult,
  ArticleGenerationRequest,
  ArticleStructureSuggestion,
} from "@/types/content-generation";

const request = {
  requestType: "article",
  language: "fr-CH",
  template: { key: "article:v1", family: "article", name: "Article", version: "v1" },
  context: {
    source: "crm",
    subjectId: "athlete-1",
    subjectType: "person",
    displayName: "Athlète Test",
    sport: "Football",
    clubOrOrganization: "Club Test",
    knownFacts: ["Athlète Test évolue au Club Test."],
    objective: "article",
    audience: "grand-public",
    templateKey: "article:v1",
    contentType: "article",
    format: "portrait",
    tone: "journalistique",
    internalFacts: [],
    externalVerifiedFacts: ["Athlète Test évolue au Club Test."],
    userProvidedContextItems: [],
    editorialLeads: [],
    excludedContext: [],
    constraints: { requiredTopics: [], avoidedTopics: [], questionCount: 0 },
  },
  selectedContextItems: [],
  contextSelection: {},
  rulesVersion: "editorial-rules-v1",
  externalContext: null,
  editorialGeneration: {
    dossierRevision: 1,
    generationMode: "limited",
    confidence: { level: "medium", score: 55, explanation: ["Une seule information attribuée."] },
    usedSources: [],
    contradictions: [],
    missingInformation: ["Parcours détaillé"],
    warnings: ["Limiter le portrait aux faits confirmés."],
  },
  editorialContext: {
    generationMode: "limited",
    subject: { type: "person", displayName: "Athlète Test", sport: "Football", clubOrOrganization: "Club Test" },
    facts: [{
      category: "club_position",
      text: "Athlète Test évolue au Club Test.",
      verificationStatus: "verified",
      confidence: "medium",
      freshness: "current",
      sourceNames: ["Source Test"],
    }],
    chronology: [],
    citations: [],
    editorialLeads: [],
    missingInformation: ["Parcours détaillé"],
    unresolvedContradictions: [],
  },
  brief: {
    objective: "article",
    selectedAngle: "Présentation factuelle",
    articleType: "portrait",
    length: "court",
    tone: "journalistique",
    audience: "grand-public",
    additionalContext: "",
    requiredTopics: [],
    externalVerifiedSources: [],
    providedCitations: [],
  },
} as ArticleGenerationRequest;

const structure: ArticleStructureSuggestion = {
  id: "presentation-factuelle",
  title: "Un repère confirmé",
  editorialPromise: "Présenter uniquement l’information attribuée disponible.",
  sections: [{
    order: 1,
    title: "Une information confirmée",
    purpose: "Présenter le rattachement au club.",
    points: ["Athlète Test évolue au Club Test."],
  }],
  estimatedWordCount: 120,
};

describe("Article journalistic quality in limited mode", () => {
  it("instructs every stage to stay proportional to documented material", () => {
    const angleRequest = {
      ...request,
      brief: {
        ...request.brief,
        selectedAngle: undefined,
      },
    } as unknown as ArticleAngleSuggestionsRequest;

    expect(buildArticleAngleSuggestionsPrompt(angleRequest)).toContain("Ancrer chaque angle");
    expect(buildArticleAngleSuggestionsPrompt(angleRequest)).toContain("Mode limited");
    expect(buildArticleStructurePrompt(request)).toContain("utiliser une seule section");
    expect(buildArticleStructurePrompt(request)).toContain("L angle selectionne est une preference editoriale, jamais une preuve");
    expect(buildArticleFinalPrompt(request, structure)).toContain("objectif maximal, jamais un minimum");
    expect(buildArticleFinalPrompt(request, structure)).toContain("Ne poser aucune question rhetorique");
    expect(buildArticleFinalPrompt(request, structure)).toContain("jamais une preuve d inactivite");
    expect(buildArticleFinalPrompt(request, structure)).toContain("ne prouve pas un role tactique precis");
  });

  it("keeps a legacy limited angle out of the provider evidence context", () => {
    const legacyRequest = {
      ...request,
      brief: {
        ...request.brief,
        selectedAngle: "Dans le travail quotidien sans source correspondante",
      },
    };
    const prompt = buildArticleStructurePrompt(legacyRequest);

    expect(prompt).not.toContain(legacyRequest.brief.selectedAngle);
    expect(prompt).toContain("Presentation factuelle limitee aux seuls elements documentes.");
  });

  it("accepts one short factual section only in limited mode", () => {
    expect(() => validateArticleStructureSuggestion(structure, "court", {
      validateEstimatedWordCount: true,
      generationMode: "limited",
    })).not.toThrow();

    expect(() => validateArticleStructureSuggestion(structure, "court", {
      validateEstimatedWordCount: true,
      generationMode: "ready",
    })).toThrow(/au moins 3 sections/);
  });

  it("keeps three proposals while constraining each limited proposal to one or two sections", () => {
    const schema = buildArticleStructureSuggestionsJsonSchema("limited", "moyen");
    const suggestions = (schema.properties as Record<string, Record<string, unknown>>).suggestions;
    const structure = suggestions.items as Record<string, Record<string, unknown>>;
    const sections = structure.properties.sections as Record<string, unknown>;

    expect(suggestions).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(sections).toMatchObject({ minItems: 1, maxItems: 2 });
  });

  it("accepts a concise limited article below the nominal minimum", () => {
    const result: ArticleFinalResult = {
      title: "Athlète Test au Club Test",
      lead: "Athlète Test évolue au Club Test, selon la source attribuée au dossier.",
      sections: [{
        order: 1,
        heading: "Un rattachement documenté",
        paragraphs: ["La matière disponible confirme uniquement ce rattachement au club."],
      }],
      conclusion: "",
      usedCitations: [],
      usedSources: [],
      estimatedWordCount: 0,
      metadata: { templateId: "article", templateVersion: "v1" },
    };

    expect(validateArticleFinalResult(result, request, structure)).toBeGreaterThan(1);
  });

  it("rejects an undocumented motivation angle", () => {
    const angleRequest = {
      ...request,
      brief: {
        ...request.brief,
        selectedAngle: undefined,
      },
    } as unknown as ArticleAngleSuggestionsRequest;

    expect(() => validateArticleAngleQualifications(angleRequest, [
      { id: "1", title: "Un repère factuel", rationale: "Présenter le club confirmé." },
      { id: "2", title: "Ses motivations profondes", rationale: "Expliquer ce qui pousse sa carrière." },
      { id: "3", title: "Une information attribuée", rationale: "Rester sur la source disponible." },
    ])).toThrow(/motivations ou ambitions/);
  });

  it("keeps a missing search result as a methodological limitation", () => {
    expect(isDocumentaryAbsenceText(
      "Aucune participation récente n'a été retrouvée dans les résultats consultés.",
    )).toBe(true);
    expect(isDocumentaryAbsenceText(
      "Athlète Test a participé au match du 10 octobre.",
    )).toBe(false);
  });

  it("removes a precise tactical role derived only from a lineup source", () => {
    expect(sanitizeLineupDerivedRole(
      "Athlète Test a débuté comme milieu droit intérieur avec le Club Test.",
      ["Transfermarkt"],
    )).toBe("Athlète Test a débuté la rencontre avec le Club Test.");
    expect(sanitizeLineupDerivedRole(
      "Athlète Test a débuté comme milieu droit intérieur avec le Club Test.",
      ["Portrait officiel du club"],
    )).toContain("milieu droit intérieur");
  });

  it("rejects an administrative section heading", () => {
    const result: ArticleFinalResult = {
      title: "Athlète Test au Club Test",
      lead: "Athlète Test évolue au Club Test, selon la source attribuée au dossier.",
      sections: [{
        order: 1,
        heading: "Profil sportif et affiliation club",
        paragraphs: ["La matière disponible confirme uniquement ce rattachement au club."],
      }],
      conclusion: "",
      usedCitations: [],
      usedSources: [],
      estimatedWordCount: 0,
      metadata: { templateId: "article", templateVersion: "v1" },
    };

    expect(() => validateArticleFinalResult(result, request, structure)).toThrow(/intertitre generique/i);
  });
});
