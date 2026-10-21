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

const buildDeclaredInterviewPortrait = (item: ContextItem) =>
  buildEditorialDossier({
    collection: {
      ...securedEditorialCollectionFixture,
      items: [item],
    },
    authenticatedWorkspaceId: "workspace-1",
    subject: {
      source: "temporary",
      type: "free_topic",
      displayName: "Alex Exemple",
    },
    role: "admin",
  });

const declaredInterviewCitation: ContextItem = {
  id: "manual-interview-alex-answer",
  connectorId: "manual",
  category: "user_note",
  title: "Citation de Alex Exemple",
  summary: "Je ne cherche pas à devenir professionnel.",
  factualStatement: "Je ne cherche pas à devenir professionnel.",
  statementType: "editorial_lead",
  sourceType: "user",
  sourceName: "Entretien fictif KLIQUE — non publiable",
  publishedAt: "2026-10-21T00:00:00.000Z",
  retrievedAt: "2026-10-21T10:00:00.000Z",
  confidence: "unknown",
  verificationStatus: "user_provided",
  isSelected: true,
  isEditable: false,
  metadata: {
    materialKind: "verbatim_quote",
    citation: true,
    author: "Alex Exemple",
    interviewSourceId: "interview-alex",
    interviewExcerptId: "answer-1",
    interviewSpeakerRole: "interviewee",
    interviewSubjectIdentityConfirmed: true,
    interviewSubjectName: "Alex Exemple",
    declaredSubjectName: "Alex Exemple",
  },
};

describe("editorial generation policy and context selection", () => {
  it("allows a declared free subject Portrait only in limited mode from an attributed interview quote", () => {
    const dossier = buildDeclaredInterviewPortrait(declaredInterviewCitation);
    const target = { type: "article", articleType: "portrait" } as const;
    const eligibility = evaluateEditorialGenerationEligibility(dossier, target);
    const selection = selectEditorialGenerationContext(dossier, eligibility, target);

    expect(dossier.subject).toMatchObject({
      canonicalId: undefined,
      displayName: "Alex Exemple",
      declaredInterviewIdentity: {
        confirmed: true,
        interviewee: "Alex Exemple",
        hasAttributedCitation: true,
      },
    });
    expect(dossier.facts).toEqual([]);
    expect(eligibility.status).toBe("limited");
    expect(eligibility.missingInformation).not.toContain("Identifiant canonique du sujet manquant.");
    expect(eligibility.missingInformation).not.toContain("Aucun fait exploitable sans contradiction.");
    expect(eligibility.warnings).toContain(
      "Article fondé sur un entretien fourni par l’utilisateur. Identité et déclarations non vérifiées indépendamment.",
    );
    expect(selection.modelContext.facts).toEqual([]);
    expect(selection.modelContext.citations).toContainEqual(expect.objectContaining({
      text: "Je ne cherche pas à devenir professionnel.",
      author: "Alex Exemple",
      verificationStatus: "user_provided",
    }));
    expect(selection.metadata.identityBasis).toBe("declared_interview");
  });

  it("blocks a free subject Portrait without confirmation or with only the interviewer as speaker", () => {
    const unconfirmedDossier = buildDeclaredInterviewPortrait({
      ...declaredInterviewCitation,
      metadata: {
        ...declaredInterviewCitation.metadata,
        interviewSubjectIdentityConfirmed: false,
      },
    });
    const interviewerDossier = buildDeclaredInterviewPortrait({
      ...declaredInterviewCitation,
      title: "Question de Camille Test",
      metadata: {
        ...declaredInterviewCitation.metadata,
        citation: false,
        author: "Camille Test",
        interviewSpeakerRole: "interviewer",
      },
    });

    const unconfirmed = evaluateEditorialGenerationEligibility(unconfirmedDossier, {
      type: "article",
      articleType: "portrait",
    });
    const wrongSpeaker = evaluateEditorialGenerationEligibility(interviewerDossier, {
      type: "article",
      articleType: "portrait",
    });

    expect(unconfirmed.status).toBe("blocked");
    expect(unconfirmed.reasons).toContain(
      "Pour un sujet libre, confirmez explicitement que la personne interrogée est le sujet de l’article.",
    );
    expect(wrongSpeaker.status).toBe("blocked");
    expect(wrongSpeaker.reasons).toContain(
      "L’identité déclarée exige au moins une citation verbatim confirmée de la personne interrogée, avec provenance et date.",
    );
  });

  it.each(["actualite", "analyse"] as const)(
    "keeps %s blocked for a declared interview without verified facts",
    (articleType) => {
      const dossier = buildDeclaredInterviewPortrait(declaredInterviewCitation);
      const eligibility = evaluateEditorialGenerationEligibility(dossier, {
        type: "article",
        articleType,
      });

      expect(eligibility.status).toBe("blocked");
      expect(eligibility.eligibleFactIds).toEqual([]);
    },
  );

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
      item.id.startsWith("crm-") || item.id === "manual-note" || item.id === "official-result"));
    const eligibility = evaluateEditorialGenerationEligibility(dossier, {
      type: "article",
      articleType: "actualite",
    });

    expect(eligibility.status).toBe("blocked");
    expect(eligibility.reasons.join(" ")).toContain("fait individuel récent");
    expect(eligibility.itemDiagnostics.some((item) =>
      item.reasons.some((reason) => reason.includes("pas explicitement attribué")))).toBe(true);
  });

  it("allows the sparse FC Breitenrain Portrait only in prudent limited mode", () => {
    const name = {
      ...editorialDossierItems.find((item) => item.id === "crm-name")!,
      summary: "Aggee Wenzi",
      factualStatement: "Aggee Wenzi",
    };
    const sport = {
      ...editorialDossierItems.find((item) => item.id === "crm-sport")!,
      summary: "Football",
      factualStatement: "Football",
    };
    const club = {
      ...editorialDossierItems.find((item) => item.id === "crm-club")!,
      summary: "FC Breitenrain",
      factualStatement: "FC Breitenrain",
    };
    const replacement: ContextItem = {
      ...editorialDossierItems.find((item) => item.id === "official-result")!,
      id: "aggee-replacement",
      title: "Remplacement",
      summary: "Aggee Wenzi a effectué un remplacement à la 25e minute.",
      factualStatement: "Aggee Wenzi a effectué un remplacement à la 25e minute.",
      publishedAt: "2026-10-18T18:00:00.000Z",
      metadata: {
        subjectId: "athlete-1",
        eventDate: "2026-10-18T18:00:00.000Z",
        factKey: "aggee-remplacement-25",
      },
    };
    const dossier = build("media", [name, sport, club, replacement]);
    const eligibility = evaluateEditorialGenerationEligibility(dossier, {
      type: "article",
      articleType: "portrait",
    });

    expect(dossier.subject.displayName).toBe("Aggee Wenzi");
    expect(dossier.subject.sport).toBe("Football");
    expect(dossier.subject.clubOrOrganization).toBe("FC Breitenrain");
    expect(eligibility.status).toBe("limited");
    expect(eligibility.eligibleFactIds).toHaveLength(3);
    expect(eligibility.warnings.join(" ")).toContain("Ne pas inventer le parcours");
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
    expect(selection.metadata.userProvidedMaterials).toContainEqual(expect.objectContaining({
      kind: "verbatim_quote",
      text: "Je gagnerai dimanche.",
      speaker: "Mila Martin",
    }));
    expect(selection.modelContext.facts.find((fact) => fact.text === "Annonce publiee en juin")).toBeUndefined();
    expect(selection.modelContext.facts.every((fact) =>
      fact.freshness === "current" || fact.freshness === "historical" || fact.freshness === "unknown")).toBe(true);
  });

  it("reports only sources referenced by transmitted material", () => {
    const dossier = build("media");
    const target = { type: "article", articleType: "portrait" } as const;
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
