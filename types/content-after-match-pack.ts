import type { ContentVariant } from "@/types/content-variant";

export type AfterMatchPackDeliverable = "reel" | "stories";

export type AfterMatchPackStatus = "pending" | "generating" | "partial" | "completed" | "failed";

export type AfterMatchPackDeliverableStatus = "pending" | "generating" | "completed" | "failed";

export type AfterMatchPackCreditStatus =
  | "pending"
  | "not_required"
  | "not_consumed"
  | "consumed"
  | "refund_pending"
  | "refunded";

export type AfterMatchPackDeliverableView = {
  status: AfterMatchPackDeliverableStatus;
  attemptCount: number;
  creditStatus: AfterMatchPackCreditStatus;
  errorCode: string | null;
  variant: ContentVariant | null;
};

export type AfterMatchPackView = {
  id: string;
  sourceDocumentId: string;
  sourceDocumentStorageVersion: number;
  sourceDocumentVersionId: string;
  sourceDocumentUpdatedAt: string;
  status: AfterMatchPackStatus;
  reel: AfterMatchPackDeliverableView;
  stories: AfterMatchPackDeliverableView;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type CreateOrResumeAfterMatchPackInput = {
  sourceDocumentId: string;
  expectedSourceDocumentStorageVersion: number;
  expectedSourceDocumentVersionId: string;
  expectedSourceDocumentUpdatedAt: string;
};

export type GetAfterMatchPackBySourceRevisionInput = {
  sourceDocumentId: string;
  sourceDocumentRevision: number;
};