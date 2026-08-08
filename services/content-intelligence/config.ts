export type ContentProviderId = "openai";

export const contentIntelligenceConfig = {
  defaultProvider: "openai" as ContentProviderId,
  defaultModel: process.env.OPENAI_MODEL || "gpt-5.5",
  promptVersion: "cie-interview-v1",
  temperature: 0.35,
  maxTokens: 2400,
  requestTimeoutMs: 45000,
  maxInvalidJsonRetries: 1,
  limits: {
    maxSubjectNameLength: 140,
    maxFreeTextLength: 1600,
    maxTopicLength: 120,
    maxTopicCount: 12,
    minQuestionCount: 3,
    maxQuestionCount: 30,
  },
} as const;
