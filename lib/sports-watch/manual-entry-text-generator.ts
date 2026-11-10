import { normalizeSportsWatchSport } from "@/lib/sports-watch/sport";
import type {
  SportsWatchManualBasketballDetails,
  SportsWatchManualFootballDetails,
  SportsWatchManualNewsType,
  SportsWatchManualStatistic,
} from "@/types/sports-watch";

export type SportsWatchManualTextGenerationInput = {
  athlete: {
    name: string;
    sport: string;
    club: string;
  };
  eventDate: string;
  newsType: SportsWatchManualNewsType;
  competition: string | null;
  opponent: string | null;
  score: string | null;
  football: SportsWatchManualFootballDetails | null;
  basketball: SportsWatchManualBasketballDetails | null;
  statistics: SportsWatchManualStatistic[];
};

export type SportsWatchGeneratedText = {
  title: string;
  summary: string;
};

type ScoreDetails = {
  display: string;
  outcome: "win" | "loss" | "draw";
};

const clean = (value: string | null | undefined): string => value?.trim() ?? "";

const formatDate = (value: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return new Intl.DateTimeFormat("fr-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

const parseScore = (value: string | null): ScoreDetails | null => {
  const match = clean(value).match(/^(\d+)\s*[-–—:]\s*(\d+)$/);
  if (!match) return null;
  const athleteTeam = Number(match[1]);
  const opponent = Number(match[2]);
  return {
    display: `${athleteTeam}–${opponent}`,
    outcome: athleteTeam > opponent
      ? "win"
      : athleteTeam < opponent
        ? "loss"
        : "draw",
  };
};

const teamReference = (team: string): string =>
  /^[aeiouyhàâäéèêëîïôöùûü]/i.test(team) ? `d’${team}` : `du ${team}`;

const withDate = (sentence: string, date: string): string =>
  `${sentence.replace(/[.,;:]\s*$/, "")}, le ${date}.`;

const countLabel = (
  value: number,
  singular: string,
  plural = `${singular}s`,
  singularArticle = "un",
): string => value === 1 ? `${singularArticle} ${singular}` : `${value} ${plural}`;

const joinList = (items: string[]): string => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
};

const matchOutcomeLabel = (outcome: ScoreDetails["outcome"]): string => {
  if (outcome === "win") return "victoire";
  if (outcome === "loss") return "défaite";
  return "match nul";
};

const footballMatchContext = (
  team: string,
  opponent: string,
  score: ScoreDetails | null,
): string => {
  const teamPart = team ? ` ${teamReference(team)}` : "";
  const opponentPart = opponent ? ` face à ${opponent}` : "";
  if (score) {
    const article = score.outcome === "draw" ? "du" : "de la";
    return `lors ${article} ${matchOutcomeLabel(score.outcome)} ${score.display}${teamPart}${opponentPart}`;
  }
  return opponent
    ? `face à ${opponent}`
    : team
      ? `avec ${team}`
      : "";
};

const participationContext = (
  team: string,
  opponent: string,
  score: ScoreDetails | null,
): string => {
  const teamPart = team ? ` avec ${team}` : "";
  const opponentPart = opponent ? ` face à ${opponent}` : "";
  if (!score) return `${teamPart}${opponentPart}`.trim();
  if (score.outcome === "win") {
    return `${teamPart} lors de la victoire ${score.display}${opponentPart}`.trim();
  }
  if (score.outcome === "loss") {
    return `${teamPart} lors de la défaite ${score.display}${opponentPart}`.trim();
  }
  return `${teamPart} lors du match nul ${score.display}${opponentPart}`.trim();
};

const footballStatistics = (
  athleteName: string,
  football: SportsWatchManualFootballDetails,
): string[] => {
  const sentences: string[] = [];
  if (football.assists !== null && football.assists > 0) {
    sentences.push(
      `${athleteName} a délivré ${countLabel(
        football.assists,
        "passe décisive",
        "passes décisives",
        "une",
      )}.`,
    );
  }
  if (football.yellowCards !== null && football.yellowCards > 0) {
    sentences.push(
      `${athleteName} a reçu ${countLabel(
        football.yellowCards,
        "carton jaune",
        "cartons jaunes",
      )}.`,
    );
  }
  if (football.redCards !== null && football.redCards > 0) {
    sentences.push(
      `${athleteName} a reçu ${countLabel(
        football.redCards,
        "carton rouge",
        "cartons rouges",
      )}.`,
    );
  }
  return sentences;
};

const generateFootball = (
  input: SportsWatchManualTextGenerationInput,
  date: string,
): SportsWatchGeneratedText | null => {
  const football = input.football;
  if (!football) return null;
  const name = clean(input.athlete.name);
  const team = clean(football.team) || clean(input.athlete.club);
  const opponent = clean(football.opponent) || clean(input.opponent);
  const competition = clean(football.competition) || clean(input.competition);
  const declaredScore = clean(football.score) || clean(input.score);
  const score = parseScore(declaredScore || null);
  const goals = football.goals;
  const hasIndividualFact = goals !== null && goals > 0
    || football.participationStatus !== "unknown"
    || football.minutes !== null
    || football.assists !== null && football.assists > 0
    || football.yellowCards !== null && football.yellowCards > 0
    || football.redCards !== null && football.redCards > 0;
  const hasCollectiveFact = Boolean(team && (opponent || declaredScore || competition));
  if (!name || (!hasIndividualFact && !hasCollectiveFact)) return null;

  let title: string;
  const matchContext = footballMatchContext(team, opponent, score);
  if (goals !== null && goals > 0) {
    const scoring = goals === 1 ? "buteur" : `auteur de ${countLabel(goals, "but")}`;
    title = score
      ? `${name} ${scoring} lors ${score.outcome === "draw" ? "du" : "de la"} ${matchOutcomeLabel(score.outcome)}${team ? ` ${teamReference(team)}` : ""}`
      : `${name} ${scoring}${opponent ? ` face à ${opponent}` : ""}`;
  } else if (football.participationStatus === "starter") {
    title = `${name} titulaire${opponent ? ` face à ${opponent}` : team ? ` avec ${team}` : ""}`;
  } else if (football.participationStatus === "entered") {
    title = `${name} entre en jeu${opponent ? ` face à ${opponent}` : team ? ` avec ${team}` : ""}`;
  } else if (football.participationStatus === "unused_substitute") {
    title = `${name} sur la feuille${opponent ? ` face à ${opponent}` : team ? ` avec ${team}` : ""}`;
  } else if (score && team) {
    const prefix = score.outcome === "win"
      ? "Victoire"
      : score.outcome === "loss"
        ? "Défaite"
        : "Match nul";
    title = `${prefix} ${score.display} ${teamReference(team)}${opponent ? ` face à ${opponent}` : ""}`;
  } else {
    title = `${name}${opponent ? ` face à ${opponent}` : team ? ` avec ${team}` : " — résultat"}`;
  }

  const sentences: string[] = [];
  const context = participationContext(team, opponent, score);
  if (goals !== null && goals > 0) {
    sentences.push(withDate(
      `${name} a inscrit ${countLabel(goals, "but")} ${matchContext}`,
      date,
    ));
    if (football.participationStatus === "starter") {
      sentences.push(football.minutes !== null && football.minutes > 0
        ? `Titulaire, l’athlète a disputé ${countLabel(
          football.minutes,
          "minute",
          "minutes",
          "une",
        )}.`
        : "L’athlète était titulaire.");
    } else if (football.participationStatus === "entered") {
      sentences.push(football.minutes !== null && football.minutes > 0
        ? `Entré en jeu, l’athlète a disputé ${countLabel(
          football.minutes,
          "minute",
          "minutes",
          "une",
        )}.`
        : "L’athlète est entré en jeu.");
    }
  } else if (football.participationStatus === "starter") {
    sentences.push(withDate(
      `${name} était titulaire${context ? ` ${context}` : ""}`,
      date,
    ));
    if (football.minutes !== null && football.minutes > 0) {
      sentences.push(`${name} a disputé ${countLabel(
        football.minutes,
        "minute",
        "minutes",
        "une",
      )}.`);
    }
  } else if (football.participationStatus === "entered") {
    sentences.push(withDate(
      `${name} est entré en jeu${context ? ` ${context}` : ""}`,
      date,
    ));
    if (football.minutes !== null && football.minutes > 0) {
      sentences.push(`${name} a disputé ${countLabel(
        football.minutes,
        "minute",
        "minutes",
        "une",
      )}.`);
    }
  } else if (football.participationStatus === "unused_substitute") {
    sentences.push(withDate(
      `${name} figurait parmi les remplaçants${team ? ` de ${team}` : ""}${opponent ? ` face à ${opponent}` : ""} sans entrer en jeu`,
      date,
    ));
  } else if (score && team) {
    if (score.outcome === "win") {
      sentences.push(withDate(
        `L’équipe ${team} s’est imposée ${score.display}${opponent ? ` face à ${opponent}` : ""}`,
        date,
      ));
    } else if (score.outcome === "loss") {
      sentences.push(withDate(
        `L’équipe ${team} s’est inclinée ${score.display}${opponent ? ` face à ${opponent}` : ""}`,
        date,
      ));
    } else {
      sentences.push(withDate(
        `L’équipe ${team} a fait match nul ${score.display}${opponent ? ` face à ${opponent}` : ""}`,
        date,
      ));
    }
    sentences.push(`La participation de ${name} n’est pas renseignée.`);
  } else if (declaredScore || opponent || competition) {
    const details = [
      declaredScore ? `le résultat ${declaredScore}` : null,
      opponent ? `face à ${opponent}` : null,
      competition ? `en ${competition}` : null,
    ].filter((value): value is string => Boolean(value)).join(" ");
    sentences.push(withDate(`${name} est associé à ${details}`, date));
    sentences.push(`La participation de ${name} n’est pas renseignée.`);
  }

  if (competition && sentences[0] && !sentences[0].includes(competition)) {
    sentences[0] = sentences[0].replace(/\.$/, `, en ${competition}.`);
  }
  sentences.push(...footballStatistics(name, football));
  return sentences.length > 0 ? { title, summary: sentences.join(" ") } : null;
};

const basketballStatistics = (
  name: string,
  basketball: SportsWatchManualBasketballDetails,
): string | null => {
  const facts = [
    basketball.points !== null && basketball.points > 0
      ? `inscrit ${countLabel(basketball.points, "point")}`
      : null,
    basketball.rebounds !== null && basketball.rebounds > 0
      ? `capté ${countLabel(basketball.rebounds, "rebond")}`
      : null,
    basketball.assists !== null && basketball.assists > 0
      ? `délivré ${countLabel(
        basketball.assists,
        "passe décisive",
        "passes décisives",
        "une",
      )}`
      : null,
    basketball.steals !== null && basketball.steals > 0
      ? `réalisé ${countLabel(basketball.steals, "interception", "interceptions", "une")}`
      : null,
    basketball.blocks !== null && basketball.blocks > 0
      ? `réalisé ${countLabel(basketball.blocks, "contre")}`
      : null,
  ].filter((value): value is string => Boolean(value));
  return facts.length > 0 ? `${name} a ${joinList(facts)}.` : null;
};

const explicitRecordStatistic = (
  statistics: SportsWatchManualStatistic[],
): SportsWatchManualStatistic | null => statistics.find((statistic) =>
  /\b(record|meilleur(?:e)?\s+temps)\b/i.test(`${statistic.label} ${statistic.value}`)) ?? null;

const generateBasketball = (
  input: SportsWatchManualTextGenerationInput,
  date: string,
): SportsWatchGeneratedText | null => {
  const basketball = input.basketball;
  if (!basketball) return null;
  const name = clean(input.athlete.name);
  const team = clean(input.athlete.club);
  const opponent = clean(input.opponent);
  const competition = clean(input.competition);
  const score = parseScore(input.score);
  const recordStatistic = explicitRecordStatistic(input.statistics);
  const explicitRecord = input.newsType === "record" || Boolean(recordStatistic);
  const hasStatistic = Object.values(basketball).some((value) => value !== null);
  if (!name || (!hasStatistic && !opponent && !score && !competition && !explicitRecord)) {
    return null;
  }

  let title: string;
  if (explicitRecord) {
    const bestTime = recordStatistic
      && /meilleur(?:e)?\s+temps/i.test(recordStatistic.label);
    title = bestTime
      ? `${name} établit son meilleur temps de jeu${competition ? ` en ${competition}` : ""}`
      : `${name} établit un record${competition ? ` en ${competition}` : ""}`;
  } else if (basketball.points !== null && basketball.points > 0) {
    title = `${name} inscrit ${countLabel(basketball.points, "point")}${opponent ? ` face à ${opponent}` : ""}`;
  } else if (basketball.minutes !== null && basketball.minutes > 0) {
    title = `${name} dispute ${countLabel(
      basketball.minutes,
      "minute",
      "minutes",
      "une",
    )}${opponent ? ` face à ${opponent}` : ""}`;
  } else if (basketball.starter === true) {
    title = `${name} titulaire${opponent ? ` face à ${opponent}` : team ? ` avec ${team}` : ""}`;
  } else {
    title = `${name}${opponent ? ` face à ${opponent}` : " — performance basketball"}`;
  }

  const sentences: string[] = [];
  if (basketball.minutes !== null && basketball.minutes > 0) {
    sentences.push(withDate(
      `${name} a disputé ${countLabel(
        basketball.minutes,
        "minute",
        "minutes",
        "une",
      )}${team ? ` avec ${team}` : ""}${opponent ? ` face à ${opponent}` : ""}`,
      date,
    ));
  } else if (basketball.starter !== null) {
    sentences.push(withDate(
      `${name} ${basketball.starter ? "était titulaire" : "n’était pas titulaire"}${team ? ` avec ${team}` : ""}${opponent ? ` face à ${opponent}` : ""}`,
      date,
    ));
  } else if (score && team) {
    const outcome = score.outcome === "win"
      ? "s’est imposée"
      : score.outcome === "loss"
        ? "s’est inclinée"
        : "a fait match nul";
    sentences.push(withDate(
      `L’équipe ${team} ${outcome} ${score.display}${opponent ? ` face à ${opponent}` : ""}`,
      date,
    ));
  }
  const statistics = basketballStatistics(name, basketball);
  if (statistics) sentences.push(statistics);
  if (explicitRecord) {
    const fact = recordStatistic
      ? `${recordStatistic.label} : ${recordStatistic.value}${recordStatistic.unit ? ` ${recordStatistic.unit}` : ""}`
      : null;
    sentences.push(fact
      ? `La performance « ${fact} » est explicitement renseignée comme un record.`
      : "Cette performance est explicitement renseignée comme un record.");
  }
  if (competition && sentences[0] && !sentences[0].includes(competition)) {
    sentences[0] = sentences[0].replace(/\.$/, `, en ${competition}.`);
  }
  return sentences.length > 0 ? { title, summary: sentences.join(" ") } : null;
};

const genericFact = (
  input: SportsWatchManualTextGenerationInput,
): { title: string; summary: string } | null => {
  const statistic = input.statistics.find((item) => clean(item.label) && clean(item.value));
  if (statistic) {
    const fact = `${clean(statistic.label)} : ${clean(statistic.value)}${
      clean(statistic.unit) ? ` ${clean(statistic.unit)}` : ""
    }`;
    return {
      title: fact,
      summary: `a enregistré la performance « ${fact} »`,
    };
  }
  const score = clean(input.score);
  const opponent = clean(input.opponent);
  if (score) {
    return {
      title: `Résultat ${score}`,
      summary: `a enregistré le résultat ${score}${opponent ? ` face à ${opponent}` : ""}`,
    };
  }
  const facts: Partial<Record<
    SportsWatchManualNewsType,
    { title: string; summary: string }
  >> = {
    selection_callup: {
      title: "Sélection ou convocation",
      summary: "a fait l’objet d’une sélection ou d’une convocation",
    },
    transfer_signing: {
      title: "Transfert ou signature",
      summary: "est concerné par un transfert ou une signature",
    },
    injury_return: {
      title: "Blessure ou retour",
      summary: "est concerné par une blessure ou un retour",
    },
    distinction: {
      title: "Distinction",
      summary: "a reçu une distinction",
    },
    record: {
      title: "Record",
      summary: "a établi un record",
    },
  };
  return facts[input.newsType] ?? null;
};

const generateGeneric = (
  input: SportsWatchManualTextGenerationInput,
  date: string,
): SportsWatchGeneratedText | null => {
  const name = clean(input.athlete.name);
  const fact = genericFact(input);
  if (!name || !fact) return null;
  const competition = clean(input.competition);
  return {
    title: `${name} — ${fact.title}`,
    summary: withDate(
      `${name} ${fact.summary}${competition ? ` lors de ${competition}` : ""}`,
      date,
    ),
  };
};

export const generateSportsWatchManualText = (
  input: SportsWatchManualTextGenerationInput,
): SportsWatchGeneratedText | null => {
  const date = formatDate(input.eventDate);
  if (!date || !clean(input.athlete.name)) return null;
  const sport = normalizeSportsWatchSport(input.athlete.sport);
  if (
    sport.includes("football")
    && !sport.includes("americain")
    && !sport.includes("foot us")
  ) {
    return generateFootball(input, date);
  }
  if (sport.includes("basket")) return generateBasketball(input, date);
  return generateGeneric(input, date);
};

export const canGenerateSportsWatchManualText = (
  input: SportsWatchManualTextGenerationInput,
): boolean => generateSportsWatchManualText(input) !== null;
