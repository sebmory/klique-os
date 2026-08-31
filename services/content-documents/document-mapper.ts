import type {
  PublicationGenerationRequest,
  PublicationGenerationResult,
  InterviewGenerationRequest,
  InterviewGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
  StoryGenerationRequest,
  StoryGenerationResult,
} from "@/types/content-generation";
import type {
  ArticleDocument,
  ContentDocument,
  InterviewDocument,
  InterviewDocumentQuestion,
  PublicationDocument,
  ReelDocument,
  StoryDocument,
} from "@/types/content-document";
import type { StoredArticleResult } from "@/services/content-result-sessions";

const buildQuestion = (
  question: InterviewGenerationResult["questions"][number],
  index: number
): InterviewDocumentQuestion => ({
  id: question.id || `question-${index + 1}`,
  text: question.text,
  purpose: question.purpose,
  topic: question.topic,
  followUps: [...question.followUps],
  locked: false,
  privateNotes: "",
});

export const mapInterviewGenerationToDocument = (args: {
  request: InterviewGenerationRequest;
  result: InterviewGenerationResult;
  createdAt?: string;
  documentId?: string;
}): InterviewDocument => {
  const createdAt = args.createdAt || args.result.metadata.generatedAt || new Date().toISOString();
  const versionId = "version-1";
  const documentId = args.documentId || `document-${createdAt}`;

  return {
    id: documentId,
    type: "interview",
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    versions: [
      {
        id: versionId,
        createdAt,
        label: "Version initiale",
        source: "generation",
      },
    ],
    activeVersionId: versionId,
    sidebar: {
      subject: args.request.context.displayName,
      source: args.request.context.source,
      objective: args.request.brief.objective,
      interviewType: args.request.brief.interviewType,
      tone: args.request.brief.tone,
      audience: args.request.brief.audience,
      format: args.request.brief.format,
      questionCount: args.request.brief.questionCount,
      templateVersion: args.result.metadata.templateVersion,
      provider: args.result.metadata.provider,
      model: args.result.metadata.model,
      generatedAt: args.result.metadata.generatedAt,
    },
    metadata: args.result.metadata,
    contextUsage: args.result.contextUsage,
    sections: {
      title: args.result.title,
      editorialAngle: args.result.editorialAngle,
      introduction: args.result.introduction,
      questions: args.result.questions.map(buildQuestion),
      conclusion: args.result.conclusion,
    },
  };
};

export const mapPublicationGenerationToDocument = (args: {
  request: PublicationGenerationRequest;
  result: PublicationGenerationResult;
  selectedProposalId: string;
  createdAt?: string;
  documentId?: string;
}): PublicationDocument => {
  const createdAt = args.createdAt || args.result.metadata.generatedAt || new Date().toISOString();
  const versionId = "version-1";
  const documentId = args.documentId || `document-${createdAt}`;
  const proposal = args.result.proposals.find((item) => item.id === args.selectedProposalId) || args.result.proposals[0];

  return {
    id: documentId,
    type: "publication",
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    versions: [
      {
        id: versionId,
        createdAt,
        label: "Version initiale",
        source: "generation",
      },
    ],
    activeVersionId: versionId,
    sidebar: {
      subject: args.request.context.displayName,
      source: args.request.context.source,
      objective: args.request.brief.objective,
      platform: args.request.brief.platform,
      length: args.request.brief.length,
      tone: args.request.brief.tone,
      audience: args.request.brief.audience,
      format: args.request.brief.platform,
      templateVersion: args.result.metadata.templateVersion,
      provider: args.result.metadata.provider,
      model: args.result.metadata.model,
      generatedAt: args.result.metadata.generatedAt,
    },
    metadata: args.result.metadata,
    contextUsage: args.result.contextUsage,
    sections: {
      title: args.result.title,
      editorialAngle: args.result.selectedAngle,
      hook: proposal?.hook ?? "",
      text: proposal?.text ?? "",
      cta: proposal?.cta ?? "",
      hashtags: proposal?.hashtags ?? [],
      visualSuggestion: proposal?.visualSuggestion ?? "",
      editorialNote: proposal?.editorialNote ?? "",
    },
  };
};

export const mapReelGenerationToDocument = (args: {
  request: ReelGenerationRequest;
  result: ReelGenerationResult;
  selectedConceptId: string;
  createdAt?: string;
  documentId?: string;
}): ReelDocument => {
  const createdAt = args.createdAt || args.result.metadata.generatedAt || new Date().toISOString();
  const versionId = "version-1";
  const documentId = args.documentId || `document-${createdAt}`;
  const concept = args.result.concepts.find((item) => item.id === args.selectedConceptId) || args.result.concepts[0];

  return {
    id: documentId,
    type: "reel",
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    versions: [
      {
        id: versionId,
        createdAt,
        label: "Version initiale",
        source: "generation",
      },
    ],
    activeVersionId: versionId,
    sidebar: {
      subject: args.request.context.displayName,
      source: args.request.context.source,
      objective: args.request.brief.objective,
      platform: args.request.brief.platform,
      length: args.request.brief.duration,
      tone: args.request.brief.tone,
      audience: args.request.brief.audience,
      format: args.request.brief.format,
      templateVersion: args.result.metadata.templateVersion,
      provider: args.result.metadata.provider,
      model: args.result.metadata.model,
      generatedAt: args.result.metadata.generatedAt,
    },
    metadata: args.result.metadata,
    contextUsage: args.result.contextUsage,
    sections: {
      title: args.result.title,
      editorialAngle: args.result.selectedAngle,
      hook: concept?.hook ?? "",
      concept: concept?.concept ?? "",
      scenes: concept?.scenes ?? [],
      cta: concept?.cta ?? "",
      caption: concept?.caption ?? "",
      hashtags: concept?.hashtags ?? [],
      coverIdea: concept?.coverIdea ?? "",
    },
  };
};

export const mapStoryGenerationToDocument = (args: {
  request: StoryGenerationRequest;
  result: StoryGenerationResult;
  selectedSequenceId: string;
  createdAt?: string;
  documentId?: string;
}): StoryDocument => {
  const createdAt = args.createdAt || args.result.metadata.generatedAt || new Date().toISOString();
  const versionId = "version-1";
  const documentId = args.documentId || `document-${createdAt}`;
  const sequence = args.result.sequences.find((item) => item.id === args.selectedSequenceId) || args.result.sequences[0];

  return {
    id: documentId,
    type: "story",
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    versions: [
      {
        id: versionId,
        createdAt,
        label: "Version initiale",
        source: "generation",
      },
    ],
    activeVersionId: versionId,
    sidebar: {
      subject: args.request.context.displayName,
      source: args.request.context.source,
      objective: args.request.brief.objective,
      platform: args.request.brief.platform,
      tone: args.request.brief.tone,
      audience: args.request.brief.audience,
      format: args.request.brief.platform,
      templateVersion: args.result.metadata.templateVersion,
      provider: args.result.metadata.provider,
      model: args.result.metadata.model,
      generatedAt: args.result.metadata.generatedAt,
    },
    metadata: args.result.metadata,
    contextUsage: args.result.contextUsage,
    sections: {
      title: args.result.title,
      editorialAngle: args.result.selectedAngle,
      hook: sequence?.hook ?? "",
      frames: sequence?.frames ?? [],
      cta: sequence?.cta ?? "",
      caption: sequence?.caption ?? "",
      hashtags: sequence?.hashtags ?? [],
    },
  };
};

export const mapArticleGenerationToDocument = (args: {
  storedArticleResult: StoredArticleResult;
  documentId?: string;
}): ArticleDocument => {
  const { request, result, selectedAngle, selectedStructure, generationMetadata } = args.storedArticleResult;
  const createdAt = args.storedArticleResult.createdAt || generationMetadata.generatedAt || new Date().toISOString();
  const versionId = "version-1";
  const documentId = args.documentId || `document-${createdAt}`;
  const selectedContextItems = request.selectedContextItems;
  const metadata = {
    provider: generationMetadata.provider,
    model: generationMetadata.model,
    templateId: "article" as const,
    templateKey: "article:v1" as const,
    templateVersion: result.metadata.templateVersion,
    promptVersion: request.rulesVersion,
    generatedAt: generationMetadata.generatedAt,
    generationDurationMs: generationMetadata.generationDurationMs,
    questionCountRequested: 0,
    questionCountGenerated: 0,
    reliabilityNotes: [],
    missingInformation: [],
    externalContextUsed: selectedContextItems.some((item) => item.sourceType !== "internal"),
  };

  return {
    id: documentId,
    type: "article",
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    versions: [{ id: versionId, createdAt, label: "Version initiale", source: "generation" }],
    activeVersionId: versionId,
    sidebar: {
      subject: request.context.displayName,
      source: request.context.source,
      objective: request.brief.objective,
      length: request.brief.length,
      tone: request.brief.tone,
      audience: request.brief.audience,
      format: request.brief.articleType,
      templateVersion: result.metadata.templateVersion,
      provider: generationMetadata.provider,
      model: generationMetadata.model,
      generatedAt: generationMetadata.generatedAt,
    },
    metadata,
    contextUsage: {
      usedContextItemIds: selectedContextItems.map((item) => item.id),
      usedSourceIds: selectedContextItems.map((item) => item.sourceUrl || `${item.sourceType}:${item.sourceName}`),
      unusedSelectedContextItemIds: [],
      researchedAt: request.contextSelection.researchedAt,
      dateRange: request.contextSelection.dateRange,
      externalContextUsed: selectedContextItems.some((item) => item.sourceType !== "internal"),
      selectedItems: selectedContextItems,
    },
    sections: {
      title: result.title,
      subtitle: result.subtitle ?? null,
      lead: result.lead,
      sections: result.sections.map((section) => ({ ...section, paragraphs: [...section.paragraphs] })),
      conclusion: result.conclusion,
      usedCitations: result.usedCitations.map((citation) => ({ ...citation })),
      usedSources: result.usedSources.map((source) => ({ ...source })),
      estimatedWordCount: result.estimatedWordCount,
      articleType: request.brief.articleType,
      articleLength: request.brief.length,
      selectedAngle: { ...selectedAngle },
      selectedStructure: {
        ...selectedStructure,
        sections: selectedStructure.sections.map((section) => ({ ...section, points: [...section.points] })),
      },
    },
  };
};

export const cloneContentDocument = (document: ContentDocument): ContentDocument => {
  return JSON.parse(JSON.stringify(document)) as ContentDocument;
};
