import { describe, expect, it } from "vitest";
import { buildContentGenerationRequest } from "@/services/content-intelligence/context-builder";
import { buildContentPrompt } from "@/services/content-intelligence/prompt-builder";
import { assessInterviewBriefReadiness } from "@/services/content-intelligence/interview-preparation";
import { contentIntelligenceConfig } from "@/services/content-intelligence/config";
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
  it("builds Camara's structured after-match situation before the final prompt", async () => {
    const matchLead = contextItem({
      id: "camara-match",
      category: "result",
      summary: "Adversaire : FC Naters Oberwallis. Score déclaré : 0–2.",
      factualStatement: "Adversaire : FC Naters Oberwallis. Score déclaré : 0–2.",
      statementType: "editorial_lead",
      sourceType: "external",
      sourceName: "Footstats Pro",
      verificationStatus: "unverified",
      confidence: "low",
    });
    const writerFact = contextItem({
      id: "camara-writer-fact",
      summary: "Camara est entré en jeu à la 65e minute.",
      factualStatement: "Camara est entré en jeu à la 65e minute.",
      sourceType: "internal",
      sourceName: "Saisie du rédacteur",
      verificationStatus: "verified",
    });
    const payload = payloadFor("after_match", [matchLead, writerFact], 8);
    payload.subject = {
      ...payload.subject,
      id: "abdou-bobodi-camara",
      source: "crm",
      displayName: "Abdou Böbödi CAMARA",
      sport: "Football",
      clubOrOrganization: "Vevey-Sports",
    };
    payload.parameters.afterMatchClosingFacts = {
      ranking: {
        value: "16e et dernier",
        asOfDate: "2026-11-16",
        source: "Saisie du rédacteur",
        verificationStatus: "verified",
      },
    };
    const editorialContext = {
      generationMode: "ready" as const,
      subject: {
        type: "person",
        displayName: "Abdou Böbödi CAMARA",
        sport: "Football",
        clubOrOrganization: "Vevey-Sports",
        publicRoleOrPosition: "Attaquant",
        identityBasis: "canonical" as const,
      },
      facts: [],
      chronology: [],
      citations: [],
      editorialLeads: [],
      missingInformation: [],
      unresolvedContradictions: [],
    };

    const { request } = await buildContentGenerationRequest(payload, access, editorialContext);
    const prompt = buildContentPrompt({
      request,
      template: interviewTemplateV1,
      promptVersion: contentIntelligenceConfig.interviewPromptVersion,
    });

    expect((request as InterviewGenerationRequest).brief.afterMatchSituation).toEqual({
      sport: {
        value: "Football",
        provenance: "Projection éditoriale Athlete",
        verificationStatus: "reported",
      },
      position: {
        value: "Attaquant",
        provenance: "Projection éditoriale Athlete",
        verificationStatus: "reported",
      },
      club: {
        value: "Vevey-Sports",
        provenance: "Projection éditoriale Athlete",
        verificationStatus: "reported",
      },
      opponent: {
        value: "FC Naters Oberwallis",
        provenance: "Footstats Pro",
        verificationStatus: "unverified",
      },
      score: {
        value: "0–2",
        provenance: "Footstats Pro",
        verificationStatus: "unverified",
      },
      outcome: {
        value: "défaite",
        provenance: "Footstats Pro",
        verificationStatus: "unverified",
      },
      writerFacts: [{
        value: "Camara est entré en jeu à la 65e minute.",
        provenance: "Saisie du rédacteur",
        verificationStatus: "verified",
      }],
      ranking: {
        value: "16e et dernier",
        provenance: "Saisie du rédacteur",
        verificationStatus: "verified",
      },
    });
    expect(prompt).toContain("Prompt version: cie-interview-v10");
    expect(prompt).toContain('"value": "Football"');
    expect(prompt).toContain('"value": "Attaquant"');
    expect(prompt).toContain('"value": "Vevey-Sports"');
    expect(prompt).toContain('"value": "FC Naters Oberwallis"');
    expect(prompt).toContain('"value": "0–2"');
    expect(prompt).toContain('"value": "défaite"');
    expect(prompt).toContain('"value": "Camara est entré en jeu à la 65e minute."');
    expect(prompt).toContain('"value": "16e et dernier"');
    expect(prompt).toContain("construire silencieusement une tension editoriale");
    expect(prompt).toContain("le resultat, le score et l adversaire de la fiche de match explicitement selectionnee");
    expect(prompt).toContain("Maximum deux questions principales autour d un meme fait ou evenement");
    expect(prompt).toContain("Une entree en jeu ne doit jamais produire une serie de variantes distinctes");
    expect(prompt).toContain("Quand une action precise est documentee, la citer dans la question et demander au joueur de l expliquer");
    expect(prompt).toContain("Ne jamais demander au joueur de choisir, retrouver ou identifier lui-meme une action ou un souvenir precis");
    expect(prompt).toContain("Si seule la minute d entree est connue, poser exactement une seule question principale sur cette entree");
    expect(prompt).toContain("Ne jamais inventer d occasion, d action, de consigne, d emotion ni de probleme physique");
    expect(prompt).toContain("resultat, dynamique, classement, poste, role collectif, moral, solutions et suite");
    expect(prompt).toContain("Quand une defaite et une derniere place sont disponibles");
    expect(prompt).toContain("privilegier la reaction, les difficultes, le moral, les solutions, la confiance, le role du joueur et la suite");
    expect(prompt).toContain("une question principale doit exploiter clairement ces trois elements");
    expect(prompt).toContain("une question principale doit utiliser ce role pour apporter un angle sportif concret");
    expect(prompt).toContain("au maximum une seule question principale sur le classement");
    expect(prompt).toContain("constat du classement / vecu du classement");
    expect(prompt).toContain("difficulte collective / changement urgent");
    [
      "1. reaction au resultat en nommant issue, score et adversaire",
      "2. difficulte collective observee",
      "3. point positif ou point d appui",
      "4. entree en jeu, une seule question",
      "5. confiance personnelle",
      "6. role ou attentes lies au poste CRM",
      "7. solutions pour sortir de la derniere place",
      "8. supporters ou prochaine echeance",
    ].forEach((angle) => expect(prompt).toContain(angle));
    expect(prompt).toContain("chercher une reponse differente et former avec les autres une conversation naturelle");
    expect(prompt).toContain("Employer le vocabulaire propre au sport et utiliser le poste CRM");
    expect(prompt).toContain("Generer exactement 8 questions principales, ni plus ni moins");
    expect(prompt).toContain("Replacer les chiffres dans une situation sportive et emotionnelle");
    expect(prompt).toContain("Eviter le ton questionnaire ou IA");
    expect(prompt).toContain("'quelle etait votre priorite ?'");
    expect(prompt).toContain("'qu aviez-vous observe ?'");
    expect(prompt).toContain("'qu est-ce qui vous a sollicite physiquement ?'");
    expect(prompt).toContain("'quelle decision aimeriez-vous expliquer ?'");
  });

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
    expect(prompt).not.toContain("Piste non vérifiée : l’athlète aurait inscrit 21 points.");
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
    expect(prompt).toContain("interroger ce qu elle revele de la performance");
    expect(prompt).toContain("la citer dans une seule question principale");
    expect(prompt).toContain("consacrer une seule question principale a cette fin de match");
    expect(prompt).toContain("Les faits cles demandes doivent apparaitre dans le texte des questions principales");
    expect(prompt).toContain("Quelle sequence choisiriez-vous");
    expect(prompt).toContain("une introduction d une seule phrase");
    expect(prompt).toContain("un remerciement court");
    expect(prompt).toContain("voix de journaliste sportif");
    expect(prompt).toContain("une idee a la fois");
    expect(prompt).toContain("ne pas aligner des formulations du type 'statistique: comment expliquez-vous...'");
    expect(prompt).toContain("choisir interieurement un fil d entretien a partir des faits verifies");
    expect(prompt).toContain("vecu individuel documente, lecture du match, reaction a un moment precis");
    expect(prompt).toContain("Ce sont des pistes de preparation, jamais des rubriques a remplir");
    expect(prompt).toContain("le role en sortie de banc peut faire partie du fil");
    expect(prompt).toContain("Traiter la feuille de match comme des notes");
    expect(prompt).toContain("jamais fabriquer une question par quart-temps");
    expect(prompt).toContain("Ne pas demander le premier ballon, le premier tir, la premiere possession");
    expect(prompt).toContain("une relance courte peut chercher un souvenir, un choix ou un ressenti sans repeter la statistique");
    expect(prompt).toContain("Ne pas poser plusieurs variantes sur la meme fin de match");
    expect(prompt).toContain("Ne pas repeter le score complet dans plusieurs questions");
    expect(prompt).toContain("sans position fixe valable pour tous les matchs");
    expect(prompt).toContain("placer d abord la question sur le moment collectif documente");
    expect(prompt).toContain("Chaque bloc afterMatchClosingFacts present dans le brief est un sujet obligatoire");
    expect(prompt).toContain("une valeur manual_brief reste une information fournie par l utilisateur");
    expect(prompt).toContain("Chaque question doit chercher une reponse differente des autres");
    expect(prompt).toContain("Attribuer explicitement a l equipe les scores");
    expect(prompt).toContain("Ne jamais supposer que le joueur etait sur le terrain");
    expect(prompt).not.toContain("\"topic\"");
  });

  it("blocks an 8-question after-match brief before generation when verified material is insufficient", async () => {
    const { request } = await buildPrompt(payloadFor("after_match", collectiveItems, 8));
    const readiness = assessInterviewBriefReadiness({
      interviewType: request.brief.interviewType,
      questionCount: request.brief.questionCount,
      selectedContextItems: request.selectedContextItems,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.message).toContain("Completez le brief avec des faits verifies ou choisissez un format plus court");
  });

  it("accepts 8 questions when the verified match brief supplies 8 factual anchors", async () => {
    const richItems = [
      ...collectiveItems.filter((item) => item.id !== "lead-points"),
      contextItem({
        id: "fact-points",
        category: "performance",
        summary: "Statistique vérifiée : Liban Maxamed a inscrit 21 points (feuille officielle).",
        factualStatement: "Statistique vérifiée : Liban Maxamed a inscrit 21 points (feuille officielle).",
      }),
    ];
    const { request, prompt } = await buildPrompt(payloadFor("after_match", richItems, 8));
    const readiness = assessInterviewBriefReadiness({
      interviewType: request.brief.interviewType,
      questionCount: request.brief.questionCount,
      selectedContextItems: request.selectedContextItems,
    });

    expect(readiness).toMatchObject({ ready: true, verifiedAnchorCount: 8 });
    expect(prompt).toContain("Generer exactement 8 questions principales, ni plus ni moins.");
    expect(prompt).toContain("Les reserves et pistes non verifiees restent dans Fiabilite et sources");
  });

  it("passes complete optional closing facts to the same interview prompt", async () => {
    const payload = payloadFor("after_match", [
      ...collectiveItems,
      contextItem({
        id: "official-ranking",
        category: "other",
        sourceType: "official",
        summary: "Classement officiel au 16 novembre : Sion Basket occupe la 2e place.",
        factualStatement: "Classement officiel au 16 novembre : Sion Basket occupe la 2e place.",
      }),
      contextItem({
        id: "official-schedule",
        category: "schedule",
        sourceType: "official",
        summary: "Prochain match contre Lausanne Basket le 22 novembre en NL1 Men.",
        factualStatement: "Prochain match contre Lausanne Basket le 22 novembre en NL1 Men.",
      }),
    ]);
    payload.parameters.afterMatchClosingFacts = {
      ranking: {
        value: "3e de NL1 Men",
        asOfDate: "2026-11-16",
        source: "Classement officiel fictif",
        verificationStatus: "verified",
      },
      nextFixture: {
        opponent: "Adversaire fictif",
        date: "2026-11-22",
        competition: "NL1 Men",
        source: "Calendrier officiel fictif",
        verificationStatus: "verified",
      },
    };

    const { request, prompt } = await buildPrompt(payload);

    expect(request.brief.afterMatchClosingFacts).toEqual({
      ranking: expect.objectContaining({
        value: "2e",
        requiredMention: "2e",
        retainedFrom: "verified_context",
        verificationStatus: "verified",
        resolutionNote: expect.stringContaining("Saisie manuelle écartée: 3e de NL1 Men"),
      }),
      nextFixture: expect.objectContaining({
        opponent: "Lausanne Basket",
        requiredMention: "Lausanne Basket",
        retainedFrom: "verified_context",
        verificationStatus: "verified",
        resolutionNote: expect.stringContaining("Saisie manuelle écartée: Adversaire fictif"),
      }),
    });
    expect(prompt).toContain('"requiredMention": "2e"');
    expect(prompt).toContain('"requiredMention": "Lausanne Basket"');
    expect(prompt).toContain("une valeur verified_context remplace la saisie manuelle contradictoire");
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
      expect(prompt).toContain("Generer exactement 6 questions principales, ni plus ni moins.");
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
