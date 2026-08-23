import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  AiUsageSummary,
  AiUsageSummaryByContentType,
  AiUsageSummaryByOperation,
  AiUsageSummaryByUser,
  AiUsageSummaryQuery,
  AiUsageSummaryTotals,
} from "@/types/ai-usage";

const ensureNodeRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("AI usage summary repository est reserve au serveur.");
  }
};

const toCount = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rowToTotals = (row: Record<string, unknown>): AiUsageSummaryTotals => ({
  totalEvents: toCount(row.total_events),
  succeededEvents: toCount(row.succeeded_events),
  failedEvents: toCount(row.failed_events),
  inputTokens: toCount(row.input_tokens),
  cachedInputTokens: toCount(row.cached_input_tokens),
  outputTokens: toCount(row.output_tokens),
  totalTokens: toCount(row.total_tokens),
  toolCalls: toCount(row.tool_calls),
  estimatedCostMicroUsd: toCount(row.estimated_cost_microusd),
  costedEvents: toCount(row.costed_events),
  uncostedEvents: toCount(row.uncosted_events),
});

export const getAiUsageSummary = async (query: AiUsageSummaryQuery): Promise<AiUsageSummary> => {
  ensureNodeRuntime();

  const workspaceId = String(query.workspaceId ?? "").trim();
  if (!workspaceId) {
    throw new Error("workspaceId requis pour la synthese d usage IA.");
  }

  const from = String(query.from ?? "").trim();
  const to = String(query.to ?? "").trim();
  if (!from || !to) {
    throw new Error("Periode (from/to) requise pour la synthese d usage IA.");
  }

  const clerkUserId = query.clerkUserId ? String(query.clerkUserId).trim() : null;

  const sql = createContentStorageClient();

  const totalsRows = (await sql`
    SELECT
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded_events,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_events,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(tool_calls), 0) AS tool_calls,
      COALESCE(SUM(estimated_cost_microusd) FILTER (WHERE estimated_cost_microusd IS NOT NULL), 0) AS estimated_cost_microusd,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NOT NULL) AS costed_events,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NULL) AS uncosted_events
    FROM ai_usage_events
    WHERE workspace_id = ${workspaceId}
      AND created_at >= ${from}
      AND created_at < ${to}
      AND (${clerkUserId}::text IS NULL OR clerk_user_id = ${clerkUserId})
  `) as Record<string, unknown>[];

  const byUserRows = (await sql`
    SELECT
      clerk_user_id,
      role,
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded_events,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_events,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(tool_calls), 0) AS tool_calls,
      COALESCE(SUM(estimated_cost_microusd) FILTER (WHERE estimated_cost_microusd IS NOT NULL), 0) AS estimated_cost_microusd,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NOT NULL) AS costed_events,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NULL) AS uncosted_events
    FROM ai_usage_events
    WHERE workspace_id = ${workspaceId}
      AND created_at >= ${from}
      AND created_at < ${to}
      AND (${clerkUserId}::text IS NULL OR clerk_user_id = ${clerkUserId})
    GROUP BY clerk_user_id, role
    ORDER BY total_events DESC
  `) as Record<string, unknown>[];

  const byContentTypeRows = (await sql`
    SELECT
      content_type,
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded_events,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_events,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(tool_calls), 0) AS tool_calls,
      COALESCE(SUM(estimated_cost_microusd) FILTER (WHERE estimated_cost_microusd IS NOT NULL), 0) AS estimated_cost_microusd,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NOT NULL) AS costed_events,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NULL) AS uncosted_events
    FROM ai_usage_events
    WHERE workspace_id = ${workspaceId}
      AND created_at >= ${from}
      AND created_at < ${to}
      AND (${clerkUserId}::text IS NULL OR clerk_user_id = ${clerkUserId})
    GROUP BY content_type
    ORDER BY total_events DESC
  `) as Record<string, unknown>[];

  const byOperationRows = (await sql`
    SELECT
      operation,
      COUNT(*) AS total_events,
      COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded_events,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_events,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(tool_calls), 0) AS tool_calls,
      COALESCE(SUM(estimated_cost_microusd) FILTER (WHERE estimated_cost_microusd IS NOT NULL), 0) AS estimated_cost_microusd,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NOT NULL) AS costed_events,
      COUNT(*) FILTER (WHERE estimated_cost_microusd IS NULL) AS uncosted_events
    FROM ai_usage_events
    WHERE workspace_id = ${workspaceId}
      AND created_at >= ${from}
      AND created_at < ${to}
      AND (${clerkUserId}::text IS NULL OR clerk_user_id = ${clerkUserId})
    GROUP BY operation
    ORDER BY total_events DESC
  `) as Record<string, unknown>[];

  const byUser: AiUsageSummaryByUser[] = byUserRows.map((row) => ({
    clerkUserId: String(row.clerk_user_id ?? ""),
    role: String(row.role ?? ""),
    ...rowToTotals(row),
  }));

  const byContentType: AiUsageSummaryByContentType[] = byContentTypeRows.map((row) => ({
    contentType: row.content_type === null || row.content_type === undefined ? null : String(row.content_type),
    ...rowToTotals(row),
  }));

  const byOperation: AiUsageSummaryByOperation[] = byOperationRows.map((row) => ({
    operation: String(row.operation ?? ""),
    ...rowToTotals(row),
  }));

  return {
    ...rowToTotals(totalsRows[0] ?? {}),
    byUser,
    byContentType,
    byOperation,
  };
};
