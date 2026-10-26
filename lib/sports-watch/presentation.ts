import type { SportsWatchCandidate } from "@/types/sports-watch";

export type SportsWatchDiscipline = "simple" | "double" | "mixte";
export type SportsWatchOutcome = "victory" | "defeat" | "forfeit" | "retirement" | "unknown";

export type SportsWatchPresentedMatch = {
  candidate: SportsWatchCandidate;
  countedInSummary: boolean;
  discipline: SportsWatchDiscipline;
  competitionName: string;
  eventCode: string;
  round: string;
  partner: string | null;
  opponents: string;
  outcome: SportsWatchOutcome;
  outcomeLabel: string;
  athleteScore: string;
};

export type SportsWatchDisciplineGroup = {
  discipline: SportsWatchDiscipline;
  matches: SportsWatchPresentedMatch[];
  collectedCount: number;
  victories: number;
  defeats: number;
  forfeits: number;
  retirements: number;
  unknown: number;
};

export type SportsWatchTournamentGroup = {
  key: string;
  athleteName: string;
  competitionName: string;
  sourceName: string;
  sourceUrl: string;
  eventDateFrom: string | null;
  eventDateTo: string | null;
  matchCount: number;
  unstructuredCount: number;
  disciplines: SportsWatchDisciplineGroup[];
  unstructuredCandidates: Array<{
    candidate: SportsWatchCandidate;
    countedInSummary: boolean;
  }>;
};

const disciplineOrder: SportsWatchDiscipline[] = ["simple", "double", "mixte"];

const strictMatchHeader = /^(.*?) — ([A-Z0-9]+) \((simple|double|mixte)\) — (.+?)\. (.+)$/;

const roundTranslations: Record<string, string> = {
  "Ronde van 16": "Huitième de finale",
  Kwartfinale: "Quart de finale",
  "Halve finale": "Demi-finale",
  Finale: "Finale",
  "5e/8e plaats": "Match de classement 5e–8e places",
  "7e/8e plaats": "Match de classement 7e–8e places",
};

const translateRound = (value: string): string => roundTranslations[value] ?? value;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readOutcome = (
  athleteWon: boolean,
  score: string,
): { outcome: SportsWatchOutcome; label: string } => {
  const normalized = score.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
  if (/\b(?:w\.?o\.?|walkover|forfait)\b/.test(normalized)) {
    return {
      outcome: "forfeit",
      label: athleteWon ? "Victoire par forfait" : "Défaite par forfait",
    };
  }
  if (/\b(?:ret\.?|rtd|abandon)\b/.test(normalized)) {
    return {
      outcome: "retirement",
      label: athleteWon ? "Victoire sur abandon" : "Défaite sur abandon",
    };
  }
  const sets = normalized.split(",").map((set) => set.trim()).filter(Boolean);
  if (sets.length > 0 && sets.every((set) => /^\d+\s*-\s*\d+$/.test(set))) {
    return {
      outcome: athleteWon ? "victory" : "defeat",
      label: athleteWon ? "Victoire" : "Défaite",
    };
  }
  return { outcome: "unknown", label: "Résultat non standard" };
};

const parseStructuredCandidate = (
  candidate: SportsWatchCandidate,
  countedInSummary: boolean,
): SportsWatchPresentedMatch | null => {
  const header = candidate.excerpt.match(strictMatchHeader);
  if (!header) return null;
  const [, competitionName, eventCode, disciplineValue, round, body] = header;
  const discipline = disciplineValue as SportsWatchDiscipline;
  if (candidate.title !== `${competitionName} — ${eventCode}`) return null;

  if (discipline === "simple") {
    const pattern = new RegExp(
      `^Ordre officiel : (.+?) puis (.+?)\\. Vainqueur explicite : (.+?)\\. Scores dans l’ordre officiel : (.+?)\\. Score du point de vue d’${escapeRegExp(candidate.athleteName)} : (.+?)\\.(?: Classement final explicitement indiqué : .+?\\.)?$`,
    );
    const match = body.match(pattern);
    if (!match) return null;
    const [, firstPlayer, secondPlayer, winner, , athleteScore] = match;
    if (candidate.athleteName !== firstPlayer && candidate.athleteName !== secondPlayer) return null;
    const opponent = candidate.athleteName === firstPlayer ? secondPlayer : firstPlayer;
    const athleteWon = winner === candidate.athleteName;
    const result = readOutcome(athleteWon, athleteScore);
    return {
      candidate,
      countedInSummary,
      discipline,
      competitionName,
      eventCode,
      round: translateRound(round),
      partner: null,
      opponents: opponent,
      outcome: result.outcome,
      outcomeLabel: result.label,
      athleteScore,
    };
  }

  const pattern = new RegExp(
    `^Équipe 1 officielle : (.+?)\\. Équipe 2 officielle : (.+?)\\. Équipe d’${escapeRegExp(candidate.athleteName)} : (.+?)\\. Partenaire d’${escapeRegExp(candidate.athleteName)} : (.+?)\\. Adversaires : (.+?)\\. Équipe gagnante explicite : (.+?)\\. Scores dans l’ordre officiel des équipes : (.+?)\\. Scores du point de vue de l’équipe d’${escapeRegExp(candidate.athleteName)} : (.+?)\\.(?: Classement final explicitement indiqué : .+?\\.)?$`,
  );
  const match = body.match(pattern);
  if (!match) return null;
  const [, , , athleteTeam, partner, opponents, winningTeam, , athleteScore] = match;
  if (!athleteTeam.split(" et ").includes(candidate.athleteName)) return null;
  const athleteWon = winningTeam === athleteTeam;
  const result = readOutcome(athleteWon, athleteScore);
  return {
    candidate,
    countedInSummary,
    discipline,
    competitionName,
    eventCode,
    round: translateRound(round),
    partner,
    opponents,
    outcome: result.outcome,
    outcomeLabel: result.label,
    athleteScore,
  };
};

const competitionIdentity = (candidate: SportsWatchCandidate): string => {
  try {
    const url = new URL(candidate.articleUrl);
    const tournamentId = url.searchParams.get("id");
    return tournamentId
      ? `${candidate.sourceName}|${url.hostname}|${tournamentId}`
      : `${candidate.sourceName}|${url.toString()}`;
  } catch {
    return `${candidate.sourceName}|${candidate.articleUrl}`;
  }
};

const minDate = (values: Array<string | null>): string | null => {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates[0] ?? null;
};

const maxDate = (values: Array<string | null>): string | null => {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates.at(-1) ?? null;
};

export const buildSportsWatchTournamentGroups = (
  candidates: SportsWatchCandidate[],
): SportsWatchTournamentGroup[] => {
  const supersededIds = new Set(
    candidates
      .map((candidate) => candidate.supersedesCandidateId)
      .filter((id): id is string => Boolean(id)),
  );
  const grouped = new Map<string, {
    candidates: SportsWatchCandidate[];
    parsed: Array<SportsWatchPresentedMatch | null>;
  }>();

  for (const candidate of candidates) {
    const key = `${candidate.athleteId}|${competitionIdentity(candidate)}`;
    const current = grouped.get(key) ?? { candidates: [], parsed: [] };
    const countedInSummary = !supersededIds.has(candidate.id);
    current.candidates.push(candidate);
    current.parsed.push(parseStructuredCandidate(candidate, countedInSummary));
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([key, value]): SportsWatchTournamentGroup => {
      const structured = value.parsed.filter(
        (match): match is SportsWatchPresentedMatch => match !== null,
      );
      const firstStructured = structured[0];
      const firstCandidate = value.candidates[0];
      const disciplines = disciplineOrder
        .map((discipline): SportsWatchDisciplineGroup | null => {
          const matches = structured
            .filter((match) => match.discipline === discipline)
            .sort((left, right) =>
              (right.candidate.eventDateFrom ?? "").localeCompare(left.candidate.eventDateFrom ?? ""));
          if (matches.length === 0) return null;
          const counted = matches.filter((match) => match.countedInSummary);
          return {
            discipline,
            matches,
            collectedCount: counted.length,
            victories: counted.filter((match) => match.outcome === "victory").length,
            defeats: counted.filter((match) => match.outcome === "defeat").length,
            forfeits: counted.filter((match) => match.outcome === "forfeit").length,
            retirements: counted.filter((match) => match.outcome === "retirement").length,
            unknown: counted.filter((match) => match.outcome === "unknown").length,
          };
        })
        .filter((discipline): discipline is SportsWatchDisciplineGroup => discipline !== null);
      const unstructuredCandidates = value.candidates
        .map((candidate, index) => ({
          candidate,
          countedInSummary: !supersededIds.has(candidate.id),
          parsed: value.parsed[index],
        }))
        .filter((item) => item.parsed === null)
        .map(({ candidate, countedInSummary }) => ({ candidate, countedInSummary }));
      const countedStructured = structured.filter((match) => match.countedInSummary);
      const relevantDates = countedStructured.length > 0
        ? countedStructured.map((match) => match.candidate.eventDateFrom)
        : value.candidates.map((candidate) => candidate.eventDateFrom);
      return {
        key,
        athleteName: firstCandidate.athleteName,
        competitionName: firstStructured?.competitionName ?? firstCandidate.title,
        sourceName: firstCandidate.sourceName,
        sourceUrl: firstCandidate.sourceUrl,
        eventDateFrom: minDate(relevantDates),
        eventDateTo: maxDate(relevantDates),
        matchCount: countedStructured.length,
        unstructuredCount: unstructuredCandidates.filter((item) => item.countedInSummary).length,
        disciplines,
        unstructuredCandidates,
      };
    })
    .sort((left, right) =>
      (right.eventDateTo ?? "").localeCompare(left.eventDateTo ?? "")
      || left.athleteName.localeCompare(right.athleteName, "fr")
      || left.competitionName.localeCompare(right.competitionName, "fr"));
};

export const sportsWatchPresentationTestUtils = {
  parseStructuredCandidate,
  translateRound,
};
