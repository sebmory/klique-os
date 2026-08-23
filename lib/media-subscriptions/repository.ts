import { randomUUID } from "crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getMediaSubscriptionPlan } from "@/lib/media-subscriptions/plans";
import type {
  ActivateManualMediaSubscriptionInput,
  ActivateManualMediaSubscriptionResult,
  MediaBillingProvider,
  MediaSubscriptionRecord,
  MediaSubscriptionStatus,
} from "@/types/media-subscriptions";

const ensureNodeRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("Media subscriptions repository est reserve au serveur.");
  }
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBoolean = (value: unknown): boolean => value === true;

const toIsoDate = (value: unknown): string => {
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const toNullableIsoDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return toIsoDate(value);
};

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = normalize(value);
  return normalized || null;
};

const mapRow = (row: Record<string, unknown>): MediaSubscriptionRecord => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  clerkUserId: String(row.clerk_user_id),
  planCode: String(row.plan_code),
  status: String(row.status) as MediaSubscriptionStatus,
  billingProvider: String(row.billing_provider) as MediaBillingProvider,
  priceCents: toNumber(row.price_cents),
  currency: String(row.currency),
  creditsPerPeriod: toNumber(row.credits_per_period),
  interval: String(row.interval),
  currentPeriodStart: toIsoDate(row.current_period_start),
  currentPeriodEnd: toIsoDate(row.current_period_end),
  cancelAtPeriodEnd: toBoolean(row.cancel_at_period_end),
  providerCustomerId: toNullableString(row.provider_customer_id),
  providerSubscriptionId: toNullableString(row.provider_subscription_id),
  canceledAt: toNullableIsoDate(row.canceled_at),
  createdAt: toIsoDate(row.created_at),
  updatedAt: toIsoDate(row.updated_at),
});

export const getMediaSubscription = async (input: {
  workspaceId: string;
  clerkUserId: string;
}): Promise<MediaSubscriptionRecord | null> => {
  ensureNodeRuntime();

  const workspaceId = normalize(input.workspaceId);
  const clerkUserId = normalize(input.clerkUserId);
  if (!workspaceId || !clerkUserId) {
    throw new Error("workspaceId et clerkUserId sont requis.");
  }

  const sql = createContentStorageClient();
  const rows = (await sql`
    SELECT
      id, workspace_id, clerk_user_id, plan_code, status, billing_provider,
      price_cents, currency, credits_per_period, interval,
      current_period_start, current_period_end, cancel_at_period_end,
      provider_customer_id, provider_subscription_id, canceled_at,
      created_at, updated_at
    FROM media_subscriptions
    WHERE workspace_id = ${workspaceId}
      AND clerk_user_id = ${clerkUserId}
    LIMIT 1
  `) as Record<string, unknown>[];

  return rows[0] ? mapRow(rows[0]) : null;
};

export const listMediaSubscriptionsByWorkspace = async (
  workspaceId: string
): Promise<MediaSubscriptionRecord[]> => {
  ensureNodeRuntime();

  const normalizedWorkspaceId = normalize(workspaceId);
  if (!normalizedWorkspaceId) {
    throw new Error("workspaceId est requis.");
  }

  const sql = createContentStorageClient();
  const rows = (await sql`
    SELECT
      id, workspace_id, clerk_user_id, plan_code, status, billing_provider,
      price_cents, currency, credits_per_period, interval,
      current_period_start, current_period_end, cancel_at_period_end,
      provider_customer_id, provider_subscription_id, canceled_at,
      created_at, updated_at
    FROM media_subscriptions
    WHERE workspace_id = ${normalizedWorkspaceId}
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];

  return rows.map(mapRow);
};

export const activateManualMediaSubscription = async (
  input: ActivateManualMediaSubscriptionInput
): Promise<ActivateManualMediaSubscriptionResult> => {
  ensureNodeRuntime();

  const workspaceId = normalize(input.workspaceId);
  const clerkUserId = normalize(input.clerkUserId);
  if (!workspaceId || !clerkUserId) {
    throw new Error("workspaceId et clerkUserId sont requis.");
  }

  // Le prix et les credits proviennent uniquement du catalogue, jamais de l appelant.
  const plan = getMediaSubscriptionPlan(normalize(input.planCode));
  if (!plan) {
    throw new Error("planCode inconnu.");
  }

  const existingCreditPeriodId = normalize(input.existingCreditPeriodId);
  const subscriptionId = randomUUID();
  const sql = createContentStorageClient();

  if (existingCreditPeriodId) {
    // Statement unique: la periode existante est verrouillee et fournit elle-meme les dates de l abonnement.
    const reuseRows = (await sql`
      WITH locked_subscription AS (
        SELECT id, billing_provider, status, plan_code, current_period_start, current_period_end
        FROM media_subscriptions
        WHERE workspace_id = ${workspaceId}
          AND clerk_user_id = ${clerkUserId}
        FOR UPDATE
      ),
      provider_conflict AS (
        SELECT id FROM locked_subscription WHERE billing_provider <> 'manual'
      ),
      locked_period AS (
        SELECT id, period_start, period_end
        FROM ai_credit_periods
        WHERE id = ${existingCreditPeriodId}
          AND workspace_id = ${workspaceId}
          AND clerk_user_id = ${clerkUserId}
          AND status = 'active'
          AND credits_granted = ${plan.creditsPerPeriod}
        FOR UPDATE
      ),
      already_active AS (
        SELECT s.id
        FROM locked_subscription s
        JOIN locked_period p ON TRUE
        WHERE s.billing_provider = 'manual'
          AND s.status = 'active'
          AND s.plan_code = ${plan.code}
          AND s.current_period_start = p.period_start
          AND s.current_period_end = p.period_end
      ),
      upserted_subscription AS (
        INSERT INTO media_subscriptions (
          id, workspace_id, clerk_user_id, plan_code, status, billing_provider,
          price_cents, currency, credits_per_period, "interval",
          current_period_start, current_period_end, cancel_at_period_end
        )
        SELECT ${subscriptionId}, ${workspaceId}, ${clerkUserId}, ${plan.code}, 'active', 'manual',
          ${plan.priceCentsChf}, 'CHF', ${plan.creditsPerPeriod}, ${plan.interval},
          p.period_start, p.period_end, FALSE
        FROM locked_period p
        WHERE NOT EXISTS (SELECT 1 FROM provider_conflict)
          AND NOT EXISTS (SELECT 1 FROM already_active)
        ON CONFLICT (workspace_id, clerk_user_id) DO UPDATE SET
          plan_code = EXCLUDED.plan_code,
          status = 'active',
          billing_provider = 'manual',
          price_cents = EXCLUDED.price_cents,
          currency = EXCLUDED.currency,
          credits_per_period = EXCLUDED.credits_per_period,
          "interval" = EXCLUDED."interval",
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = FALSE,
          canceled_at = NULL,
          updated_at = NOW()
        WHERE media_subscriptions.billing_provider = 'manual'
        RETURNING id
      )
      SELECT
        (SELECT id FROM provider_conflict) AS provider_conflict_id,
        (SELECT id FROM already_active) AS already_active_id,
        (SELECT id FROM locked_period) AS period_id,
        (SELECT period_start FROM locked_period) AS period_start,
        (SELECT period_end FROM locked_period) AS period_end,
        (SELECT id FROM upserted_subscription) AS subscription_id
    `) as Record<string, unknown>[];

    const reuseRow = reuseRows[0] ?? {};
    const providerConflictId = reuseRow.provider_conflict_id ? String(reuseRow.provider_conflict_id) : null;
    const alreadyActiveId = reuseRow.already_active_id ? String(reuseRow.already_active_id) : null;
    const reusedPeriodId = reuseRow.period_id ? String(reuseRow.period_id) : null;
    const reusedSubscriptionId = reuseRow.subscription_id ? String(reuseRow.subscription_id) : null;

    if (providerConflictId) {
      return { status: "provider_conflict", subscriptionId: providerConflictId };
    }

    if (!reusedPeriodId) {
      return { status: "period_conflict", conflictingPeriodId: existingCreditPeriodId };
    }

    if (alreadyActiveId) {
      return { status: "already_active", subscriptionId: alreadyActiveId };
    }

    if (reusedSubscriptionId) {
      return {
        status: "activated",
        subscriptionId: reusedSubscriptionId,
        periodId: reusedPeriodId,
        planCode: plan.code,
        periodStart: toIsoDate(reuseRow.period_start),
        periodEnd: toIsoDate(reuseRow.period_end),
        creditsGranted: plan.creditsPerPeriod,
      };
    }

    throw new Error("Etat inattendu lors de l activation manuelle de l abonnement media.");
  }

  const periodStartMs = Date.parse(normalize(input.periodStart));
  const periodEndMs = Date.parse(normalize(input.periodEnd));
  if (!Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs) || periodStartMs >= periodEndMs) {
    throw new Error("periodStart et periodEnd doivent etre des dates ISO valides avec periodStart anterieur a periodEnd.");
  }

  const periodStart = new Date(periodStartMs).toISOString();
  const periodEnd = new Date(periodEndMs).toISOString();
  const creditPeriodId = randomUUID();

  // Statement unique: le verrou FOR UPDATE sur l abonnement serialise les activations concurrentes.
  const rows = (await sql`
    WITH locked_subscription AS (
      SELECT id, billing_provider, status, plan_code, current_period_start, current_period_end
      FROM media_subscriptions
      WHERE workspace_id = ${workspaceId}
        AND clerk_user_id = ${clerkUserId}
      FOR UPDATE
    ),
    provider_conflict AS (
      SELECT id FROM locked_subscription WHERE billing_provider <> 'manual'
    ),
    already_active AS (
      SELECT id
      FROM locked_subscription
      WHERE billing_provider = 'manual'
        AND status = 'active'
        AND plan_code = ${plan.code}
        AND current_period_start = ${periodStart}::timestamptz
        AND current_period_end = ${periodEnd}::timestamptz
    ),
    matching_period AS (
      SELECT id
      FROM ai_credit_periods
      WHERE workspace_id = ${workspaceId}
        AND clerk_user_id = ${clerkUserId}
        AND status = 'active'
        AND period_start = ${periodStart}::timestamptz
        AND period_end = ${periodEnd}::timestamptz
        AND credits_granted = ${plan.creditsPerPeriod}
      LIMIT 1
    ),
    conflicting_period AS (
      SELECT id
      FROM ai_credit_periods
      WHERE workspace_id = ${workspaceId}
        AND clerk_user_id = ${clerkUserId}
        AND status = 'active'
        AND period_start < ${periodEnd}::timestamptz
        AND period_end > ${periodStart}::timestamptz
        AND id NOT IN (SELECT id FROM matching_period)
      LIMIT 1
    ),
    inserted_period AS (
      INSERT INTO ai_credit_periods (
        id, workspace_id, clerk_user_id, period_start, period_end, credits_granted, status
      )
      SELECT ${creditPeriodId}, ${workspaceId}, ${clerkUserId}, ${periodStart}::timestamptz, ${periodEnd}::timestamptz, ${plan.creditsPerPeriod}, 'active'
      WHERE NOT EXISTS (SELECT 1 FROM provider_conflict)
        AND NOT EXISTS (SELECT 1 FROM already_active)
        AND NOT EXISTS (SELECT 1 FROM matching_period)
        AND NOT EXISTS (SELECT 1 FROM conflicting_period)
      ON CONFLICT (workspace_id, clerk_user_id, period_start) DO NOTHING
      RETURNING id
    ),
    resolved_period AS (
      SELECT id FROM matching_period
      UNION ALL
      SELECT id FROM inserted_period
    ),
    upserted_subscription AS (
      INSERT INTO media_subscriptions (
        id, workspace_id, clerk_user_id, plan_code, status, billing_provider,
        price_cents, currency, credits_per_period, "interval",
        current_period_start, current_period_end, cancel_at_period_end
      )
      SELECT ${subscriptionId}, ${workspaceId}, ${clerkUserId}, ${plan.code}, 'active', 'manual',
        ${plan.priceCentsChf}, 'CHF', ${plan.creditsPerPeriod}, ${plan.interval},
        ${periodStart}::timestamptz, ${periodEnd}::timestamptz, FALSE
      WHERE NOT EXISTS (SELECT 1 FROM provider_conflict)
        AND NOT EXISTS (SELECT 1 FROM already_active)
        AND NOT EXISTS (SELECT 1 FROM conflicting_period)
        AND EXISTS (SELECT 1 FROM resolved_period)
      ON CONFLICT (workspace_id, clerk_user_id) DO UPDATE SET
        plan_code = EXCLUDED.plan_code,
        status = 'active',
        billing_provider = 'manual',
        price_cents = EXCLUDED.price_cents,
        currency = EXCLUDED.currency,
        credits_per_period = EXCLUDED.credits_per_period,
        "interval" = EXCLUDED."interval",
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = FALSE,
        canceled_at = NULL,
        updated_at = NOW()
      WHERE media_subscriptions.billing_provider = 'manual'
      RETURNING id
    )
    SELECT
      (SELECT id FROM provider_conflict) AS provider_conflict_id,
      (SELECT id FROM already_active) AS already_active_id,
      (SELECT id FROM conflicting_period) AS conflicting_period_id,
      (SELECT id FROM resolved_period LIMIT 1) AS period_id,
      (SELECT id FROM upserted_subscription) AS subscription_id
  `) as Record<string, unknown>[];

  const row = rows[0] ?? {};
  const providerConflictId = row.provider_conflict_id ? String(row.provider_conflict_id) : null;
  const alreadyActiveId = row.already_active_id ? String(row.already_active_id) : null;
  const conflictingPeriodId = row.conflicting_period_id ? String(row.conflicting_period_id) : null;
  const periodId = row.period_id ? String(row.period_id) : null;
  const resolvedSubscriptionId = row.subscription_id ? String(row.subscription_id) : null;

  if (providerConflictId) {
    return { status: "provider_conflict", subscriptionId: providerConflictId };
  }

  if (alreadyActiveId) {
    return { status: "already_active", subscriptionId: alreadyActiveId };
  }

  if (conflictingPeriodId) {
    return { status: "period_conflict", conflictingPeriodId };
  }

  if (resolvedSubscriptionId && periodId) {
    return {
      status: "activated",
      subscriptionId: resolvedSubscriptionId,
      periodId,
      planCode: plan.code,
      periodStart,
      periodEnd,
      creditsGranted: plan.creditsPerPeriod,
    };
  }

  throw new Error("Etat inattendu lors de l activation manuelle de l abonnement media.");
};
