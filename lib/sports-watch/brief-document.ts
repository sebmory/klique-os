import type { ArticleDocument } from "@/types/content-document";
import type { SportsWatchBriefCandidate } from "@/types/sports-watch";
import type { SportsBriefAngle } from "@/lib/sports-watch/brief-text-generator";

export const SPORTS_BRIEF_DOCUMENT_FORMAT = "Brève sportive";
export const SPORTS_BRIEF_TEMPLATE_VERSION = "sports-brief-v1";

export type SportsBriefDraftFields = {
  title: string;
  lead: string;
  body: string;
};

export type SportsBriefSource = {
  candidateId: string;
  athleteId: string;
  athleteName: string;
  sourceName: string;
  articleUrl: string;
  eventDate: string | null;
  verificationStatus: SportsWatchBriefCandidate["verificationStatus"];
};

export const briefSourceFromCandidate = (
  candidate: SportsWatchBriefCandidate,
): SportsBriefSource => ({
  candidateId: candidate.id,
  athleteId: candidate.athleteId,
  athleteName: candidate.athleteName,
  sourceName: candidate.sourceName,
  articleUrl: candidate.articleUrl,
  eventDate: candidate.eventDateFrom
    ?? candidate.publicationDate?.slice(0, 10)
    ?? candidate.collectedAt.slice(0, 10),
  verificationStatus: candidate.verificationStatus,
});

const splitBodyParagraphs = (body: string): string[] =>
  body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const countWords = (fields: SportsBriefDraftFields): number =>
  [fields.title, fields.lead, fields.body]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

export class SportsBriefDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportsBriefDocumentError";
  }
}

export const isSportsBriefDocument = (document: {
  type: string;
  sidebar?: { format?: string };
}): boolean =>
  document.type === "article" && document.sidebar?.format === SPORTS_BRIEF_DOCUMENT_FORMAT;

export const buildSportsBriefDocument = (input: {
  id: string;
  now: string;
  fields: SportsBriefDraftFields;
  angle: SportsBriefAngle;
  source: SportsBriefSource;
  existing?: ArticleDocument;
}): ArticleDocument => {
  const title = input.fields.title.trim();
  const lead = input.fields.lead.trim();
  const paragraphs = splitBodyParagraphs(input.fields.body);
  if (!title || !lead || paragraphs.length === 0) {
    throw new SportsBriefDocumentError(
      "Le titre, le chapô et le corps de texte sont requis pour enregistrer la brève.",
    );
  }

  const versionId = `${input.id}-v${(input.existing?.versions.length ?? 0) + 1}`;
  const versions = [
    ...(input.existing?.versions ?? []),
    {
      id: versionId,
      createdAt: input.now,
      label: input.existing ? "Brève mise à jour" : "Brève initiale",
      source: "manual" as const,
    },
  ];

  return {
    id: input.id,
    type: "article",
    status: "draft",
    createdAt: input.existing?.createdAt ?? input.now,
    updatedAt: input.now,
    versions,
    activeVersionId: versionId,
    sidebar: {
      subject: input.source.athleteName,
      source: "crm",
      objective: "article",
      tone: "Factuel",
      audience: "Communauté du club et grand public",
      format: SPORTS_BRIEF_DOCUMENT_FORMAT,
      length: "breve",
      templateVersion: SPORTS_BRIEF_TEMPLATE_VERSION,
      provider: "klique-local",
      model: "redaction-deterministe",
      generatedAt: input.now,
    },
    metadata: {
      provider: "klique-local",
      model: "redaction-deterministe",
      templateId: "article",
      templateKey: "article:v1",
      templateVersion: SPORTS_BRIEF_TEMPLATE_VERSION,
      promptVersion: SPORTS_BRIEF_TEMPLATE_VERSION,
      generatedAt: input.now,
      generationDurationMs: 0,
      questionCountRequested: 0,
      questionCountGenerated: 0,
      reliabilityNotes: input.source.verificationStatus === "verified"
        ? []
        : ["Actualité source non vérifiée : rédaction manuelle uniquement."],
      missingInformation: [],
      externalContextUsed: false,
    },
    contextUsage: {
      usedContextItemIds: [`sports-watch-${input.source.candidateId}`],
      usedSourceIds: [],
      unusedSelectedContextItemIds: [],
      externalContextUsed: false,
    },
    sections: {
      title,
      subtitle: null,
      lead,
      sections: [
        {
          order: 1,
          heading: "Brève",
          paragraphs,
        },
      ],
      conclusion: "",
      usedCitations: [],
      usedSources: [
        {
          title: `${input.source.sourceName}${
            input.source.eventDate ? ` · ${input.source.eventDate}` : ""
          } · Vérification : ${
            input.source.verificationStatus === "verified"
              ? "vérifiée"
              : input.source.verificationStatus === "disputed"
                ? "contestée"
                : "non vérifiée"
          }`,
          url: input.source.articleUrl,
        },
      ],
      estimatedWordCount: countWords(input.fields),
      articleType: "actualite",
      articleLength: "breve",
      selectedAngle: { id: input.angle.id, title: input.angle.title },
      selectedStructure: {
        id: `sports-brief-${input.angle.id}`,
        title: `Brève sportive — ${input.angle.title}`,
        editorialPromise: input.angle.intent,
        estimatedWordCount: countWords(input.fields),
        sections: [
          {
            order: 1,
            title: "Brève",
            purpose: "Chapô court puis corps factuel sourcé.",
            points: [],
          },
        ],
      },
    },
  };
};

export const briefFieldsFromDocument = (
  document: ArticleDocument,
): SportsBriefDraftFields => ({
  title: document.sections.title,
  lead: document.sections.lead,
  body: document.sections.sections
    .flatMap((section) => section.paragraphs)
    .join("\n\n"),
});

export const briefCandidateIdFromDocument = (document: ArticleDocument): string | null => {
  const reference = document.contextUsage.usedContextItemIds.find((id) =>
    id.startsWith("sports-watch-"));
  return reference ? reference.slice("sports-watch-".length) : null;
};
