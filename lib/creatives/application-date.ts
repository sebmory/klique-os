const zurichTimeZone = "Europe/Zurich";
const dayInMilliseconds = 86_400_000;
const spreadsheetEpoch = Date.UTC(1899, 11, 30);

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond?: number;
};

const zurichPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: zurichTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const displayFormatter = new Intl.DateTimeFormat("fr-CH", {
  timeZone: zurichTimeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const partsAsUtc = (date: Date): number => {
  const parts = Object.fromEntries(
    zurichPartsFormatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
};

const zurichDateFromParts = (parts: DateParts): Date => {
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0,
  );
  let instant = wallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = wallClock - (partsAsUtc(new Date(instant)) - instant);
  }
  return new Date(instant);
};

const validDateParts = (parts: DateParts): boolean => {
  const probe = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0,
  ));
  return probe.getUTCFullYear() === parts.year
    && probe.getUTCMonth() === parts.month - 1
    && probe.getUTCDate() === parts.day
    && probe.getUTCHours() === parts.hour
    && probe.getUTCMinutes() === parts.minute
    && probe.getUTCSeconds() === parts.second;
};

const localDatePatterns = [
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  /^(\d{2})[./](\d{2})[./](\d{4})(?:[ ,T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
] as const;

const parseZurichLocalDate = (value: string): Date | null => {
  for (const [index, pattern] of localDatePatterns.entries()) {
    const match = pattern.exec(value);
    if (!match) continue;
    const parts: DateParts = index === 0
      ? {
          year: Number(match[1]),
          month: Number(match[2]),
          day: Number(match[3]),
          hour: Number(match[4] ?? 0),
          minute: Number(match[5] ?? 0),
          second: Number(match[6] ?? 0),
          millisecond: Number((match[7] ?? "").padEnd(3, "0") || 0),
        }
      : {
          year: Number(match[3]),
          month: Number(match[2]),
          day: Number(match[1]),
          hour: Number(match[4] ?? 0),
          minute: Number(match[5] ?? 0),
          second: Number(match[6] ?? 0),
        };
    return validDateParts(parts) ? zurichDateFromParts(parts) : null;
  }
  return null;
};

const parseNumericDate = (value: number): Date | null => {
  if (!Number.isFinite(value)) return null;
  if (value >= 1 && value <= 100_000) {
    const wallClock = new Date(spreadsheetEpoch + value * dayInMilliseconds);
    return zurichDateFromParts({
      year: wallClock.getUTCFullYear(),
      month: wallClock.getUTCMonth() + 1,
      day: wallClock.getUTCDate(),
      hour: wallClock.getUTCHours(),
      minute: wallClock.getUTCMinutes(),
      second: wallClock.getUTCSeconds(),
      millisecond: wallClock.getUTCMilliseconds(),
    });
  }
  const timestamp = Math.abs(value) < 10_000_000_000 ? value * 1_000 : value;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const parseCreativeApplicationDate = (
  value: string | number | null | undefined,
): Date | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return parseNumericDate(value);
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    return parseNumericDate(Number(normalized));
  }
  const local = parseZurichLocalDate(normalized);
  if (local) return local;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatCreativeApplicationDate = (
  value: string | number | null | undefined,
): string => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "Date non renseignée";
  }
  const parsed = parseCreativeApplicationDate(value);
  return parsed ? displayFormatter.format(parsed) : "Date invalide";
};
