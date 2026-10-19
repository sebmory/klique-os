import { describe, expect, it } from "vitest";
import { buildEditorialDossier } from "@/services/editorial-dossier/builder";
import { evaluateEditorialGenerationEligibility } from "@/services/editorial-generation/policy";
import { selectEditorialGenerationContext } from "@/services/editorial-generation/selector";
import { buildContentPrompt } from "@/services/content-intelligence/prompt-builder";
import { interviewTemplateV1 } from "@/services/content-intelligence/templates";
import {
  editorialDossierItems,
  editorialDossierSubject,
  securedEditorialCollectionFixture,
} from "@/tests/fixtures/editorial-dossier";
import type { ContextItem } from "@/types/context-intelligence";
import type { InterviewGenerationRequest } from "@/types/content-generation";

const build = (role: "admin" | "media" = "admin", items = editorialDossierItems) =>
  buildEditorialDossier({
    collection: { ...securedEditorialCollectionFixture, items },
    authenticatedWorkspaceId: "workspace-1",
    subject: editorialDossierSubject,
    role,
  });

describe("editorial generation policy and context selection", () => {
  it("authorizes a reliable Admin dossier in ready mode", () => {
    const dossier = build("admin", editorialDossierItems.filter((item) =>
      !item.id.startsWith("contradiction-")
      && item.id !== "old-news"
      && item.id !== "private-health"
      && item.id !== "weekly-response"));
    const eligibility = evaluateEditorialGenerationEligibility(dossier, {
      type: "article",
      articleType: "portrait",
    });

    expect(eligibility.status).toBe("ready");
    expect(eligibility.eligibleFactIds.length).toBeGreaterThan(0);
  });

  it("allows a reliable Admin dossier and deterministically selects only usable facts", () => {
    const dossier = build("admin");
    const target = { type: "article", articleType: "portrait" } as const;
    const eligibility = evaluateEditorialGenerationEligibility(dossier, target);
    const first = selectEditorialGenerationContext(dossier, eligibility as never, target);
    const second = selectEditorialGenerationContext(dossier, eligibility as never, target);

    expect(eligibility.status).toBe("limited");
    expect(first).toEqual(second);
    expect(first.modelContext.facts.some((fact) => fact.text === "Le score final est 2-1")).toBe(false);
    expect(first.modelContext.facts.some((fact) => fact.text === "Le score final est 1-2")).toBe(false);
    expect(first.modelContext.unresolvedContradictions).toContain(
      "Contradiction non resolue 1: les formulations concernees ont ete exclues sans arbitrage.",
    );
  });

  it("removes every private Media string before prompt construction", () => {
    const dossier = build("media");
    const target = { type: "interview", interviewType: "portrait" } as const;
    const eligibility = evaluateEditorialGenerationEligibility(dossier, target);
    expect(eligibility.status).not.toBe("blocked");
    const selection = selectEditorialGenerationContext(dossier, eligibility as never, target);
    const request = {
      requestType: "interview",
      language: "fr",
      template: { key: "interview:v1", family: "interview", name: "Interview", version: "v1" },
      context: {
        source: "crm",
        subjectType: "person",
        displayName: "Mila Martin",
        knownFacts: [],
        objective: "interview",
        audience: "general",
        templateKey: "interview:v1",
        contentType: "interview",
        format: "written",
        tone: "journalistic",
        internalFacts: [],
        externalVerifiedFacts: [],
        userProvidedContextItems: [],
        editorialLeads: [],
        excludedContext: [],
        constraints: { requiredTopics: [], avoidedTopics: [], questionCount: 5 },
      },
      brief: {
        interviewType: "portrait",
        objective: "interview",
        tone: "journalistic",
        questionCount: 5,
        format: "written",
        audience: "general",
        requiredTopics: [],
        avoidedTopics: [],
        additionalContext: "",
      },
      selectedContextItems: [],
      contextSelection: {},
      rulesVersion: "editorial-rules-v1",
      externalContext: null,
      editorialContext: selection.modelContext,
    } as InterviewGenerationRequest;
    const prompt = buildContentPrompt({ request, template: interviewTemplateV1, promptVersion: "v1" });
    const serialized = JSON.stringify({ prompt, metadata: selection.metadata });

    expect(serialized).not.toContain("Douleur au genou strictement privee");
    expect(serialized).not.toContain("Rendez-vous interne vendredi matin");
    expect(serialized).not.toContain("workspace-1");
    expect(serialized).not.toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(serialized).not.toContain("crm-name");
  });

  it("blocks a factual article without a reliable usable fact", () => {
    const dossier = build("media", editorialDossierItems.filter((item) =>
      item.id.startsWith("crm-") || item.id === "manual-note"));
    const eligibility = evaluateEditorialGenerationEligibility(dossier, {
      type: "article",
      articleType: "actualite",
    });

    expect(eligibility.status).toBe("blocked");
    expect(eligibility.reasons.join(" ")).toContain("fait recent");
  });

  it("allows an exploratory interview in limited mode with canonical identity and safe leads", () => {
    const dossier = build("media", editorialDossierItems.filter((item) =>
      item.id === "crm-name" || item.id === "manual-note"));
    const eligibility = evaluateEditorialGenerationEligibility(dossier, {
      type: "interview",
      interviewType: "portrait",
    });

    expect(eligibility.status).toBe("limited");
    expect(eligibility.warnings.join(" ")).toContain("questions ouvertes");
  });

  it("never upgrades a manual citation and never presents stale news as current actuality", () => {
    const manualCitation: ContextItem = {
      ...editorialDossierItems.find((item) => item.id === "manual-note")!,
      id: "manual-citation",
      title: "Citation manuelle",
      summary: "Je gagnerai dimanche.",
      factualStatement: "Je gagnerai dimanche.",
      metadata: { citation: true, author: "Mila Martin" },
    };
    const dossier = build("media", [...editorialDossierItems, manualCitation]);
    const target = { type: "interview", interviewType: "portrait" } as const;
    const eligibility = evaluateEditorialGenerationEligibility(dossier, target);
    const selection = selectEditorialGenerationContext(dossier, eligibility as never, target);
    const citation = selection.modelContext.citations.find((item) => item.text === "Je gagnerai dimanche.");

    expect(citation?.verificationStatus).toBe("user_provided");
    expect(selection.modelContext.facts.find((fact) => fact.text === "Annonce publiee en juin")).toBeUndefined();
    expect(selection.modelContext.facts.every((fact) =>
      fact.freshness === "current" || fact.freshness === "historical" || fact.freshness === "unknown")).toBe(true);
  });

  it("reports only sources referenced by transmitted material", () => {
    const dossier = build("media");
    const target = { type: "article", articleType: "actualite" } as const;
    const eligibility = evaluateEditorialGenerationEligibility(dossier, target);
    const selection = selectEditorialGenerationContext(dossier, eligibility as never, target);
    const transmittedNames = new Set([
      ...selection.modelContext.facts.flatMap((fact) => fact.sourceNames),
      ...selection.modelContext.citations.flatMap((citation) => citation.sourceNames),
    ]);

    expect(selection.metadata.usedSources.length).toBeGreaterThan(0);
    for (const source of selection.metadata.usedSources) {
      expect(transmittedNames.has(source.name)
        || selection.modelContext.editorialLeads.some((lead) =>
          dossier.editorialLeads.some((sourceLead) =>
            sourceLead.formulation === lead.text
            && sourceLead.sourceIds.some((sourceId) => dossier.sources.find((item) => item.sourceId === sourceId)?.name === source.name))))
        .toBe(true);
    }
  });
});
