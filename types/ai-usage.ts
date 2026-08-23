export type AiUsageStatus = "succeeded" | "failed";

export type AiUsageEventInput = {
  requestGroupId: string;
  workspaceId: string;
  clerkUserId: string;
  role: string;
  feature: string;
  operation: string;
  contentType?: string | null;
  provider: string;
  model: string;
  providerResponseId?: string | null;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  toolCalls?: number;
  retryNumber?: number;
  status: AiUsageStatus;
  errorCode?: string | null;
  durationMs?: number | null;
  usageJson?: Record<string, unknown> | null;
  estimatedCostMicroUsd?: number | null;
  pricingVersion?: string | null;
};

export type AiUsageEventRecord = AiUsageEventInput & {
  id: string;
  createdAt: string;
};

// Contexte minimal transmis depuis la route jusqu au provider pour tracer une generation.
export type AiUsageGenerationContext = {
  workspaceId: string;
  clerkUserId: string;
  role: string;
  requestGroupId: string;
};

export type AiUsageSummaryQuery = {
  workspaceId: string;
  from: string;
  to: string;
  clerkUserId?: string;
};

export type AiUsageSummaryTotals = {
  totalEvents: number;
  succeededEvents: number;
  failedEvents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  estimatedCostMicroUsd: number;
  costedEvents: number;
  uncostedEvents: number;
};

export type AiUsageSummaryByUser = AiUsageSummaryTotals & {
  clerkUserId: string;
  role: string;
};

export type AiUsageSummaryByContentType = AiUsageSummaryTotals & {
  contentType: string | null;
};

export type AiUsageSummaryByOperation = AiUsageSummaryTotals & {
  operation: string;
};

export type AiUsageSummary = AiUsageSummaryTotals & {
  byUser: AiUsageSummaryByUser[];
  byContentType: AiUsageSummaryByContentType[];
  byOperation: AiUsageSummaryByOperation[];
};

export type AiCreditPeriodStatus = "active" | "closed";

export type AiCreditPeriodInput = {
  workspaceId: string;
  clerkUserId: string;
  periodStart: string;
  periodEnd: string;
  creditsGranted: number;
};

export type AiCreditBalance = {
  hasActivePeriod: boolean;
  periodId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  creditsGranted: number;
  currentBalance: number;
};

export type AiCreditConsumeInput = {
  workspaceId: string;
  clerkUserId: string;
  requestGroupId?: string | null;
  operation?: string | null;
  idempotencyKey: string;
  at?: string;
};

export type AiCreditConsumeResult =
  | { status: "consumed"; transactionId: string; periodId: string; remainingBalance: number }
  | { status: "already_consumed"; transactionId: string }
  | { status: "insufficient_credits"; periodId: string; currentBalance: number }
  | { status: "no_active_period" };

export type AiCreditRefundInput = {
  workspaceId: string;
  clerkUserId: string;
  requestGroupId?: string | null;
  operation?: string | null;
  originalIdempotencyKey: string;
};

export type AiCreditRefundResult =
  | { status: "refunded"; transactionId: string; periodId: string; remainingBalance: number }
  | { status: "already_refunded"; transactionId: string }
  | { status: "no_consumption" };

export type AiCreditAdjustmentInput = {
  workspaceId: string;
  clerkUserId: string;
  creditDelta: number;
  idempotencyKey: string;
  operation?: string | null;
  at?: string;
};

export type AiCreditAdjustmentResult =
  | { status: "adjusted"; transactionId: string; periodId: string; remainingBalance: number }
  | { status: "already_adjusted"; transactionId: string }
  | { status: "insufficient_credits"; periodId: string; currentBalance: number }
  | { status: "no_active_period" };
