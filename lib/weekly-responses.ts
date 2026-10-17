import type { Athlete, WeeklyFormResponse } from "@/types/athlete";

export type WeeklyResponsePriorityLevel = 1 | 2 | 3 | 4 | 5;
export type WeeklyResponseBadgeTone = "action" | "danger" | "success" | "event" | "neutral";

export type WeeklyResponsePriority = {
  level: WeeklyResponsePriorityLevel;
  label: string;
  tone: WeeklyResponseBadgeTone;
};

export type WeeklyResponseDetail = {
  key: string;
  label: string;
  value: string;
  kind?: "link";
};

export type WeeklyResponseDashboardItem = {
  athlete: Athlete;
  response: WeeklyFormResponse;
  responseTime: number;
  responseKey: string;
  priority: WeeklyResponsePriority;
  summary: string;
  details: WeeklyResponseDetail[];
  stableIndex: number;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeForMatching = (value: unknown): string =>
  normalize(value)
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isMeaningfulWeeklyValue = (value: unknown): boolean => {
  const normalized = normalize(value);
  return Boolean(normalized) && !["/", "//", "-"].includes(normalized);
};

export const getWeeklyResponseKey = (athleteId: string, responseTimestamp: string): string =>
  JSON.stringify([athleteId, responseTimestamp]);

export const parseWeeklyResponseDate = (value: string): number | null => {
  const raw = normalize(value);
  const european = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  const parts = european
    ? { year: european[3], month: european[2], day: european[1], hour: european[4], minute: european[5], second: european[6] }
    : iso
      ? { year: iso[1], month: iso[2], day: iso[3], hour: iso[4], minute: iso[5], second: iso[6] }
      : null;
  if (!parts) {
    const fallback = Date.parse(raw);
    return Number.isNaN(fallback) ? null : fallback;
  }
  const parsed = new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour ?? 0),
    Number(parts.minute ?? 0),
    Number(parts.second ?? 0),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const includesAny = (value: string, tokens: string[]): boolean =>
  tokens.some((token) => value.includes(token));

const matchesAny = (value: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(value));

const responseText = (response: WeeklyFormResponse): string =>
  normalizeForMatching([
    response.competition,
    response.result,
    response.notableEvent,
    response.notableEventExplanation,
    response.quickContactReason,
  ].filter(isMeaningfulWeeklyValue).join(" "));

const hasDifficulty = (text: string): boolean =>
  matchesAny(text, [
    /\bbless/,
    /\bdouleur/,
    /\bdifficulte/,
    /\bprobleme/,
    /\bsouci/,
    /\bgene(?:e)?\b/,
    /\bindisponib/,
    /\boperation/,
    /\bmalade/,
    /\baccident/,
    /\btorsion/,
    /\bentorse/,
  ]);

const hasSelection = (text: string): boolean =>
  matchesAny(text, [/\bselection/, /\bconvoqu/, /\bequipe nationale\b/]);

const hasRecord = (text: string): boolean => /\brecord\b/.test(text);

const hasVictory = (text: string): boolean =>
  matchesAny(text, [
    /\bvictoire\b/,
    /\bwin\b/,
    /\bon a gagn/,
    /\bj['’]?ai gagn/,
    /\bgagne\b/,
    /\bgagne la rencontre\b/,
    /\bremporte\b/,
  ]);

const getScoredPerformance = (response: WeeklyFormResponse): { value: string; unit: string } | null => {
  const text = normalizeForMatching([
    response.result,
    response.notableEvent,
    response.notableEventExplanation,
  ].filter(isMeaningfulWeeklyValue).join(" "));
  const valueFirst = text.match(/\b(\d{1,3})\s*(points?|pts?|assists?|passes? decisives?|rebonds?|buts?)\b/);
  if (valueFirst) return { value: valueFirst[1], unit: valueFirst[2] };
  const unitFirst = text.match(/\b(points?|pts?|assists?|passes? decisives?|rebonds?|buts?)(?:\s+\w+){0,2}\s*[:=]?\s*(\d{1,3})\b/);
  return unitFirst ? { value: unitFirst[2], unit: unitFirst[1] } : null;
};

export const getWeeklyResponsePriority = (response: WeeklyFormResponse): WeeklyResponsePriority => {
  const text = responseText(response);
  const hasExplicitContactRequest = response.contactRequested
    || isMeaningfulWeeklyValue(response.quickContactReason)
    || normalizeForMatching(response.quickContact).startsWith("oui");

  if (hasExplicitContactRequest) {
    return { level: 1, label: "Action nécessaire", tone: "action" };
  }
  if (hasDifficulty(text)) {
    return { level: 2, label: "Difficulté signalée", tone: "danger" };
  }
  if (hasSelection(text)) {
    return { level: 3, label: "Sélection", tone: "event" };
  }
  if (
    hasRecord(text)
    || hasVictory(text)
    || getScoredPerformance(response)
    || includesAny(text, ["podium", "medaille", "qualification", "meilleure performance"])
  ) {
    return { level: 3, label: "Performance", tone: "success" };
  }
  if (
    isMeaningfulWeeklyValue(response.appointment)
    || isMeaningfulWeeklyValue(response.firstAppointmentDate)
    || isMeaningfulWeeklyValue(response.secondAppointmentDate)
    || isMeaningfulWeeklyValue(response.thirdAppointmentDate)
  ) {
    return { level: 4, label: "À venir", tone: "event" };
  }
  return { level: 5, label: "Information", tone: "neutral" };
};

const firstMeaningful = (...values: string[]): string =>
  values.find(isMeaningfulWeeklyValue) ?? "";

const getDifficultySummary = (response: WeeklyFormResponse): string => {
  const text = responseText(response);
  const bodyParts: Array<[RegExp, string]> = [
    [/\bcheville\b/, "à la cheville"],
    [/\bgenou\b/, "au genou"],
    [/\bdos\b/, "au dos"],
    [/\bepaule\b/, "à l’épaule"],
    [/\bpoignet\b/, "au poignet"],
    [/\bcuisse\b/, "à la cuisse"],
  ];
  const location = bodyParts.find(([pattern]) => pattern.test(text))?.[1];
  if (matchesAny(text, [/\bbless/, /\btorsion/, /\bentorse/])) {
    return location ? `Blessure ${location}` : "Blessure signalée";
  }
  if (/\bdouleur/.test(text)) {
    return location ? `Douleur ${location}` : "Douleur signalée";
  }
  return "Difficulté signalée";
};

const getOpponentFromValues = (...values: string[]): string | null => {
  for (const value of values) {
    if (!isMeaningfulWeeklyValue(value)) continue;
    const match = normalize(value).match(/\bcontre\s+([\p{L}\d][\p{L}\d'’.-]*)/iu);
    if (match) return match[1];
  }
  return null;
};

const getSafeCompetitionLabel = (value: string): string | null => {
  const label = normalize(value);
  const normalized = normalizeForMatching(label);
  const words = label.split(/\s+/);
  if (
    words.length > 4
    || matchesAny(normalized, [/\bj['’]?ai\b/, /\bje\b/, /\bon\b/, /\bnous\b/])
    || !matchesAny(normalized, [/\bcoupe\b/, /\bchampionnat\b/, /\btournoi\b/, /\binterclub\b/, /\bfinale\b/])
  ) {
    return null;
  }
  return label;
};

const getVictorySummary = (response: WeeklyFormResponse): string => {
  const text = responseText(response);
  if (matchesAny(text, [/\bpremier(?:e)? victoire\b.*\bsaison\b/, /\bpremier(?:e)?\b.*\bvictoire\b.*\bsaison\b/])) {
    return "Première victoire de la saison";
  }
  const opponent = getOpponentFromValues(
    response.competition,
    response.result,
    response.notableEvent,
    response.notableEventExplanation,
  );
  if (opponent) return `Victoire contre ${opponent}`;
  if (/\bchampionnat\b/.test(text)) return "Victoire en championnat";
  const competition = getSafeCompetitionLabel(response.competition);
  return competition ? `Victoire en ${competition}` : "Victoire";
};

const getPerformanceSummary = (response: WeeklyFormResponse): string => {
  const performance = getScoredPerformance(response);
  if (!performance) return "Performance remarquable";
  if (performance.unit.startsWith("pt") || performance.unit.startsWith("point")) {
    return `${performance.value} points inscrits`;
  }
  return `${performance.value} ${performance.unit}`;
};

const getUpcomingSummary = (response: WeeklyFormResponse): string => {
  const appointment = normalizeForMatching(response.appointment);
  const opponent = getOpponentFromValues(response.appointment);
  if (opponent) return `Match à venir contre ${opponent}`;
  if (/\bmatch\b/.test(appointment)) return "Match à venir";
  if (/\btournoi\b/.test(appointment)) return "Tournoi à venir";
  if (/\bcompetition\b/.test(appointment)) return "Compétition à venir";
  return "Prochain rendez-vous";
};

export const getWeeklyResponseSummary = (
  response: WeeklyFormResponse,
  priority = getWeeklyResponsePriority(response),
): string => {
  const text = responseText(response);
  if (priority.level === 1) return "Contact demandé";
  if (priority.level === 2) return getDifficultySummary(response);
  if (hasSelection(text)) return "Sélection obtenue";
  if (hasRecord(text)) return "Nouveau record personnel";
  if (hasVictory(text)) return getVictorySummary(response);
  if (priority.level === 3) return getPerformanceSummary(response);
  if (priority.level === 4) return getUpcomingSummary(response);
  const ordinary = firstMeaningful(response.notableEvent, response.competition);
  return ordinary && ordinary.split(/\s+/).length <= 7 ? ordinary : "Actualité hebdomadaire";
};

export const getWeeklyResponseDetails = (response: WeeklyFormResponse): WeeklyResponseDetail[] => {
  const candidates: WeeklyResponseDetail[] = [
    { key: "competitionParticipation", label: "Participation à une compétition", value: response.competitionParticipation },
    { key: "competition", label: "Événement ou compétition", value: response.competition },
    { key: "result", label: "Résultat / performance", value: response.result },
    { key: "notableEvent", label: "Fait marquant ou actualité", value: response.notableEvent },
    { key: "notableEventExplanation", label: "Explication ou détails", value: response.notableEventExplanation },
    { key: "media", label: "Photos ou vidéos", value: response.media },
    { key: "mediaLink", label: "Lien transmis", value: response.mediaLink, kind: "link" },
    { key: "appointment", label: "Prochain rendez-vous", value: response.appointment },
    { key: "quickContact", label: "Demande de contact", value: response.quickContact },
    { key: "quickContactReason", label: "Besoin ou demande", value: response.quickContactReason },
    { key: "firstAppointmentDate", label: "Date du premier rendez-vous", value: response.firstAppointmentDate },
    { key: "secondAppointmentDate", label: "Date du deuxième rendez-vous", value: response.secondAppointmentDate },
    { key: "thirdAppointmentDate", label: "Date du troisième rendez-vous", value: response.thirdAppointmentDate },
  ];
  return candidates.filter((item) => isMeaningfulWeeklyValue(item.value));
};

export const getSafeHttpsUrl = (value: string): string | null => {
  try {
    const url = new URL(normalize(value));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export const selectWeeklyResponses = (
  athletes: Athlete[],
  processedResponseKeys: ReadonlySet<string>,
  now = Date.now(),
): WeeklyResponseDashboardItem[] => {
  const rollingWindowStart = now - 14 * 24 * 60 * 60 * 1000;
  const latestByAthlete = new Map<string, WeeklyResponseDashboardItem>();

  athletes.forEach((athlete, stableIndex) => {
    const response = athlete.weeklyFormResponse;
    if (!response) return;
    const responseKey = getWeeklyResponseKey(athlete.key, response.timestamp);
    if (processedResponseKeys.has(responseKey)) return;
    const responseTime = parseWeeklyResponseDate(response.timestamp);
    if (responseTime === null || responseTime < rollingWindowStart || responseTime > now) return;
    const priority = getWeeklyResponsePriority(response);
    const item: WeeklyResponseDashboardItem = {
      athlete,
      response,
      responseTime,
      responseKey,
      priority,
      summary: getWeeklyResponseSummary(response, priority),
      details: getWeeklyResponseDetails(response),
      stableIndex,
    };
    const current = latestByAthlete.get(athlete.key);
    if (!current || item.responseTime > current.responseTime) latestByAthlete.set(athlete.key, item);
  });

  return [...latestByAthlete.values()].sort((left, right) =>
    left.priority.level - right.priority.level
    || right.responseTime - left.responseTime
    || left.stableIndex - right.stableIndex
    || left.athlete.key.localeCompare(right.athlete.key, "fr")
  );
};
