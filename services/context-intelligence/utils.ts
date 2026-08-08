import type {
  ContextConfidence,
  ContextDateRange,
  ContextDateRangePreset,
  ContextItem,
  ContextSourcePreference,
} from "@/types/context-intelligence";

export const normalize = (value: unknown): string => String(value ?? "").trim();

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

const toUtcDate = (value: Date): Date => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
};

export const buildDateRange = (
  preset: ContextDateRangePreset,
  customFrom?: string,
  customTo?: string,
  referenceDate: Date = new Date()
): ContextDateRange => {
  const now = toUtcDate(referenceDate);
  const to = toIsoDate(now);

  if (preset === "custom") {
    return {
      preset,
      from: normalize(customFrom) || to,
      to: normalize(customTo) || to,
    };
  }

  const fromDate = toUtcDate(referenceDate);
  if (preset === "last_7_days") fromDate.setUTCDate(fromDate.getUTCDate() - 6);
  if (preset === "last_30_days") fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  if (preset === "last_90_days") fromDate.setUTCDate(fromDate.getUTCDate() - 89);
  if (preset === "last_12_months") {
    fromDate.setUTCMonth(fromDate.getUTCMonth() - 12);
    fromDate.setUTCDate(fromDate.getUTCDate() + 1);
  }

  return {
    preset,
    from: toIsoDate(fromDate),
    to,
  };
};

export const isSafeHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const formatDateParts = (value: string, locale: string): { date: string; time: string } | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: undefined,
  }).format(parsed);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: undefined,
  }).format(parsed);

  return { date, time };
};

export const formatDateLabel = (value: string, locale = "fr-FR"): string => {
  const parts = formatDateParts(value, locale);
  return parts ? parts.date : value;
};

export const formatDateTimeLabel = (value: string, locale = "fr-FR"): string => {
  const parts = formatDateParts(value, locale);
  return parts ? `${parts.date} à ${parts.time}` : value;
};

export const formatDateRangeLabel = (range: ContextDateRange | undefined, locale = "fr-FR"): string => {
  if (!range) return "Non definie";
  return `${formatDateLabel(range.from, locale)} → ${formatDateLabel(range.to, locale)}`;
};

export const clampText = (value: string, max: number): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
};

export const sensitivityRegex = /(blessure|injury|sante|health|rumeur|rumor|accusation|mineur|contract|transfert|transfer)/i;

export const isSensitiveText = (text: string): boolean => sensitivityRegex.test(text);

const sourceWeight = (sourceType: ContextItem["sourceType"]): number => {
  if (sourceType === "official") return 3;
  if (sourceType === "media") return 2;
  if (sourceType === "internal" || sourceType === "user") return 2;
  if (sourceType === "external") return 1;
  return 0;
};

const confidenceWeight = (confidence: ContextConfidence): number => {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  if (confidence === "low") return 1;
  return 0;
};

export const shouldPreselect = (item: ContextItem, sourcePreference: ContextSourcePreference): boolean => {
  if (item.connectorId === "manual" || item.connectorId === "crm" || item.connectorId === "productions") return true;
  if (!item.sourceName) return false;
  if (item.statementType === "editorial_lead") return false;
  if (item.isSensitive && confidenceWeight(item.confidence) < 3) return false;
  if (item.confidence === "low" || item.confidence === "unknown") return false;

  const sw = sourceWeight(item.sourceType);
  if (sourcePreference === "official_only") return sw >= 3;
  if (sourcePreference === "official_and_reliable") return sw >= 2;
  return sw >= 1;
};

export const normalizePublishedAt = (value?: string): string | undefined => {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
};

export const dedupeContextItems = (items: ContextItem[]): ContextItem[] => {
  const byKey = new Map<string, ContextItem>();

  for (const item of items) {
    const date = normalizePublishedAt(item.publishedAt)?.slice(0, 10) || "no-date";
    const key = [
      item.category,
      normalize(item.factualStatement || item.summary || item.title).toLowerCase(),
      date,
    ].join("|");

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, alternateSources: [...(item.alternateSources ?? [])] });
      continue;
    }

    const candidateSource = {
      sourceType: item.sourceType,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
    };

    const sources = [...(existing.alternateSources ?? [])];
    const sourceSignature = `${candidateSource.sourceName}|${candidateSource.sourceUrl ?? ""}`;
    const exists = sources.some((source) => `${source.sourceName}|${source.sourceUrl ?? ""}` === sourceSignature);
    if (!exists && candidateSource.sourceName) {
      sources.push(candidateSource);
    }

    byKey.set(key, {
      ...existing,
      alternateSources: sources,
      sourceName: existing.sourceName || item.sourceName,
      sourceType: existing.sourceType === "unknown" ? item.sourceType : existing.sourceType,
      sourceUrl: existing.sourceUrl || item.sourceUrl,
      confidence:
        confidenceWeight(item.confidence) > confidenceWeight(existing.confidence)
          ? item.confidence
          : existing.confidence,
    });
  }

  return Array.from(byKey.values());
};
