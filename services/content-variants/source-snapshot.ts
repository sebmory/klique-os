import type { ContentDocument } from "@/types/content-document";
import type { SourceDocumentSnapshot } from "@/types/content-variant";

const normalize = (value: unknown): string => String(value ?? "").trim();

export const buildSourceDocumentSnapshot = (args: {
  document: ContentDocument;
  includePrivateNotes: boolean;
  includedPrivateNoteQuestionIds: string[];
}): SourceDocumentSnapshot => {
  const { document } = args;

  if (document.type === "publication") {
    return {
      documentId: document.id,
      documentType: document.type,
      documentVersionId: document.activeVersionId,
      documentUpdatedAt: document.updatedAt,
      subjectName: normalize(document.sidebar?.subject),
      objective: normalize(document.sidebar?.objective) || undefined,
      title: normalize(document.sections?.title),
      editorialAngle: normalize(document.sections?.editorialAngle),
      introduction: "",
      questions: [],
      conclusion: "",
      selectedContextItems: document.contextUsage?.selectedItems ?? [],
      contextDateRange: document.contextUsage?.dateRange,
      contextResearchedAt: document.contextUsage?.researchedAt,
      publication: {
        hook: normalize(document.sections?.hook),
        text: normalize(document.sections?.text),
        cta: normalize(document.sections?.cta),
        hashtags: Array.isArray(document.sections?.hashtags)
          ? document.sections.hashtags.map((item) => normalize(item)).filter(Boolean)
          : [],
        visualSuggestion: normalize(document.sections?.visualSuggestion),
        editorialNote: normalize(document.sections?.editorialNote),
        afterMatch: document.sourceContext?.afterMatch
          ? { ...document.sourceContext.afterMatch }
          : undefined,
      },
    };
  }

  if (document.type !== "interview") {
    return {
      documentId: document.id,
      documentType: document.type,
      documentVersionId: document.activeVersionId,
      documentUpdatedAt: document.updatedAt,
      subjectName: document.sidebar.subject,
      title: "",
      editorialAngle: "",
      introduction: "",
      questions: [],
      conclusion: "",
      selectedContextItems: document.contextUsage.selectedItems ?? [],
      contextDateRange: document.contextUsage.dateRange,
      contextResearchedAt: document.contextUsage.researchedAt,
    };
  }

  const selectedPrivateNotes = new Set(args.includedPrivateNoteQuestionIds);

  return {
    documentId: document.id,
    documentType: document.type,
    documentVersionId: document.activeVersionId,
    documentUpdatedAt: document.updatedAt,
    subjectName: document.sidebar.subject,
    title: normalize(document.sections.title),
    editorialAngle: normalize(document.sections.editorialAngle),
    introduction: normalize(document.sections.introduction),
    questions: document.sections.questions.map((question) => ({
      id: question.id,
      text: normalize(question.text),
      purpose: normalize(question.purpose),
      topic: normalize(question.topic),
      followUps: question.followUps.map((item) => normalize(item)).filter(Boolean),
      includedPrivateNote:
        args.includePrivateNotes && selectedPrivateNotes.has(question.id)
          ? normalize(question.privateNotes) || undefined
          : undefined,
    })),
    conclusion: normalize(document.sections.conclusion),
    selectedContextItems: document.contextUsage.selectedItems ?? [],
    contextDateRange: document.contextUsage.dateRange,
    contextResearchedAt: document.contextUsage.researchedAt,
  };
};
