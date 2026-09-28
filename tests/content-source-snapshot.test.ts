import { describe, expect, it } from "vitest";
import { buildSourceDocumentSnapshot } from "@/services/content-variants/source-snapshot";
import type { InterviewDocument, PublicationDocument } from "@/types/content-document";

const timestamp = "2026-09-27T10:00:00.000Z";

const commonDocument = {
  id: "document-publication-1",
  status: "draft" as const,
  createdAt: timestamp,
  updatedAt: timestamp,
  versions: [{ id: "version-1", createdAt: timestamp, label: "Version initiale", source: "generation" as const }],
  activeVersionId: "version-1",
  sidebar: {
    subject: "Alpha Martin",
    source: "crm" as const,
    objective: "narrate",
    platform: "instagram",
    tone: "authentic",
    audience: "general",
    format: "instagram",
    templateVersion: "v1",
    provider: "openai",
    model: "gpt",
    generatedAt: timestamp,
  },
  metadata: {
    provider: "openai",
    model: "gpt",
    templateId: "publication" as const,
    templateKey: "publication:v1" as const,
    templateVersion: "v1",
    promptVersion: "v1",
    generatedAt: timestamp,
    generationDurationMs: 10,
    questionCountRequested: 3,
    questionCountGenerated: 3,
    reliabilityNotes: [],
    missingInformation: [],
    externalContextUsed: false,
  },
  contextUsage: {
    usedContextItemIds: ["context-1"],
    usedSourceIds: ["source-1"],
    unusedSelectedContextItemIds: [],
    researchedAt: timestamp,
    dateRange: { preset: "last_30_days" as const, from: "2026-08-29", to: "2026-09-27" },
    externalContextUsed: false,
    selectedItems: [{
      id: "context-1",
      connectorId: "manual" as const,
      category: "user_note" as const,
      title: "Fait du match",
      summary: "Victoire 2-1",
      factualStatement: "Victoire 2-1",
      statementType: "fact" as const,
      sourceType: "user" as const,
      sourceName: "Utilisateur",
      retrievedAt: timestamp,
      confidence: "high" as const,
      verificationStatus: "user_provided" as const,
      isSelected: true,
      isEditable: true,
      metadata: {},
    }],
  },
};

const publicationDocument = (sourceContext?: PublicationDocument["sourceContext"]): PublicationDocument => ({
  ...commonDocument,
  type: "publication",
  sourceContext,
  sections: {
    title: "Une victoire au bout du suspense",
    editorialAngle: "Le collectif jusqu au bout",
    hook: "Alpha Martin renverse le match.",
    text: "Le texte principal de la publication.",
    cta: "Rendez-vous samedi.",
    hashtags: ["#KLIQUE", "#MatchDay"],
    visualSuggestion: "Photo de célébration au coup de sifflet final.",
    editorialNote: "Conserver un ton factuel et incarné.",
  },
});

describe("publication source snapshots", () => {
  it("builds a complete after-match publication snapshot", () => {
    const snapshot = buildSourceDocumentSnapshot({
      document: publicationDocument({
        afterMatch: {
          opponent: "FC Exemple",
          result: "Victoire 2-1",
          competition: "Championnat",
          matchDate: "2026-09-26",
          keyFacts: "But decisif a la 88e minute",
          nextFixture: "Deplacement samedi prochain",
        },
      }),
      includePrivateNotes: false,
      includedPrivateNoteQuestionIds: [],
    });

    expect(snapshot).toMatchObject({
      documentId: "document-publication-1",
      documentType: "publication",
      subjectName: "Alpha Martin",
      objective: "narrate",
      title: "Une victoire au bout du suspense",
      editorialAngle: "Le collectif jusqu au bout",
      publication: {
        hook: "Alpha Martin renverse le match.",
        text: "Le texte principal de la publication.",
        cta: "Rendez-vous samedi.",
        hashtags: ["#KLIQUE", "#MatchDay"],
        visualSuggestion: "Photo de célébration au coup de sifflet final.",
        editorialNote: "Conserver un ton factuel et incarné.",
        afterMatch: {
          opponent: "FC Exemple",
          result: "Victoire 2-1",
          competition: "Championnat",
          matchDate: "2026-09-26",
          keyFacts: "But decisif a la 88e minute",
          nextFixture: "Deplacement samedi prochain",
        },
      },
    });
    expect(snapshot.selectedContextItems).toEqual(commonDocument.contextUsage.selectedItems);
  });

  it("builds a normal publication snapshot without after-match data", () => {
    const snapshot = buildSourceDocumentSnapshot({
      document: publicationDocument(),
      includePrivateNotes: false,
      includedPrivateNoteQuestionIds: [],
    });

    expect(snapshot.documentType).toBe("publication");
    expect(snapshot.publication?.afterMatch).toBeUndefined();
    expect(snapshot.publication?.text).toBe("Le texte principal de la publication.");
  });

  it("normalizes absent optional publication fields", () => {
    const legacyDocument = {
      ...publicationDocument(),
      sections: {
        title: "Ancienne publication",
        editorialAngle: "Angle historique",
        hook: "Accroche historique",
        text: "Texte historique",
      },
    } as unknown as PublicationDocument;

    const snapshot = buildSourceDocumentSnapshot({
      document: legacyDocument,
      includePrivateNotes: false,
      includedPrivateNoteQuestionIds: [],
    });

    expect(snapshot.publication).toMatchObject({
      cta: "",
      hashtags: [],
      visualSuggestion: "",
      editorialNote: "",
    });
  });

  it("keeps the existing interview snapshot contract", () => {
    const interview = {
      ...commonDocument,
      id: "document-interview-1",
      type: "interview",
      sidebar: { ...commonDocument.sidebar, objective: "interview", interviewType: "portrait", questionCount: 1 },
      sections: {
        title: "Portrait",
        editorialAngle: "Le parcours",
        introduction: "Introduction",
        questions: [{ id: "q1", text: "Question ?", purpose: "Comprendre", topic: "Parcours", followUps: [], locked: false, privateNotes: "Prive" }],
        conclusion: "Conclusion",
      },
    } as InterviewDocument;

    const snapshot = buildSourceDocumentSnapshot({
      document: interview,
      includePrivateNotes: false,
      includedPrivateNoteQuestionIds: [],
    });

    expect(snapshot).not.toHaveProperty("publication");
    expect(snapshot).not.toHaveProperty("objective");
    expect(snapshot.questions[0]).toHaveProperty("includedPrivateNote", undefined);
    expect(snapshot.title).toBe("Portrait");
  });
});