import type {
  SportsWatchCandidate,
  SportsWatchManualBasketballDetails,
} from "@/types/sports-watch";

export type SportsWatchCanvaField = {
  label: string;
  value: string;
  requiresVerification: boolean;
};

export type SportsWatchCanvaPreparation = {
  identity: SportsWatchCanvaField[];
  collective: SportsWatchCanvaField[];
  individual: SportsWatchCanvaField[];
  copyText: string;
};

const statisticLabels: Record<string, string> = {
  "MIN": "Minutes",
  "PTS": "Points",
  "TIRS": "Tirs",
  "2PTS": "Tirs à 2 points",
  "3PTS": "Tirs à 3 points",
  "LF": "Lancers francs",
  "RO": "Rebonds offensifs",
  "RD": "Rebonds défensifs",
  "REB": "Rebonds",
  "PD": "Passes",
  "INT": "Interceptions",
  "BP": "Balles perdues",
  "CTR": "Contres",
  "CS": "Contres subis",
  "FA": "Fautes",
  "FP": "Fautes provoquées",
  "+/-": "+/-",
  "EVAL": "Évaluation",
  "PIR": "PIR",
  "PIE": "PIE",
  "USG%": "Usage",
  "POSS.": "Possessions",
  "Titulaire": "Titulaire",
};

const statisticKeys = Object.keys(statisticLabels).sort((left, right) =>
  right.length - left.length);

const parseStatistics = (value: string): Array<[string, string]> =>
  value.split(" · ").flatMap((item) => {
    const key = statisticKeys.find((candidate) => item.startsWith(`${candidate} `));
    if (!key) return [];
    const statisticValue = item.slice(key.length + 1).trim();
    return statisticValue ? [[statisticLabels[key], statisticValue]] : [];
  });

const field = (
  label: string,
  value: string | number | boolean | null | undefined,
  requiresVerification: boolean,
): SportsWatchCanvaField | null => {
  if (value === null || value === undefined || value === "") return null;
  return {
    label,
    value: typeof value === "boolean" ? value ? "Oui" : "Non" : String(value),
    requiresVerification,
  };
};

const compact = (
  values: Array<SportsWatchCanvaField | null>,
): SportsWatchCanvaField[] => values.filter(
  (value): value is SportsWatchCanvaField => value !== null,
);

const manualStatistics = (
  basketball: SportsWatchManualBasketballDetails,
  requiresVerification: boolean,
): SportsWatchCanvaField[] => compact([
  field("Titulaire", basketball.starter, requiresVerification),
  field("Minutes", basketball.minutes, requiresVerification),
  field("Points", basketball.points, requiresVerification),
  field("Rebonds", basketball.rebounds, requiresVerification),
  field("Passes", basketball.assists, requiresVerification),
  field("Interceptions", basketball.steals, requiresVerification),
  field("Contres", basketball.blocks, requiresVerification),
]);

const parseSwissBasketball = (
  candidate: SportsWatchCandidate,
  requiresVerification: boolean,
): {
  team: string | null;
  opponent: string | null;
  competition: string | null;
  score: string | null;
  statistics: SportsWatchCanvaField[];
} | null => {
  if (candidate.sourceName !== "Swiss Basketball — source officielle") return null;
  const facts = candidate.excerpt.match(
    /^Source : Swiss Basketball — source officielle\. Compétition : (.+?) · .+?\. Équipe : (.+?)\. Match : (.+?) (\d+)–(\d+) (.+?)\. Date : \d{4}-\d{2}-\d{2}\. (.+)$/,
  );
  if (!facts) return null;
  const [, competition, team, homeTeam, homeScore, awayScore, awayTeam, rest] = facts;
  const isHome = team === homeTeam;
  const isAway = team === awayTeam;
  if (isHome === isAway) return null;
  const statisticsMatch = rest.match(
    /Statistiques individuelles explicitement présentes : (.+?)\./,
  );
  return {
    team,
    opponent: isHome ? awayTeam : homeTeam,
    competition,
    score: isHome ? `${homeScore}–${awayScore}` : `${awayScore}–${homeScore}`,
    statistics: statisticsMatch
      ? parseStatistics(statisticsMatch[1]).map(([label, value]) => ({
        label,
        value,
        requiresVerification,
      }))
      : [],
  };
};

const parseBeBasket = (
  candidate: SportsWatchCandidate,
  requiresVerification: boolean,
): {
  team: string | null;
  opponent: string | null;
  score: string | null;
  statistics: SportsWatchCanvaField[];
} | null => {
  if (candidate.sourceName !== "BeBasket — source tierce") return null;
  const facts = candidate.excerpt.match(
    /^Source : BeBasket — source tierce\. Statut factuel : non vérifié ; aucune corroboration officielle\. Match : (.+?) vs (.+?) \((\d+)-(\d+)\)\. Date : \d{4}-\d{2}-\d{2}\. .+?Statistiques explicitement présentes : (.+?)\.$/,
  );
  if (!facts) return null;
  const [, homeTeam, awayTeam, homeScore, awayScore, statisticsValue] = facts;
  const team = candidate.attributionEvidence
    .map((evidence) => evidence.match(/^Rattachement Admin : équipe (.+), joueuse .+\.$/))
    .find((match) => match !== null)?.[1] ?? null;
  const isHome = team === homeTeam;
  const isAway = team === awayTeam;
  if (!team || isHome === isAway) return null;
  return {
    team,
    opponent: isHome ? awayTeam : homeTeam,
    score: isHome ? `${homeScore}–${awayScore}` : `${awayScore}–${homeScore}`,
    statistics: parseStatistics(statisticsValue).map(([label, value]) => ({
      label,
      value,
      requiresVerification,
    })),
  };
};

export const isBasketballSportsWatchCandidate = (
  candidate: SportsWatchCandidate,
  athleteSport: string | null | undefined,
): boolean =>
  Boolean(candidate.manualEntry?.basketball)
  || candidate.sourceName === "BeBasket — source tierce"
  || candidate.sourceName === "Swiss Basketball — source officielle"
  || /\bbasket(?:ball)?\b/i.test(athleteSport?.trim() ?? "");

export const buildSportsWatchCanvaPreparation = (
  candidate: SportsWatchCandidate,
  athleteClub: string | null | undefined,
): SportsWatchCanvaPreparation => {
  const requiresVerification = candidate.verificationStatus !== "verified";
  const manualEntry = candidate.manualEntry;
  const swiss = parseSwissBasketball(candidate, requiresVerification);
  const beBasket = parseBeBasket(candidate, requiresVerification);
  const automatic = swiss ?? beBasket;
  const team = manualEntry ? athleteClub : automatic?.team ?? athleteClub;
  const identity = compact([
    field("Athlète", candidate.athleteName, false),
    field("Club", team?.trim(), false),
    field(
      "Adversaire",
      manualEntry?.opponent ?? automatic?.opponent,
      requiresVerification,
    ),
    field(
      "Compétition",
      manualEntry?.competition ?? swiss?.competition,
      requiresVerification,
    ),
    field("Date", candidate.eventDateFrom, requiresVerification),
  ]);
  const collective = compact([
    field(
      "Score collectif",
      manualEntry?.score ?? automatic?.score,
      requiresVerification,
    ),
  ]);
  const individual = manualEntry?.basketball
    ? [
      ...manualStatistics(manualEntry.basketball, requiresVerification),
      ...manualEntry.statistics.map((statistic) => ({
        label: statistic.label,
        value: `${statistic.value}${statistic.unit ? ` ${statistic.unit}` : ""}`,
        requiresVerification,
      })),
    ]
    : automatic?.statistics ?? [];
  const copyText = [...identity, ...collective, ...individual]
    .filter((item) => !item.requiresVerification)
    .map((item) => `${item.label} : ${item.value}`)
    .join("\n");
  return { identity, collective, individual, copyText };
};
