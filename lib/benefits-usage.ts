export type BenefitUsageType = "once" | "limited" | "unlimited";

export type BenefitUsage = {
  usageType: BenefitUsageType;
  usageLimit?: number;
};

const normalizeText = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const normalizeUsageType = (value: unknown): BenefitUsageType | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (["once", "one-time", "une seule fois", "1 fois", "single use", "single-use"].includes(normalized)) return "once";
  if (["limited", "limited use", "nombre limite", "nombre limité", "plusieurs fois", "plusieurs"].includes(normalized)) return "limited";
  if (["unlimited", "illimite", "illimité", "sans limite", "unlimited use"].includes(normalized)) return "unlimited";
  return null;
};

const extractNumericLimit = (value: string): number | null => {
  const match = value.match(/\b(\d+)\s*(fois|fois par membre|utilisations?)\b/i);
  if (!match) return null;
  return Number(match[1]);
};

export const inferBenefitUsage = (source: Record<string, unknown>): BenefitUsage => {
  const explicitUsageType = normalizeUsageType(source.usageType);
  if (explicitUsageType) {
    const explicitUsageLimit = typeof source.usageLimit === "number" ? source.usageLimit : null;
    if (explicitUsageType === "limited" && explicitUsageLimit) {
      return { usageType: "limited", usageLimit: explicitUsageLimit };
    }
    if (explicitUsageType === "limited") {
      return { usageType: "limited" };
    }
    return { usageType: explicitUsageType };
  }

  const candidateTexts = [
    source.memberOffer,
    source.benefits,
    source.services,
    source.description,
    source.notes,
    source.counterparts,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeText(value));

  if (candidateTexts.some((value) => /une? seule(?:ment)? fois|1 fois|single use|once/i.test(value))) {
    return { usageType: "once" };
  }

  for (const text of candidateTexts) {
    const numericLimit = extractNumericLimit(text);
    if (numericLimit) {
      return { usageType: "limited", usageLimit: numericLimit };
    }
  }

  return { usageType: "unlimited" };
};
