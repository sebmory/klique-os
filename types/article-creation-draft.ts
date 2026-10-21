import type { CreationAssistantDraft } from "@/services/content-creation-assistant";
import type {
  ArticleStructureSuggestion,
  PublicationAngleSuggestion,
} from "@/types/content-generation";
import type {
  ContextConnectorReport,
  ContextDateRange,
  ContextItem,
} from "@/types/context-intelligence";

export const ARTICLE_CREATION_DRAFT_SCHEMA_VERSION = 1;
export const ARTICLE_CREATION_DRAFT_MAX_BYTES = 256 * 1024;

export type ArticleCreationDraftStepId =
  | "subject"
  | "objective"
  | "parameters"
  | "context"
  | "angle"
  | "structure"
  | "summary";

export type ArticleCreationDraftPayload = {
  schemaVersion: 1;
  contextKey: string;
  draft: CreationAssistantDraft;
  stepId: ArticleCreationDraftStepId;
  contextState: {
    collectionId?: string;
    expiresAt?: string;
    items: ContextItem[];
    reports: ContextConnectorReport[];
    researchedAt?: string;
    dateRange?: ContextDateRange;
    hasCollected: boolean;
  };
  articleWorkflow: {
    suggestions: PublicationAngleSuggestion[];
    structures: ArticleStructureSuggestion[];
    selectedStructureId: string;
    choicesNeedReview: boolean;
  };
};

export type ArticleCreationDraftSummary = {
  id: string;
  displayTitle: string;
  subjectName: string;
  stepId: ArticleCreationDraftStepId;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ArticleCreationDraftRecord = ArticleCreationDraftSummary & {
  clientCreationId: string;
  payload: ArticleCreationDraftPayload;
};
