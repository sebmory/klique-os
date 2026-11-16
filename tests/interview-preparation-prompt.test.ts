import { describe, expect, it } from "vitest";
import { buildContentGenerationRequest } from "@/services/content-intelligence/context-builder";
import { buildContentPrompt } from "@/services/content-intelligence/prompt-builder";
import { interviewTemplateV1 } from "@/services/content-intelligence/templates";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import type { InterviewGenerationRequest } from "@/types/content-generation";
import type { ContextItem } from "@/types/context-intelligence";

// Données fictives : contrôle technique de la transmission des faits au modèle
// et des consignes par type. Ce test ne valide pas la qualité journalistique du texte généré.

const contextItem = (overrides: Partial<ContextItem>): ContextItem => ({
  id: "item-1",
  connectorId: "manual",
  category: "result",
  title: "Fait fictif",
  summary: "Fait fictif",
  factualStatement: "Fait fictif",
  statementType: "fact",
  sourceType: "external",
  sourceName: "Source officielle fictive",
  retrievedAt: "2026-11-14T10:00:00.000Z",
  confidence: "high",
  verificationStatus: "verified",
  isSelected: true,
  isEditable: false,
  metadata: {},
  ...overrides,
});

const payloadFor = (
  interviewType: string,
  items: ContextItem[],
  questionCount = 6,
): CreationPreparationPayload => ({
  templateId: "creation-assistant",
  context: { mode: "free" },
  subject: {
    type: "person",
    source: "temporary",
    id: undefined,
    displayName: "Liban Maxamed",
    description: "",
    sport: "Basketball",
    clubOrOrganization: "Club Fictif",
    disciplineOrPosition: "",
    photoUrl: undefined,
    photoAvailable: false,
  },
  objective: { id: "interview", subtypeId: interviewType },
  parameters: {
    language: "fr-CH",
    toneId: "journalistic",
    questionCount,
    formatId: "written",
    audienceId: "general",
    additionalContext: "",
    requiredTopics: [],
    avoidedTopics: [],
    contextIntelligence: {
      enabled: true,
      selectedConnectorIds: ["manual"],
      dateRange: { preset: "last_30_days", from: "2026-10-15", to: "2026-11-14" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      collectionId: undefined,
      selectedItemIds: items.map((item) => item.id),
      manualEdits: [],
      selectedContextItems: items,
      researchedAt: "2026-11-14T10:00:00.000Z",
    },
  },
} as unknown as CreationPreparationPayload);

const access = { workspaceId: "workspace-fictif", role: "admin" } as const;

const buildPrompt = async (payload: CreationPreparationPayload) => {
  const { request, missingInformation } = await buildContentGenerationRequest(payload, access);
  const prompt = buildContentPrompt({
    request,
    template: interviewTemplateV1,
    promptVersion: "cie-interview-v1",
  });
  return { request: request as InterviewGenerationRequest, prompt, missingInformation };
};

// Cas Liban fictif : score collectif et déroulé vérifiés, 21 points non vérifiés.
const collectiveItems = [
  contextItem({
    id: "fact-score",
    summary: "Sion fictif 82–74 Neuchâtel fictif, le 13 novembre, compétition fictive.",
    factualStatement: "Sion fictif 82–74 Neuchâtel fictif, le 13 novembre, compétition fictive.",
  }),
  contextItem({
    id: "fact-quarters",
    summary: "Évolution par quart-temps selon la feuille officielle : Q1 25–11, Q2 12–17, Q3 28–18, Q4 17–28.",
    factualStatement: "Évolution par quart-temps selon la feuille officielle : Q1 25–11, Q2 12–17, Q3 28–18, Q4 17–28.",
  }),
  contextItem({
    id: "lead-points",
    summary: "Piste non vérifiée : l’athlète aurait inscrit 21 points.",
    factualStatement: "Piste non vérifiée : l’athlète aurait inscrit 21 points.",
    statementType: "editorial_lead",
    verificationStatus: "unverified",
  }),
];

describe("interview preparation prompt", () => {
  it("routes verified match facts and unverified leads into separate buckets for after-match", async () => {
    const { request, prompt } = await buildPrompt(payloadFor("after_match", collectiveItems));

    expect(request.context.externalVerifiedFacts).toEqual([
      expect.stringContaining("82–74"),
      expect.stringContaining("Q1 25–11"),
    ]);
    // Les 21 points restent une piste : jamais transmis comme fait vérifié.
    expect(request.context.externalVerifiedFacts.join(" ")).not.toContain("21 points");
    expect(request.context.editorialLeads).toEqual([
      expect.stringContaining("21 points"),
    ]);
    expect(prompt).toContain("Une piste editoriale ou une donnee manuelle non verifiee reste une hypothese.");
    expect(prompt).toContain("Centrer la trame sur cette rencontre precise");
    expect(prompt).not.toContain("Eviter que toutes les questions portent sur un seul evenement recent.");
  });

  it("transmits a verified individual statistic as fact in the rich after-match brief", async () => {
    const richItems = [
      ...collectiveItems.filter((item) => item.id !== "lead-points"),
      contextItem({
        id: "fact-points",
        category: "performance",
        summary: "Statistique vérifiée : Liban Maxamed a inscrit 21 points (feuille officielle).",
        factualStatement: "Statistique vérifiée : Liban Maxamed a inscrit 21 points (feuille officielle).",
      }),
    ];
    const { request, prompt } = await buildPrompt(payloadFor("after_match", richItems));

    expect(request.context.externalVerifiedFacts).toEqual([
      "Sion fictif 82–74 Neuchâtel fictif, le 13 novembre, compétition fictive. (Source: Source officielle fictive)",
      "Évolution par quart-temps selon la feuille officielle : Q1 25–11, Q2 12–17, Q3 28–18, Q4 17–28. (Source: Source officielle fictive)",
      "Statistique vérifiée : Liban Maxamed a inscrit 21 points (feuille officielle). (Source: Source officielle fictive)",
    ]);
    expect(request.context.editorialLeads).toEqual([]);
    expect(prompt).toContain("interroger la maniere (comment le joueur a trouve ses tirs");
    expect(prompt).toContain("la citer dans une question principale");
    expect(prompt).toContain("avance avant le dernier quart puis un ecart final plus faible");
    expect(prompt).toContain("Les faits cles demandes doivent apparaitre dans le texte des questions principales");
    expect(prompt).toContain("Quelle sequence choisiriez-vous");
    expect(prompt).toContain("une conclusion courte");
    expect(prompt).not.toContain("\"topic\"");
  });

  it("gives each interview type its own preparation frame and shared craft rules", async () => {
    const { prompt: afterMatch } = await buildPrompt(payloadFor("after_match", collectiveItems));
    const { prompt: beforeMatch } = await buildPrompt(payloadFor("before_match", []));
    const { prompt: injuryReturn } = await buildPrompt(payloadFor("injury_return", []));

    expect(afterMatch).toContain("Methode de preparation (after_match):");
    expect(afterMatch).toContain("evolution par quart-temps ou sequences documentees");
    expect(afterMatch).toContain("incidence au classement et prochain rendez-vous uniquement si ces elements sont sources");

    expect(beforeMatch).toContain("Methode de preparation (before_match):");
    expect(beforeMatch).toContain("identite de jeu observable");
    expect(beforeMatch).not.toContain("Methode de preparation (after_match):");

    expect(injuryReturn).toContain("Methode de preparation (injury_return):");
    expect(injuryReturn).toContain("ce que l athlete accepte d aborder");
    expect(injuryReturn).toContain("Ne confirmer ni blessure, ni diagnostic, ni date de reprise.");

    for (const prompt of [afterMatch, beforeMatch, injuryReturn]) {
      expect(prompt).toContain("Construire un fil d interview qui se suit naturellement");
      expect(prompt).toContain("Qu est-ce que le score ne raconte pas");
      expect(prompt).toContain("Une trame ne doit jamais pouvoir passer d un type d interview a un autre");
      expect(prompt).toContain("livrer moins de questions (minimum 3) plutot que des questions interchangeables");
    }
  });

  it("flags missing match material for the journalist instead of inventing it", async () => {
    const { missingInformation: noFacts } = await buildPrompt(payloadFor("after_match", [
      collectiveItems[2],
    ]));
    expect(noFacts.join(" ")).toContain("Aucun fait vérifié sur la rencontre");
    expect(noFacts.join(" ")).toContain("observation de terrain");

    const { missingInformation: noSequence } = await buildPrompt(payloadFor("after_match", [
      collectiveItems[0],
    ]));
    expect(noSequence.join(" ")).toContain("Déroulé de la rencontre non documenté");

    const { missingInformation: documented } = await buildPrompt(payloadFor("after_match", collectiveItems));
    expect(documented.join(" ")).not.toContain("Déroulé de la rencontre non documenté");

    const { missingInformation: portrait } = await buildPrompt(payloadFor("portrait", []));
    expect(portrait.join(" ")).not.toContain("observation de terrain");
  });
});
