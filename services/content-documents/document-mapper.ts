import type {
  PublicationGenerationRequest,
  PublicationGenerationResult,
  InterviewGenerationRequest,
  InterviewGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
} from "@/types/content-generation";
import type {
  ContentDocument,
  InterviewDocument,
  InterviewDocumentQuestion,
  PublicationDocument,
  ReelDocument,
} from "@/types/content-document";

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

export const cloneContentDocument = (document: ContentDocument): ContentDocument => {
  return JSON.parse(JSON.stringify(document)) as ContentDocument;
};
