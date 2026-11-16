import { describe, expect, it, vi } from "vitest";
import {
  EditorialGenerationBlockedError,
  prepareEditorialGeneration,
} from "@/services/editorial-generation/server-context";
import type { EditorialContextCollectionStore } from "@/services/context-intelligence/collection-service";
import {
  editorialDossierItems,
  editorialDossierSubject,
} from "@/tests/fixtures/editorial-dossier";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { resolveConnector } from "@/services/context-intelligence/connectors";
import { buildSportsWatchArticleMaterials } from "@/lib/sports-watch/service";
import { assessInterviewBriefReadiness } from "@/services/content-intelligence/interview-preparation";
import type { SportsWatchCandidate } from "@/types/sports-watch";

const access: ContentAccessContext = {
  clerkUserId: "admin-1",
  workspaceId: "workspace-1",
  role: "admin",
  mediaId: null,
  isAdmin: true,
};

const collection = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "workspace-1",
  clerkUserId: "admin-1",
  role: "admin" as const,
  mediaId: null,
  items: editorialDossierItems,
  reports: [],
  summary: {
    totalItemsFound: editorialDossierItems.length,
    selectedItemsCount: editorialDossierItems.length,
    externalSourcesCount: 5,
    researchedAt: "2026-10-19T10:00:00.000Z",
    dateRange: { preset: "last_30_days" as const, from: "2026-09-19", to: "2026-10-19" },
    warnings: [],
  },
  createdAt: "2026-10-19T10:00:00.000Z",
  expiresAt: "2026-10-19T10:30:00.000Z",
};

const store = (value: typeof collection | null): EditorialContextCollectionStore => ({
  create: vi.fn(),
  getById: vi.fn(async (_id, requestedAccess) =>
    value
    && requestedAccess.workspaceId === value.workspaceId
    && requestedAccess.clerkUserId === value.clerkUserId
    && requestedAccess.role === value.role
      ? value
      : null),
});

describe("server EditorialDossier preparation", () => {
  it("keeps a verified Sports Watch candidate factual through the 8-question preflight", async () => {
    const candidateId = "11111111-1111-4111-8111-111111111111";
    const candidate: SportsWatchCandidate = {
      id: candidateId,
      athleteId: "liban-maxamed",
      athleteName: "Liban Maxamed",
      sourceName: "Swiss Basketball — source officielle",
      sourceUrl: "https://swiss.basketball/schedule",
      articleUrl: "https://swiss.basketball/basketplan/showGameOverview.do?gameId=371504",
      title: "Sion Basket 82–74 Académie Union Neuchâtel Basket U23 — Cadbullahi Maxamed Liban",
      excerpt: [
        "Source : Swiss Basketball — source officielle.",
        "Compétition : NL1 Men · 2026-2027.",
        "Équipe : Sion Basket.",
        "Match : Sion Basket 82–74 Académie Union Neuchâtel Basket U23.",
        "Date : 2026-11-13.",
        "Évolution par quart-temps selon la feuille officielle : Q1 25–11, Q2 12–17, Q3 28–18, Q4 17–28.",
        "Présence nominative : Cadbullahi Maxamed Liban, identifiant joueur 76411, numéro 11.",
        "Titularisation : non.",
        "Participation établie par une donnée individuelle explicite.",
        "Statistiques individuelles explicitement présentes : PTS 21.",
        "Minutes et autres statistiques absentes : aucune valeur n’est déduite.",
      ].join(" "),
      resultKind: "individual_result",
      publicationDate: null,
      eventDateFrom: "2026-11-13",
      eventDateTo: "2026-11-13",
      collectedAt: "2026-11-16T07:00:00.000Z",
      attributionStatus: "matched",
      attributionEvidence: ["Identifiant officiel 76411 relu dans la feuille 371504."],
      verificationStatus: "verified",
      adminStatus: "validated",
      supersedesCandidateId: null,
      version: 1,
    };
    const materials = buildSportsWatchArticleMaterials(
      candidate,
      "Swiss Basketball — source officielle · Vérification factuelle : vérifiée",
      "2026-11-13",
      [
        `Athlète associé : ${candidate.athleteName}.`,
        "Statut factuel : participation individuelle établie.",
        `Actualité : ${candidate.title}.`,
        candidate.excerpt,
      ].join(" "),
    );
    expect(materials.length).toBeGreaterThan(1);
    expect(materials.find((material) => material.text.includes("aucune valeur n’est déduite"))).toMatchObject({
      statementType: "editorial_lead",
      category: "user_note",
    });
    expect(materials.filter((material) => material.statementType === "fact").every((material) => material.factKey)).toBe(true);

    const connectorResult = await resolveConnector("manual")!.collect({
      workspaceId: access.workspaceId,
      subject: {
        id: candidate.athleteId,
        source: "crm",
        type: "person",
        displayName: candidate.athleteName,
        sport: "Basketball",
      },
      selectedConnectorIds: ["manual"],
      dateRange: { preset: "last_30_days", from: "2026-10-17", to: "2026-11-16" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr-CH",
      manualEditorialMaterials: materials,
      contentType: "interview",
      interviewType: "after_match",
    });
    const sportsWatchItems = connectorResult.items;
    expect(sportsWatchItems.filter((item) => item.statementType === "fact").every((item) =>
      item.verificationStatus === "verified"
      && item.confidence === "high"
      && item.isSelected
      && typeof item.metadata.factKey === "string"
    )).toBe(true);
    expect(sportsWatchItems.find((item) => item.factualStatement.includes("aucune valeur n’est déduite"))).toMatchObject({
      statementType: "editorial_lead",
      category: "user_note",
      confidence: "unknown",
    });

    const sportsWatchCollection = {
      ...collection,
      items: sportsWatchItems,
      summary: {
        ...collection.summary,
        totalItemsFound: sportsWatchItems.length,
        selectedItemsCount: sportsWatchItems.length,
        researchedAt: "2026-11-16T07:00:00.000Z",
        dateRange: { preset: "last_30_days" as const, from: "2026-10-17", to: "2026-11-16" },
      },
      createdAt: "2026-11-16T07:00:00.000Z",
      expiresAt: "2026-11-16T08:00:00.000Z",
    };
    const prepared = await prepareEditorialGeneration({
      contextSelection: {
        collectionId: sportsWatchCollection.id,
        selectedItemIds: sportsWatchItems.map((item) => item.id),
        manualEdits: [],
      },
      subject: {
        id: candidate.athleteId,
        source: "crm",
        type: "person",
        displayName: candidate.athleteName,
        sport: "Basketball",
      },
      target: { type: "interview", interviewType: "after_match" },
      access,
      store: store(sportsWatchCollection),
      now: new Date("2026-11-16T07:10:00.000Z"),
    });
    const transmittedFacts = prepared.selectedItems.map((item) => item.factualStatement).join(" ");
    const readiness = assessInterviewBriefReadiness({
      interviewType: "after_match",
      questionCount: 8,
      selectedContextItems: prepared.selectedItems,
    });

    expect(transmittedFacts).toContain("82–74");
    expect(transmittedFacts).toContain("PTS 21");
    expect(transmittedFacts).toContain("Q1 25–11");
    expect(transmittedFacts).toContain("Q4 17–28");
    expect(readiness.ready).toBe(true);
    expect(readiness.verifiedAnchorCount).toBeGreaterThanOrEqual(8);
  });

  it("still reports incompatible scores for the same Sports Watch match", async () => {
    const candidate = (id: string, score: string): SportsWatchCandidate => ({
      id,
      athleteId: "liban-maxamed",
      athleteName: "Liban Maxamed",
      sourceName: "Swiss Basketball — source officielle",
      sourceUrl: "https://swiss.basketball/schedule",
      articleUrl: "https://swiss.basketball/basketplan/showGameOverview.do?gameId=371504",
      title: `Sion Basket ${score} Académie Union Neuchâtel Basket U23`,
      excerpt: `Match : Sion Basket ${score} Académie Union Neuchâtel Basket U23.`,
      resultKind: "individual_result",
      publicationDate: null,
      eventDateFrom: "2026-11-13",
      eventDateTo: "2026-11-13",
      collectedAt: "2026-11-16T07:00:00.000Z",
      attributionStatus: "matched",
      attributionEvidence: ["Feuille officielle 371504."],
      verificationStatus: "verified",
      adminStatus: "validated",
      supersedesCandidateId: null,
      version: 1,
    });
    const candidates = [
      candidate("22222222-2222-4222-8222-222222222222", "82–74"),
      candidate("33333333-3333-4333-8333-333333333333", "80–76"),
    ];
    const materials = candidates.flatMap((item) =>
      buildSportsWatchArticleMaterials(item, "Swiss Basketball — source officielle", "2026-11-13"));
    expect(new Set(materials.map((material) => material.factKey))).toEqual(new Set([
      "sports-watch:match-371504:score",
    ]));
    const connectorResult = await resolveConnector("manual")!.collect({
      workspaceId: access.workspaceId,
      subject: {
        id: "liban-maxamed",
        source: "crm",
        type: "person",
        displayName: "Liban Maxamed",
        sport: "Basketball",
      },
      selectedConnectorIds: ["manual"],
      dateRange: { preset: "last_30_days", from: "2026-10-17", to: "2026-11-16" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr-CH",
      manualEditorialMaterials: materials,
      contentType: "interview",
      interviewType: "after_match",
    });
    const contradictoryCollection = {
      ...collection,
      items: connectorResult.items,
      summary: {
        ...collection.summary,
        totalItemsFound: connectorResult.items.length,
        selectedItemsCount: connectorResult.items.length,
      },
      createdAt: "2026-11-16T07:00:00.000Z",
      expiresAt: "2026-11-16T08:00:00.000Z",
    };

    await expect(prepareEditorialGeneration({
      contextSelection: {
        collectionId: contradictoryCollection.id,
        selectedItemIds: contradictoryCollection.items.map((item) => item.id),
        manualEdits: [],
      },
      subject: {
        id: "liban-maxamed",
        source: "crm",
        type: "person",
        displayName: "Liban Maxamed",
        sport: "Basketball",
      },
      target: { type: "interview", interviewType: "after_match" },
      access,
      store: store(contradictoryCollection),
      now: new Date("2026-11-16T07:10:00.000Z"),
    })).rejects.toMatchObject({
      eligibility: {
        contradictionSummaries: [expect.stringContaining("Contradiction non resolue")],
      },
    });

    const playerStatistics = [
      {
        ...candidate("44444444-4444-4444-8444-444444444444", "82–74"),
        athleteId: "liban-maxamed",
        athleteName: "Liban Maxamed",
        excerpt: "Statistiques individuelles explicitement présentes : PTS 21.",
      },
      {
        ...candidate("55555555-5555-4555-8555-555555555555", "82–74"),
        athleteId: "autre-joueur",
        athleteName: "Autre Joueur",
        excerpt: "Statistiques individuelles explicitement présentes : PTS 12.",
      },
    ];
    const statisticMaterials = playerStatistics.flatMap((item) =>
      buildSportsWatchArticleMaterials(item, "Swiss Basketball — source officielle", "2026-11-13"));
    expect(new Set(statisticMaterials.map((material) => material.factKey))).toEqual(new Set([
      "sports-watch:match-371504:athlete-liban-maxamed:statistics",
      "sports-watch:match-371504:athlete-autre-joueur:statistics",
    ]));
    const statisticConnectorResult = await resolveConnector("manual")!.collect({
      workspaceId: access.workspaceId,
      subject: {
        id: "liban-maxamed",
        source: "crm",
        type: "person",
        displayName: "Liban Maxamed",
        sport: "Basketball",
      },
      selectedConnectorIds: ["manual"],
      dateRange: { preset: "last_30_days", from: "2026-10-17", to: "2026-11-16" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr-CH",
      manualEditorialMaterials: statisticMaterials,
      contentType: "interview",
      interviewType: "after_match",
    });
    const statisticCollection = {
      ...collection,
      items: statisticConnectorResult.items,
      summary: {
        ...collection.summary,
        totalItemsFound: statisticConnectorResult.items.length,
        selectedItemsCount: statisticConnectorResult.items.length,
      },
      createdAt: "2026-11-16T07:00:00.000Z",
      expiresAt: "2026-11-16T08:00:00.000Z",
    };
    const preparedStatistics = await prepareEditorialGeneration({
      contextSelection: {
        collectionId: statisticCollection.id,
        selectedItemIds: statisticCollection.items.map((item) => item.id),
        manualEdits: [],
      },
      subject: {
        id: "liban-maxamed",
        source: "crm",
        type: "person",
        displayName: "Liban Maxamed",
        sport: "Basketball",
      },
      target: { type: "interview", interviewType: "after_match" },
      access,
      store: store(statisticCollection),
      now: new Date("2026-11-16T07:10:00.000Z"),
    });
    expect(preparedStatistics.eligibility.contradictionSummaries).toEqual([]);
  });

  it("rebuilds a compatible 8B2 dossier from an authorized 8B1 collection", async () => {
    const prepared = await prepareEditorialGeneration({
      contextSelection: {
        collectionId: collection.id,
        selectedItemIds: collection.items.map((item) => item.id),
        manualEdits: [],
      },
      subject: editorialDossierSubject,
      target: { type: "interview", interviewType: "portrait" },
      access,
      store: store(collection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    });

    expect(prepared.selection.modelContext.subject.displayName).toBe("Mila Martin");
    expect(prepared.selection.metadata.dossierRevision).toBe(1);
    expect(prepared.selectedItems.length).toBeGreaterThan(0);
    expect(JSON.stringify(prepared.selectedItems)).not.toContain("Douleur au genou strictement privee");
    expect(prepared.selectedItems.every((item) => item.id.startsWith("editorial-"))).toBe(true);
  });

  it("refuses expired, foreign and modified collections before selection", async () => {
    const base = {
      contextSelection: {
        collectionId: collection.id,
        selectedItemIds: ["official-result"],
        manualEdits: [],
      },
      subject: editorialDossierSubject,
      target: { type: "article", articleType: "actualite" } as const,
      access,
    };

    await expect(prepareEditorialGeneration({
      ...base,
      store: store(collection),
      now: new Date("2026-10-19T10:31:00.000Z"),
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(prepareEditorialGeneration({
      ...base,
      access: { ...access, workspaceId: "workspace-2" },
      store: store(collection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(prepareEditorialGeneration({
      ...base,
      contextSelection: { ...base.contextSelection, selectedItemIds: ["invented-item"] },
      store: store(collection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("blocks before provider work when the dossier has no exploitable article fact", async () => {
    const limitedCollection = {
      ...collection,
      items: editorialDossierItems.filter((item) => item.id === "crm-name" || item.id === "manual-note"),
    };
    await expect(prepareEditorialGeneration({
      contextSelection: {
        collectionId: collection.id,
        selectedItemIds: limitedCollection.items.map((item) => item.id),
        manualEdits: [],
      },
      subject: editorialDossierSubject,
      target: { type: "article", articleType: "actualite" },
      access,
      store: store(limitedCollection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    })).rejects.toBeInstanceOf(EditorialGenerationBlockedError);
  });
});
