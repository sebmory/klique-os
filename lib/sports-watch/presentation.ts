import type {
  SportsWatchAthleteCandidateTotals,
  SportsWatchCandidate,
} from "@/types/sports-watch";

export type SportsWatchDiscipline = "simple" | "double" | "mixte";
export type SportsWatchOutcome = "victory" | "defeat" | "forfeit" | "retirement" | "unknown";

export type SportsWatchPresentedMatch = {
  candidate: SportsWatchCandidate;
  countedInSummary: boolean;
  discipline: SportsWatchDiscipline;
  competitionName: string;
  eventCode: string;
  round: string | null;
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

export type SportsWatchAthleteGroup = {
  athleteId: string;
  athleteName: string;
  pendingCount: number;
  exploitableCount: number;
  latestDate: string;
  tournaments: SportsWatchTournamentGroup[];
};

export type SportsWatchCandidateViews = {
  current: SportsWatchCandidate[];
  history: SportsWatchCandidate[];
  latest: SportsWatchCandidate[];
  supersededIds: Set<string>;
};

const disciplineOrder: SportsWatchDiscipline[] = ["simple", "double", "mixte"];

const structuredMatchHeader =
  /^(.+) — (.+?) \((simple|double|mixte)\)(?: — (.+?))?\. (.+)$/;

const disciplineFromEventCode = (eventCode: string): SportsWatchDiscipline | null => {
  if (
    /^(?:SM|SD|HE|DE|MS|WS|SH|SF)\d*$/i.test(eventCode)
    || /^Simple (?:Hommes|Dames) \d+$/.test(eventCode)
  ) {
    return "simple";
  }
  if (
    /^(?:DX|MX|XD)\d*$/i.test(eventCode)
    || /^(?:Double Mixte|Mixte) \d+$/.test(eventCode)
  ) {
    return "mixte";
  }
  if (
    /^(?:DM|DD|HD|MD|WD|DH|DF)\d*$/i.test(eventCode)
    || /^Double (?:Hommes|Dames) \d+$/.test(eventCode)
  ) {
    return "double";
  }
  return null;
};

const readCandidateTitle = (
  title: string,
): { competitionName: string; eventCode: string; discipline: SportsWatchDiscipline } | null => {
  const separatorIndex = title.lastIndexOf(" — ");
  if (separatorIndex <= 0) return null;
  const competitionName = title.slice(0, separatorIndex).trim();
  const eventCode = title.slice(separatorIndex + 3).trim();
  const discipline = disciplineFromEventCode(eventCode);
  return competitionName && discipline ? { competitionName, eventCode, discipline } : null;
};

const roundTranslations: Record<string, string> = {
  "Ronde van 16": "Huitième de finale",
  Kwartfinale: "Quart de finale",
  "Halve finale": "Demi-finale",
  Finale: "Finale",
  "5e/8e plaats": "Match de classement 5e–8e places",
  "7e/8e plaats": "Match de classement 7e–8e places",
};

const translateRound = (value: string): string => roundTranslations[value] ?? value;

const normalizeIdentityLabel = (value: string): string => value
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/\s+/g, " ");

const sameIdentityLabel = (left: string, right: string): boolean =>
  normalizeIdentityLabel(left) === normalizeIdentityLabel(right);

const splitTeam = (value: string): string[] =>
  value.split(" et ").map((member) => member.trim()).filter(Boolean);

const sameTeam = (left: string, right: string): boolean => {
  const leftMembers = splitTeam(left).map(normalizeIdentityLabel).sort();
  const rightMembers = splitTeam(right).map(normalizeIdentityLabel).sort();
  return leftMembers.length === rightMembers.length
    && leftMembers.every((member, index) => member === rightMembers[index]);
};

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
  if (candidate.sourceName !== "Swiss Badminton / Tournamentsoftware") return null;
  const header = candidate.excerpt.match(structuredMatchHeader);
  if (!header) return null;
  const [, competitionName, eventCode, disciplineValue, roundValue, body] = header;
  const discipline = disciplineValue as SportsWatchDiscipline;
  if (disciplineFromEventCode(eventCode) !== discipline) return null;
  if (candidate.title !== `${competitionName} — ${eventCode}`) return null;
  const round = roundValue ? translateRound(roundValue) : null;

  if (discipline === "simple") {
    const pattern =
      /^Ordre officiel : (.+?) puis (.+?)\. Vainqueur explicite : (.+?)\. Scores dans l’ordre officiel : (.+?)\. Score du point de vue d’(.+?) : (.+?)\.(?: Classement final explicitement indiqué : .+?\.)?$/;
    const match = body.match(pattern);
    if (!match) return null;
    const [, firstPlayer, secondPlayer, winner, , excerptAthleteName, athleteScore] = match;
    if (!sameIdentityLabel(excerptAthleteName, candidate.athleteName)) return null;
    const athleteIsFirst = sameIdentityLabel(candidate.athleteName, firstPlayer);
    const athleteIsSecond = sameIdentityLabel(candidate.athleteName, secondPlayer);
    if (athleteIsFirst === athleteIsSecond) return null;
    if (
      !sameIdentityLabel(winner, firstPlayer)
      && !sameIdentityLabel(winner, secondPlayer)
    ) return null;
    const opponent = athleteIsFirst ? secondPlayer : firstPlayer;
    const athleteWon = sameIdentityLabel(winner, candidate.athleteName);
    const result = readOutcome(athleteWon, athleteScore);
    return {
      candidate,
      countedInSummary,
      discipline,
      competitionName,
      eventCode,
      round,
      partner: null,
      opponents: opponent,
      outcome: result.outcome,
      outcomeLabel: result.label,
      athleteScore,
    };
  }

  const pattern =
    /^Équipe 1 officielle : (.+?)\. Équipe 2 officielle : (.+?)\. Équipe d’(.+?) : (.+?)\. Partenaire d’(.+?) : (.+?)\. Adversaires : (.+?)\. Équipe gagnante explicite : (.+?)\. Scores dans l’ordre officiel des équipes : (.+?)\. Scores du point de vue de l’équipe d’(.+?) : (.+?)\.(?: Classement final explicitement indiqué : .+?\.)?$/;
  const match = body.match(pattern);
  if (!match) return null;
  const [
    ,
    firstTeam,
    secondTeam,
    teamAthleteName,
    athleteTeam,
    partnerAthleteName,
    partner,
    opponents,
    winningTeam,
    ,
    scoreAthleteName,
    athleteScore,
  ] = match;
  if (
    !sameIdentityLabel(teamAthleteName, candidate.athleteName)
    || !sameIdentityLabel(partnerAthleteName, candidate.athleteName)
    || !sameIdentityLabel(scoreAthleteName, candidate.athleteName)
  ) return null;
  const athleteTeamMembers = splitTeam(athleteTeam);
  if (athleteTeamMembers.length !== 2) return null;
  const athleteMembers = athleteTeamMembers.filter((member) =>
    sameIdentityLabel(member, candidate.athleteName));
  if (athleteMembers.length !== 1) return null;
  const expectedPartner = athleteTeamMembers.find((member) =>
    !sameIdentityLabel(member, candidate.athleteName));
  if (!expectedPartner || !sameIdentityLabel(expectedPartner, partner)) return null;
  const athleteIsFirstTeam = sameTeam(athleteTeam, firstTeam);
  const athleteIsSecondTeam = sameTeam(athleteTeam, secondTeam);
  if (athleteIsFirstTeam === athleteIsSecondTeam) return null;
  const opponentTeam = athleteIsFirstTeam ? secondTeam : firstTeam;
  if (splitTeam(opponentTeam).length !== 2 || !sameTeam(opponents, opponentTeam)) return null;
  const winnerIsFirstTeam = sameTeam(winningTeam, firstTeam);
  const winnerIsSecondTeam = sameTeam(winningTeam, secondTeam);
  if (winnerIsFirstTeam === winnerIsSecondTeam) return null;
  const athleteWon = sameTeam(winningTeam, athleteTeam);
  const result = readOutcome(athleteWon, athleteScore);
  return {
    candidate,
    countedInSummary,
    discipline,
    competitionName,
    eventCode,
    round,
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
  allCandidates: SportsWatchCandidate[] = candidates,
): SportsWatchTournamentGroup[] => {
  const supersededIds = new Set(
    allCandidates
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
      const firstRecognizedTitle = value.candidates
        .map((candidate) => readCandidateTitle(candidate.title))
        .find((title) => title !== null);
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
        competitionName: firstStructured?.competitionName
          ?? firstRecognizedTitle?.competitionName
          ?? firstCandidate.title,
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

export const buildSportsWatchCandidateViews = (
  candidates: SportsWatchCandidate[],
): SportsWatchCandidateViews => {
  const supersededIds = new Set(
    candidates
      .map((candidate) => candidate.supersedesCandidateId)
      .filter((id): id is string => Boolean(id)),
  );
  const latest = candidates.filter((candidate) => !supersededIds.has(candidate.id));
  return {
    latest,
    supersededIds,
    current: latest.filter((candidate) =>
      candidate.adminStatus === "pending" || candidate.adminStatus === "validated"),
    history: candidates.filter((candidate) =>
      supersededIds.has(candidate.id)
      || candidate.adminStatus === "exploited"
      || candidate.adminStatus === "rejected"
      || candidate.adminStatus === "dismissed"),
  };
};

const candidateSortDate = (candidate: SportsWatchCandidate): string =>
  candidate.eventDateFrom ?? candidate.publicationDate ?? candidate.collectedAt;

export const buildSportsWatchAthleteGroups = (
  visibleCandidates: SportsWatchCandidate[],
  allCandidates: SportsWatchCandidate[],
  serverTotals?: SportsWatchAthleteCandidateTotals[],
): SportsWatchAthleteGroup[] => {
  const views = buildSportsWatchCandidateViews(allCandidates);
  const counts = new Map(
    serverTotals?.map((total) => [
      total.athleteId,
      { pending: total.pending, exploitable: total.validated },
    ]) ?? [],
  );
  if (!serverTotals) {
    for (const candidate of views.latest) {
      const current = counts.get(candidate.athleteId) ?? { pending: 0, exploitable: 0 };
      if (candidate.adminStatus === "pending") current.pending += 1;
      if (candidate.adminStatus === "validated") current.exploitable += 1;
      counts.set(candidate.athleteId, current);
    }
  }

  const grouped = new Map<string, SportsWatchCandidate[]>();
  for (const candidate of visibleCandidates) {
    const current = grouped.get(candidate.athleteId) ?? [];
    current.push(candidate);
    grouped.set(candidate.athleteId, current);
  }

  return Array.from(grouped.entries())
    .map(([athleteId, athleteCandidates]): SportsWatchAthleteGroup => {
      const sorted = [...athleteCandidates].sort((left, right) =>
        candidateSortDate(right).localeCompare(candidateSortDate(left)));
      const athleteCounts = counts.get(athleteId) ?? { pending: 0, exploitable: 0 };
      return {
        athleteId,
        athleteName: sorted[0].athleteName,
        pendingCount: athleteCounts.pending,
        exploitableCount: athleteCounts.exploitable,
        latestDate: candidateSortDate(sorted[0]),
        tournaments: buildSportsWatchTournamentGroups(sorted, allCandidates),
      };
    })
    .sort((left, right) =>
      right.latestDate.localeCompare(left.latestDate)
      || left.athleteName.localeCompare(right.athleteName, "fr"));
};

export const sportsWatchPresentationTestUtils = {
  disciplineFromEventCode,
  normalizeIdentityLabel,
  parseStructuredCandidate,
  readCandidateTitle,
  translateRound,
};
