import { randomUUID } from "crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  AiCreditBalance,
  AiCreditConsumeInput,
  AiCreditConsumeResult,
  AiCreditPeriodInput,
  AiCreditRefundInput,
  AiCreditRefundResult,
} from "@/types/ai-usage";

const ensureNodeRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("AI credit repository est reserve au serveur.");
  }
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeNullable = (value: unknown): string | null => {
  const normalized = normalize(value);
  return normalized || null;
};

export const createAiCreditPeriod = async (input: AiCreditPeriodInput): Promise<string> => {
  ensureNodeRuntime();

  const workspaceId = normalize(input.workspaceId);
  const clerkUserId = normalize(input.clerkUserId);
  const periodStart = normalize(input.periodStart);
  const periodEnd = normalize(input.periodEnd);
  if (!workspaceId || !clerkUserId || !periodStart || !periodEnd) {
    throw new Error("workspaceId, clerkUserId, periodStart et periodEnd sont requis.");
  }

  const creditsGranted = Math.max(0, Math.trunc(Number(input.creditsGranted ?? 0)));
  const sql = createContentStorageClient();
  const id = randomUUID();

  const rows = (await sql`
    INSERT INTO ai_credit_periods (
      id, workspace_id, clerk_user_id, period_start, period_end, credits_granted, status
    ) VALUES (
      ${id}, ${workspaceId}, ${clerkUserId}, ${periodStart}::timestamptz, ${periodEnd}::timestamptz, ${creditsGranted}, 'active'
    )
    RETURNING id
  `) as Record<string, unknown>[];

  return String(rows[0]?.id ?? id);
};

export const getAiCreditBalance = async (input: {
  workspaceId: string;
  clerkUserId: string;
  at?: string;
}): Promise<AiCreditBalance> => {
  ensureNodeRuntime();

  const workspaceId = normalize(input.workspaceId);
  const clerkUserId = normalize(input.clerkUserId);
  if (!workspaceId || !clerkUserId) {
    throw new Error("workspaceId et clerkUserId sont requis.");
  }

  const at = normalizeNullable(input.at);
  const sql = createContentStorageClient();

  const rows = (await sql`
    SELECT
      p.id AS period_id,
      p.period_start,
      p.period_end,
      p.credits_granted,
      p.credits_granted + COALESCE(SUM(t.credit_delta), 0) AS current_balance
    FROM ai_credit_periods p
    LEFT JOIN ai_credit_transactions t ON t.period_id = p.id
    WHERE p.workspace_id = ${workspaceId}
      AND p.clerk_user_id = ${clerkUserId}
      AND p.status = 'active'
      AND p.period_start <= COALESCE(${at}::timestamptz, NOW())
      AND p.period_end > COALESCE(${at}::timestamptz, NOW())
    GROUP BY p.id, p.period_start, p.period_end, p.credits_granted
    ORDER BY p.period_start DESC
    LIMIT 1
  `) as Record<string, unknown>[];

  const row = rows[0];
  if (!row) {
    return {
      hasActivePeriod: false,
      periodId: null,
      periodStart: null,
      periodEnd: null,
      creditsGranted: 0,
      currentBalance: 0,
    };
  }

  return {
    hasActivePeriod: true,
    periodId: String(row.period_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    creditsGranted: Number(row.credits_granted ?? 0),
    currentBalance: Number(row.current_balance ?? 0),
  };
};

export const consumeAiCredit = async (input: AiCreditConsumeInput): Promise<AiCreditConsumeResult> => {
  ensureNodeRuntime();

  const workspaceId = normalize(input.workspaceId);
  const clerkUserId = normalize(input.clerkUserId);
  const idempotencyKey = normalize(input.idempotencyKey);
  if (!workspaceId || !clerkUserId || !idempotencyKey) {
    throw new Error("workspaceId, clerkUserId et idempotencyKey sont requis.");
  }

  const requestGroupId = normalizeNullable(input.requestGroupId);
  const operation = normalizeNullable(input.operation);
  const at = normalizeNullable(input.at);
  const transactionId = randomUUID();

  const sql = createContentStorageClient();

  // Statement unique: le verrou FOR UPDATE sur la periode serialise les appels concurrents avant l insertion.
  const rows = (await sql`
    WITH locked_period AS (
      SELECT id, credits_granted
      FROM ai_credit_periods
      WHERE workspace_id = ${workspaceId}
        AND clerk_user_id = ${clerkUserId}
        AND status = 'active'
        AND period_start <= COALESCE(${at}::timestamptz, NOW())
        AND period_end > COALESCE(${at}::timestamptz, NOW())
      ORDER BY period_start DESC
      LIMIT 1
      FOR UPDATE
    ),
    existing AS (
      SELECT id
      FROM ai_credit_transactions
      WHERE workspace_id = ${workspaceId}
        AND clerk_user_id = ${clerkUserId}
        AND idempotency_key = ${idempotencyKey}
    ),
    balance AS (
      SELECT lp.id AS period_id, lp.credits_granted + COALESCE(SUM(t.credit_delta), 0) AS current_balance
      FROM locked_period lp
      LEFT JOIN ai_credit_transactions t ON t.period_id = lp.id
      GROUP BY lp.id, lp.credits_granted
    ),
    inserted AS (
      INSERT INTO ai_credit_transactions (
        id, period_id, workspace_id, clerk_user_id, kind, credit_delta, request_group_id, operation, idempotency_key
      )
      SELECT ${transactionId}, b.period_id, ${workspaceId}, ${clerkUserId}, 'consumption', -1, ${requestGroupId}, ${operation}, ${idempotencyKey}
      FROM balance b
      WHERE NOT EXISTS (SELECT 1 FROM existing)
        AND b.current_balance >= 1
      ON CONFLICT (workspace_id, clerk_user_id, idempotency_key) DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT id FROM existing) AS existing_id,
      (SELECT period_id FROM balance) AS period_id,
      (SELECT current_balance FROM balance) AS current_balance,
      (SELECT id FROM inserted) AS inserted_id
  `) as Record<string, unknown>[];

  const row = rows[0] ?? {};
  const existingId = row.existing_id ? String(row.existing_id) : null;
  const periodId = row.period_id ? String(row.period_id) : null;
  const insertedId = row.inserted_id ? String(row.inserted_id) : null;
  const currentBalance =
    row.current_balance === null || row.current_balance === undefined ? null : Number(row.current_balance);

  if (existingId) {
    return { status: "already_consumed", transactionId: existingId };
  }

  if (!periodId) {
    return { status: "no_active_period" };
  }

  if (insertedId) {
    return {
      status: "consumed",
      transactionId: insertedId,
      periodId,
      remainingBalance: (currentBalance ?? 0) - 1,
    };
  }

  if (currentBalance !== null && currentBalance < 1) {
    return { status: "insufficient_credits", periodId, currentBalance };
  }

  // Repli: conflit idempotency_key concurrent sur une autre periode active non couverte par le verrou ci-dessus.
  const fallbackRows = (await sql`
    SELECT id FROM ai_credit_transactions
    WHERE workspace_id = ${workspaceId}
      AND clerk_user_id = ${clerkUserId}
      AND idempotency_key = ${idempotencyKey}
  `) as Record<string, unknown>[];

  const fallbackId = fallbackRows[0]?.id ? String(fallbackRows[0].id) : null;
  if (fallbackId) {
    return { status: "already_consumed", transactionId: fallbackId };
  }

  throw new Error("Etat inattendu lors de la consommation de credit IA.");
};

export const refundAiCredit = async (input: AiCreditRefundInput): Promise<AiCreditRefundResult> => {
  ensureNodeRuntime();

  const workspaceId = normalize(input.workspaceId);
  const clerkUserId = normalize(input.clerkUserId);
  const originalIdempotencyKey = normalize(input.originalIdempotencyKey);
  if (!workspaceId || !clerkUserId || !originalIdempotencyKey) {
    throw new Error("workspaceId, clerkUserId et originalIdempotencyKey sont requis.");
  }

  const requestGroupId = normalizeNullable(input.requestGroupId);
  const operation = normalizeNullable(input.operation);
  const refundIdempotencyKey = `${originalIdempotencyKey}:refund`;
  const transactionId = randomUUID();

  const sql = createContentStorageClient();

  // Statement unique: verrouille la periode de la consommation d origine avant d inserer le remboursement.
  const rows = (await sql`
    WITH original AS (
      SELECT id AS original_id, period_id
      FROM ai_credit_transactions
      WHERE workspace_id = ${workspaceId}
        AND clerk_user_id = ${clerkUserId}
        AND kind = 'consumption'
        AND idempotency_key = ${originalIdempotencyKey}
      LIMIT 1
    ),
    locked_period AS (
      SELECT p.id, p.credits_granted
      FROM ai_credit_periods p
      JOIN original o ON o.period_id = p.id
      FOR UPDATE
    ),
    existing_refund AS (
      SELECT id
      FROM ai_credit_transactions
      WHERE workspace_id = ${workspaceId}
        AND clerk_user_id = ${clerkUserId}
        AND idempotency_key = ${refundIdempotencyKey}
    ),
    balance AS (
      SELECT lp.id AS period_id, lp.credits_granted + COALESCE(SUM(t.credit_delta), 0) AS current_balance
      FROM locked_period lp
      LEFT JOIN ai_credit_transactions t ON t.period_id = lp.id
      GROUP BY lp.id, lp.credits_granted
    ),
    inserted AS (
      INSERT INTO ai_credit_transactions (
        id, period_id, workspace_id, clerk_user_id, kind, credit_delta, request_group_id, operation, idempotency_key
      )
      SELECT ${transactionId}, o.period_id, ${workspaceId}, ${clerkUserId}, 'refund', 1, ${requestGroupId}, ${operation}, ${refundIdempotencyKey}
      FROM original o
      WHERE NOT EXISTS (SELECT 1 FROM existing_refund)
      ON CONFLICT (workspace_id, clerk_user_id, idempotency_key) DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT original_id FROM original) AS original_id,
      (SELECT id FROM existing_refund) AS existing_refund_id,
      (SELECT period_id FROM balance) AS period_id,
      (SELECT current_balance FROM balance) AS current_balance,
      (SELECT id FROM inserted) AS inserted_id
  `) as Record<string, unknown>[];

  const row = rows[0] ?? {};
  const originalId = row.original_id ? String(row.original_id) : null;
  const existingRefundId = row.existing_refund_id ? String(row.existing_refund_id) : null;
  const periodId = row.period_id ? String(row.period_id) : null;
  const insertedId = row.inserted_id ? String(row.inserted_id) : null;
  const currentBalance =
    row.current_balance === null || row.current_balance === undefined ? null : Number(row.current_balance);

  if (!originalId) {
    return { status: "no_consumption" };
  }

  if (existingRefundId) {
    return { status: "already_refunded", transactionId: existingRefundId };
  }

  if (insertedId && periodId) {
    return {
      status: "refunded",
      transactionId: insertedId,
      periodId,
      remainingBalance: (currentBalance ?? 0) + 1,
    };
  }

  // Repli: conflit idempotency_key concurrent non couvert par le verrou ci-dessus.
  const fallbackRefundRows = (await sql`
    SELECT id FROM ai_credit_transactions
    WHERE workspace_id = ${workspaceId}
      AND clerk_user_id = ${clerkUserId}
      AND idempotency_key = ${refundIdempotencyKey}
  `) as Record<string, unknown>[];

  const fallbackRefundId = fallbackRefundRows[0]?.id ? String(fallbackRefundRows[0].id) : null;
  if (fallbackRefundId) {
    return { status: "already_refunded", transactionId: fallbackRefundId };
  }

  throw new Error("Etat inattendu lors du remboursement de credit IA.");
};
