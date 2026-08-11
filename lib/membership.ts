export type MembershipDurationMonths = 1 | 3 | 6 | 12;

export type MembershipInput = {
  startDate?: string | null;
  explicitEndDate?: string | null;
  durationMonths?: MembershipDurationMonths | null;
  isInitialFreeYearEligible?: boolean | null;
};

export type MembershipState = {
  statusLabel: "Actif" | "Expiré" | "Non renseignée";
  startDateLabel: string | null;
  endDateLabel: string | null;
  isActive: boolean;
  durationMonths: MembershipDurationMonths | null;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

export const parseMembershipDate = (value: unknown): Date | null => {
  const text = normalize(value);
  if (!text) return null;

  const patterns = [
    /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern.source.startsWith("^(\\d{1,2})")) {
      const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } else {
      const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatMembershipDate = (date: Date | null): string | null => {
  if (!date) return null;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const addMonths = (date: Date, months: number): Date => {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
};

export const buildMembershipState = (input: MembershipInput): MembershipState => {
  const startDate = parseMembershipDate(input.startDate);
  const explicitEndDate = parseMembershipDate(input.explicitEndDate);

  if (!startDate) {
    return {
      statusLabel: "Non renseignée",
      startDateLabel: null,
      endDateLabel: null,
      isActive: false,
      durationMonths: null,
    };
  }

  const effectiveDuration = input.durationMonths ?? (input.isInitialFreeYearEligible ? 12 : null);

  if (explicitEndDate) {
    const isActive = new Date() <= explicitEndDate;
    return {
      statusLabel: isActive ? "Actif" : "Expiré",
      startDateLabel: formatMembershipDate(startDate),
      endDateLabel: formatMembershipDate(explicitEndDate),
      isActive,
      durationMonths: effectiveDuration,
    };
  }

  if (input.isInitialFreeYearEligible && effectiveDuration === 12) {
    const fallbackEndDate = addMonths(startDate, 12);
    const isActive = new Date() <= fallbackEndDate;
    return {
      statusLabel: isActive ? "Actif" : "Expiré",
      startDateLabel: formatMembershipDate(startDate),
      endDateLabel: formatMembershipDate(fallbackEndDate),
      isActive,
      durationMonths: 12,
    };
  }

  return {
    statusLabel: "Non renseignée",
    startDateLabel: formatMembershipDate(startDate),
    endDateLabel: null,
    isActive: false,
    durationMonths: effectiveDuration,
  };
};
