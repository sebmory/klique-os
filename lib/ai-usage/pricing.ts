export const AI_USAGE_PRICING_VERSION = "openai-2026-08-19-v1";

type ModelPricing = {
  // Tarifs exprimes en microUSD par token (numeriquement egal a l USD par 1M tokens).
  inputMicroUsdPerToken: number;
  cachedInputMicroUsdPerToken: number;
  outputMicroUsdPerToken: number;
};

const OPENAI_MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.6-luna": {
    inputMicroUsdPerToken: 0.2,
    cachedInputMicroUsdPerToken: 0.02,
    outputMicroUsdPerToken: 1.2,
  },
  "gpt-5.6-terra": {
    inputMicroUsdPerToken: 2.0,
    cachedInputMicroUsdPerToken: 0.2,
    outputMicroUsdPerToken: 12.0,
  },
};

const WEB_SEARCH_MICROUSD_PER_CALL = 10_000;

export type AiUsageCostInput = {
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  toolCalls: number;
};

export type AiUsageCostResult = {
  estimatedCostMicroUsd: number;
  pricingVersion: string;
};

export const computeAiUsageCost = (input: AiUsageCostInput): AiUsageCostResult | null => {
  if (input.provider !== "openai") return null;

  const pricing = OPENAI_MODEL_PRICING[input.model];
  if (!pricing) return null;

  const billedInputTokens = Math.max(input.inputTokens - input.cachedInputTokens, 0);
  const inputCost = billedInputTokens * pricing.inputMicroUsdPerToken;
  const cachedCost = input.cachedInputTokens * pricing.cachedInputMicroUsdPerToken;
  const outputCost = input.outputTokens * pricing.outputMicroUsdPerToken;
  const webSearchCost = input.operation === "external_web_search" ? input.toolCalls * WEB_SEARCH_MICROUSD_PER_CALL : 0;

  const estimatedCostMicroUsd = Math.round(inputCost + cachedCost + outputCost + webSearchCost);

  return {
    estimatedCostMicroUsd,
    pricingVersion: AI_USAGE_PRICING_VERSION,
  };
};
