import { randomUUID } from "crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { computeAiUsageCost } from "@/lib/ai-usage/pricing";
import type { AiUsageEventInput } from "@/types/ai-usage";

const ensureNodeRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("AI usage repository est reserve au serveur.");
  }
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeNullable = (value: unknown): string | null => {
  const normalized = normalize(value);
  return normalized || null;
};

// Les compteurs de tokens/appels ne doivent jamais etre negatifs ni fractionnaires.
const normalizeCounter = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const normalizeNullableInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

export const recordAiUsageEvent = async (input: AiUsageEventInput): Promise<string> => {
  ensureNodeRuntime();

  const sql = createContentStorageClient();
  const id = randomUUID();

  const cost = computeAiUsageCost({
    provider: normalize(input.provider),
    model: normalize(input.model),
    operation: normalize(input.operation),
    inputTokens: normalizeCounter(input.inputTokens),
    cachedInputTokens: normalizeCounter(input.cachedInputTokens),
    outputTokens: normalizeCounter(input.outputTokens),
    toolCalls: normalizeCounter(input.toolCalls),
  });

  const rows = await sql`
    INSERT INTO ai_usage_events (
      id,
      request_group_id,
      workspace_id,
      clerk_user_id,
      role,
      feature,
      operation,
      content_type,
      provider,
      model,
      provider_response_id,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      total_tokens,
      tool_calls,
      retry_number,
      status,
      error_code,
      duration_ms,
      usage_json,
      estimated_cost_microusd,
      pricing_version,
      created_at
    )
    VALUES (
      ${id},
      ${normalize(input.requestGroupId)},
      ${normalize(input.workspaceId)},
      ${normalize(input.clerkUserId)},
      ${normalize(input.role)},
      ${normalize(input.feature)},
      ${normalize(input.operation)},
      ${normalizeNullable(input.contentType)},
      ${normalize(input.provider)},
      ${normalize(input.model)},
      ${normalizeNullable(input.providerResponseId)},
      ${normalizeCounter(input.inputTokens)},
      ${normalizeCounter(input.cachedInputTokens)},
      ${normalizeCounter(input.outputTokens)},
      ${normalizeCounter(input.totalTokens)},
      ${normalizeCounter(input.toolCalls)},
      ${normalizeCounter(input.retryNumber)},
      ${input.status},
      ${normalizeNullable(input.errorCode)},
      ${normalizeNullableInteger(input.durationMs)},
      ${input.usageJson ? JSON.stringify(input.usageJson) : null}::jsonb,
      ${cost ? cost.estimatedCostMicroUsd : null},
      ${cost ? cost.pricingVersion : null},
      NOW()
    )
    RETURNING id
  `;

  return String((rows[0] as Record<string, unknown> | undefined)?.id ?? id);
};
