export type MediaSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export type MediaBillingProvider = "manual" | "stripe";

export type MediaSubscriptionRecord = {
  id: string;
  workspaceId: string;
  clerkUserId: string;
  planCode: string;
  status: MediaSubscriptionStatus;
  billingProvider: MediaBillingProvider;
  priceCents: number;
  currency: string;
  creditsPerPeriod: number;
  interval: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivateManualMediaSubscriptionInput = {
  workspaceId: string;
  clerkUserId: string;
  planCode: string;
  periodStart?: string;
  periodEnd?: string;
  existingCreditPeriodId?: string;
};

export type ActivateManualMediaSubscriptionResult =
  | {
      status: "activated";
      subscriptionId: string;
      periodId: string;
      planCode: string;
      periodStart: string;
      periodEnd: string;
      creditsGranted: number;
    }
  | { status: "already_active"; subscriptionId: string }
  | { status: "period_conflict"; conflictingPeriodId: string }
  | { status: "provider_conflict"; subscriptionId: string };
