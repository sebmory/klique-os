import type { ManualEditorialMaterial } from "@/types/context-intelligence";
import type {
  SportsWatchBriefCandidate,
  SportsWatchVerifiedStatistic,
} from "@/types/sports-watch";

export type SportsBriefAngleId = "result" | "performance" | "news";

export type SportsBriefAngle = {
  id: SportsBriefAngleId;
  title: string;
  intent: string;
};

export type SportsBriefDraftText = {
  title: string;
  lead: string;
  body: string;
};

export const SPORTS_BRIEF_ANGLES: Record<SportsBriefAngleId, SportsBriefAngle> = {
  result: {
    id: "result",
    title: "Résultat",
    intent: "Annoncer le résultat vérifié et son contexte immédiat.",
  },
  performance: {
    id: "performance",
    title: "Performance individuelle",
    intent: "Mettre en avant une statistique individuelle vérifiée.",
  },
  news: {
    id: "news",
    title: "Actualité",
    intent: "Relayer l’information telle que rapportée par la source.",
  },
};

export const isVerifiedBriefFact = (material: ManualEditorialMaterial): boolean =>
  material.verificationStatus === "verified" && material.statementType === "fact";

export const listVerifiedBriefFacts = (
  candidate: SportsWatchBriefCandidate,
): ManualEditorialMaterial[] => candidate.materials.filter(isVerifiedBriefFact);

// Un résultat collectif ne prouve pas une participation individuelle : l’angle
// « Performance individuelle » exige une participation établie et une statistique vérifiée.
export const availableBriefAngles = (
  candidate: SportsWatchBriefCandidate,
): SportsBriefAngle[] => {
  if (listVerifiedBriefFacts(candidate).length === 0) return [];
  const angles: SportsBriefAngle[] = [];
  if (
    candidate.resultKind === "collective_result"
    || candidate.resultKind === "individual_result"
  ) {
    angles.push(SPORTS_BRIEF_ANGLES.result);
  }
  if (candidate.provesIndividualParticipation && candidate.verifiedStatistics.length > 0) {
    angles.push(SPORTS_BRIEF_ANGLES.performance);
  }
  angles.push(SPORTS_BRIEF_ANGLES.news);
  return angles;
};

const dateLabel = (value: string | null): string | null => {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("fr-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
};

const candidateDateLabel = (candidate: SportsWatchBriefCandidate): string | null =>
  dateLabel(candidate.eventDateFrom)
  ?? dateLabel(candidate.publicationDate)
  ?? dateLabel(candidate.collectedAt);

// Les segments non attribués restent des pistes « À vérifier » : ils sont
// systématiquement retirés du texte généré à partir des faits vérifiés.
export const sanitizeVerifiedExcerpt = (excerpt: string): string =>
  excerpt
    .replace(/Propositions statistiques non attribuées\s*:[^.]*\.\s*/gi, "")
    .replace(/Preuves des statistiques dans le document\s*:[^.]*\.\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const statisticsSummary = (statistics: SportsWatchVerifiedStatistic[]): string =>
  statistics
    .map((statistic) => `${statistic.value} ${statistic.label.toLocaleLowerCase("fr")}`)
    .join(", ");

const truncateTitle = (value: string): string =>
  value.length > 140 ? `${value.slice(0, 139).trimEnd()}…` : value;

const resultKindSentence: Record<SportsWatchBriefCandidate["resultKind"], string> = {
  collective_result: "Résultat collectif vérifié",
  individual_result: "Résultat individuel vérifié",
  participation: "Participation vérifiée",
  news_excerpt: "Information vérifiée",
};

export class SportsBriefGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportsBriefGenerationError";
  }
}

export const generateSportsBriefText = (
  candidate: SportsWatchBriefCandidate,
  angleId: SportsBriefAngleId,
): SportsBriefDraftText => {
  const angles = availableBriefAngles(candidate);
  if (!angles.some((angle) => angle.id === angleId)) {
    throw new SportsBriefGenerationError(
      "Cet angle n’est pas disponible pour cette actualité : les faits vérifiés sont insuffisants.",
    );
  }

  const date = candidateDateLabel(candidate);
  const dateSuffix = date ? ` le ${date}` : "";
  const factBody = sanitizeVerifiedExcerpt(candidate.excerpt);
  const sourceLine = `Source : ${candidate.sourceName}${date ? ` — ${date}` : ""}.`;

  if (angleId === "performance") {
    const summary = statisticsSummary(candidate.verifiedStatistics);
    const statsLine = `Statistiques vérifiées : ${
      candidate.verifiedStatistics
        .map((statistic) => `${statistic.label} : ${statistic.value}`)
        .join(" ; ")
    }.`;
    return {
      title: truncateTitle(`${candidate.athleteName} : ${summary}`),
      lead: `Performance vérifiée de ${candidate.athleteName}${dateSuffix} : ${summary}, selon ${candidate.sourceName}.`,
      body: [statsLine, factBody, sourceLine].filter(Boolean).join("\n\n"),
    };
  }

  if (angleId === "result") {
    return {
      title: truncateTitle(candidate.title),
      lead: `${resultKindSentence[candidate.resultKind]}${dateSuffix} pour ${candidate.athleteName}, selon ${candidate.sourceName}.`,
      body: [factBody, sourceLine].filter(Boolean).join("\n\n"),
    };
  }

  return {
    title: truncateTitle(candidate.title),
    lead: `${candidate.sourceName} rapporte${dateSuffix} : ${candidate.title}.`,
    body: [factBody, sourceLine].filter(Boolean).join("\n\n"),
  };
};
