import type { SportsWatchCandidate } from "@/types/sports-watch";

export type SportsWatchEditorialStat = {
  label: string;
  value: string;
};

export type SportsWatchEditorialPresentation = {
  headline: string;
  supportingLine: string | null;
  collectiveLine: string | null;
  contextLabel: string | null;
  secondaryStats: SportsWatchEditorialStat[];
  participationNote: string | null;
  outcome: "victory" | "defeat" | "neutral";
};

const statisticLabels = [
  "Titulaire",
  "USG%",
  "POSS.",
  "3PTS",
  "2PTS",
  "EVAL",
  "MIN",
  "PTS",
  "TIRS",
  "LF",
  "RO",
  "RD",
  "REB",
  "PD",
  "INT",
  "BP",
  "CTR",
  "CS",
  "FA",
  "FP",
  "+/-",
  "PIR",
  "PIE",
] as const;

const parseStatistics = (value: string): Map<string, string> => {
  const statistics = new Map<string, string>();
  for (const item of value.split(" · ")) {
    const label = statisticLabels.find((candidate) => item.startsWith(`${candidate} `));
    if (!label) continue;
    const statisticValue = item.slice(label.length + 1).trim();
    if (statisticValue) statistics.set(label, statisticValue);
  }
  return statistics;
};

const pointsLabel = (value: string): string =>
  `${value} ${value === "1" ? "point" : "points"}`;

const durationLabel = (value: string): string | null => {
  const match = value.match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return `${Number(match[1])} min ${Number(match[2])} s`;
};

const collectiveResult = (
  teamName: string,
  homeTeam: string,
  homeScore: number,
  awayScore: number,
  awayTeam: string,
): { line: string; outcome: "victory" | "defeat" | "neutral" } | null => {
  const isHome = teamName === homeTeam;
  const isAway = teamName === awayTeam;
  if (isHome === isAway) return null;
  const teamScore = isHome ? homeScore : awayScore;
  const opponentScore = isHome ? awayScore : homeScore;
  const opponent = isHome ? awayTeam : homeTeam;
  const outcome = teamScore > opponentScore
    ? "victory"
    : teamScore < opponentScore
      ? "defeat"
      : "neutral";
  const label = outcome === "victory"
    ? "Victoire"
    : outcome === "defeat"
      ? "Défaite"
      : "Égalité";
  return {
    line: `${label} ${teamScore}–${opponentScore} face à ${opponent}`,
    outcome,
  };
};

const secondaryStats = (statistics: Map<string, string>): SportsWatchEditorialStat[] => {
  const values: SportsWatchEditorialStat[] = [];
  const minutes = statistics.get("MIN");
  const formattedMinutes = minutes ? durationLabel(minutes) : null;
  if (formattedMinutes) values.push({ label: "Temps de jeu", value: formattedMinutes });
  for (const [label, displayLabel] of [
    ["REB", "Rebonds"],
    ["PD", "Passes"],
    ["INT", "Interceptions"],
  ] as const) {
    const value = statistics.get(label);
    if (value !== undefined) values.push({ label: displayLabel, value });
  }
  return values.slice(0, 3);
};

const presentSwissBasketball = (
  candidate: SportsWatchCandidate,
): SportsWatchEditorialPresentation | null => {
  if (candidate.sourceName !== "Swiss Basketball — source officielle") return null;
  const facts = candidate.excerpt.match(
    /^Source : Swiss Basketball — source officielle\. Compétition : (.+?) · (.+?)\. Équipe : (.+?)\. Match : (.+?) (\d+)–(\d+) (.+?)\. Date : (\d{4}-\d{2}-\d{2})\. (.+)$/,
  );
  if (!facts) return null;
  const [, competition, , teamName, homeTeam, homeScoreValue, awayScoreValue, awayTeam, eventDate, rest] = facts;
  if (candidate.eventDateFrom !== eventDate) return null;
  const statisticsMatch = rest.match(
    /Statistiques individuelles explicitement présentes : (.+?)\./,
  );
  const statistics = statisticsMatch ? parseStatistics(statisticsMatch[1]) : new Map<string, string>();
  const points = statistics.get("PTS");
  const participationEstablished = rest.includes(
    "Participation établie par une donnée individuelle explicite.",
  );
  const participationNotEstablished = rest.includes(
    "Participation non établie par la seule présence sur la feuille.",
  );
  if (participationEstablished === participationNotEstablished) return null;
  const collective = collectiveResult(
    teamName,
    homeTeam,
    Number(homeScoreValue),
    Number(awayScoreValue),
    awayTeam,
  );
  if (!collective) return null;
  return {
    headline: points !== undefined ? pointsLabel(points) : "Présence sur la feuille",
    supportingLine: `avec ${teamName}`,
    collectiveLine: collective.line,
    contextLabel: competition,
    secondaryStats: secondaryStats(statistics),
    participationNote: participationNotEstablished
      ? "Présence nominative, sans participation individuelle établie"
      : null,
    outcome: collective.outcome,
  };
};

const presentBeBasket = (
  candidate: SportsWatchCandidate,
): SportsWatchEditorialPresentation | null => {
  if (candidate.sourceName !== "BeBasket — source tierce") return null;
  const facts = candidate.excerpt.match(
    /^Source : BeBasket — source tierce\. Statut factuel : non vérifié ; aucune corroboration officielle\. Match : (.+?)\. Date : (\d{4}-\d{2}-\d{2})\. Participation explicitement documentée pour (.+?)\. Statistiques explicitement présentes : (.+?)\.$/,
  );
  if (!facts || candidate.eventDateFrom !== facts[2]) return null;
  const [, matchName, , , statisticsValue] = facts;
  const matchup = matchName.match(/^(.+) vs (.+) \((\d+)-(\d+)\)$/);
  if (!matchup) return null;
  const teamEvidence = candidate.attributionEvidence
    .map((evidence) => evidence.match(/^Rattachement Admin : équipe (.+), joueuse .+\.$/))
    .find((match) => match !== null);
  const teamName = teamEvidence?.[1];
  if (!teamName) return null;
  const [, homeTeam, awayTeam, homeScoreValue, awayScoreValue] = matchup;
  const collective = collectiveResult(
    teamName,
    homeTeam,
    Number(homeScoreValue),
    Number(awayScoreValue),
    awayTeam,
  );
  if (!collective) return null;
  const statistics = parseStatistics(statisticsValue);
  const points = statistics.get("PTS");
  if (points === undefined) return null;
  return {
    headline: pointsLabel(points),
    supportingLine: `avec ${teamName}`,
    collectiveLine: collective.line,
    contextLabel: null,
    secondaryStats: secondaryStats(statistics),
    participationNote: null,
    outcome: collective.outcome,
  };
};

export const buildSportsWatchEditorialPresentation = (
  candidate: SportsWatchCandidate,
): SportsWatchEditorialPresentation => {
  const basketball = presentSwissBasketball(candidate) ?? presentBeBasket(candidate);
  if (basketball) return basketball;
  if (
    candidate.sourceUrl.startsWith("/api/admin/sports-watch/imports/")
    && candidate.sourceUrl.endsWith("/file")
  ) {
    return {
      headline: "Résultat importé",
      supportingLine: candidate.title,
      collectiveLine: null,
      contextLabel: null,
      secondaryStats: [],
      participationNote: null,
      outcome: "neutral",
    };
  }
  if (candidate.resultKind === "collective_result") {
    return {
      headline: "Résultat collectif",
      supportingLine: candidate.title,
      collectiveLine: null,
      contextLabel: null,
      secondaryStats: [],
      participationNote: "Participation individuelle non établie par ce résultat collectif",
      outcome: "neutral",
    };
  }
  if (candidate.resultKind === "participation") {
    return {
      headline: "Présence signalée",
      supportingLine: candidate.title,
      collectiveLine: null,
      contextLabel: null,
      secondaryStats: [],
      participationNote: "Participation individuelle non établie",
      outcome: "neutral",
    };
  }
  return {
    headline: candidate.title,
    supportingLine: null,
    collectiveLine: null,
    contextLabel: null,
    secondaryStats: [],
    participationNote: null,
    outcome: "neutral",
  };
};

export const sportsWatchEditorialPresentationTestUtils = {
  durationLabel,
  parseStatistics,
  presentBeBasket,
  presentSwissBasketball,
};
