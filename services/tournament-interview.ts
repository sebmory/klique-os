import type { TournamentSituation } from "@/types/content-generation";
import type { ManualEditorialMaterial } from "@/types/context-intelligence";
import type {
  SportsWatchInterviewTournament,
  SportsWatchInterviewTournamentMatch,
  SportsWatchVerificationStatus,
} from "@/types/sports-watch";

const disciplineLabels: Record<SportsWatchInterviewTournamentMatch["discipline"], string> = {
  simple: "Simple",
  double: "Double",
  mixte: "Mixte",
};

const verificationLabels: Record<SportsWatchVerificationStatus, string> = {
  verified: "vérifié",
  unverified: "non vérifié",
  disputed: "contesté",
};

const isOfficialSwissBadmintonSource = (
  tournament: SportsWatchInterviewTournament,
  match: SportsWatchInterviewTournamentMatch,
): boolean => {
  if (
    tournament.tournamentId === null
    || match.sourceName !== "Swiss Badminton / Tournamentsoftware"
  ) {
    return false;
  }

  try {
    const sourceUrl = new URL(match.sourceUrl);
    return sourceUrl.hostname === "sb.tournamentsoftware.com"
      && sourceUrl.searchParams.get("id") === tournament.tournamentId;
  } catch {
    return false;
  }
};

export const resolveTournamentMatchVerificationStatus = (
  tournament: SportsWatchInterviewTournament,
  match: SportsWatchInterviewTournamentMatch,
): SportsWatchVerificationStatus => {
  if (match.verificationStatus !== "unverified") {
    return match.verificationStatus;
  }

  const hasCompleteStructuredResult = Boolean(
    match.tableau.trim()
    && match.eventDate
    && match.opponents.trim()
    && match.athleteScore.trim()
    && match.outcome !== "unknown"
    && (match.discipline === "simple" || match.partner?.trim()),
  );
  return isOfficialSwissBadmintonSource(tournament, match) && hasCompleteStructuredResult
    ? "verified"
    : "unverified";
};

const selectMatches = (
  tournament: SportsWatchInterviewTournament,
  selectedCandidateIds: string[],
): SportsWatchInterviewTournamentMatch[] => {
  const availableIds = new Set(tournament.allCandidateIds);
  const selectedIds = new Set(selectedCandidateIds);
  if (
    selectedIds.size !== selectedCandidateIds.length
    || selectedCandidateIds.some((candidateId) => !availableIds.has(candidateId))
  ) {
    throw new Error("La sélection contient un match qui n’appartient pas à ce tournoi.");
  }

  return tournament.disciplines
    .flatMap((discipline) => discipline.matches)
    .filter((match) => selectedIds.has(match.candidateId));
};

const formatMatch = (
  tournament: SportsWatchInterviewTournament,
  match: SportsWatchInterviewTournamentMatch,
): string => [
  `Tournoi : ${tournament.title}.`,
  `Discipline : ${disciplineLabels[match.discipline]}.`,
  `Tableau : ${match.tableau}.`,
  match.eventDate ? `Date : ${match.eventDate}.` : null,
  match.round ? `Tour : ${match.round}.` : null,
  match.partner ? `Partenaire : ${match.partner}.` : null,
  `Adversaire(s) : ${match.opponents}.`,
  `Résultat : ${match.outcomeLabel}.`,
  `Score du point de vue de l’athlète : ${match.athleteScore}.`,
].filter(Boolean).join(" ");

export const buildTournamentInterviewMaterials = (
  tournament: SportsWatchInterviewTournament,
  selectedCandidateIds: string[],
): ManualEditorialMaterial[] => selectMatches(tournament, selectedCandidateIds)
  .map((match) => {
    const verificationStatus = resolveTournamentMatchVerificationStatus(tournament, match);
    const verified = verificationStatus === "verified";
    return {
      id: `sports-watch-tournament-${match.candidateId}`,
      kind: "note",
      text: formatMatch(tournament, match),
      provenance: `${match.sourceName} · ${disciplineLabels[match.discipline]} · ${verificationLabels[verificationStatus]}`,
      sourceDate: match.eventDate ?? tournament.eventDateTo ?? tournament.eventDateFrom ?? "",
      sourceType: "official",
      verificationStatus: verified ? "verified" : "unverified",
      statementType: verified ? "fact" : "editorial_lead",
      category: "result",
      sourceUrl: match.sourceUrl,
      factKey: `sports-watch:tournament:${tournament.tournamentId ?? tournament.id}:${match.tableau}:${match.candidateId}`,
    };
  });

export const buildTournamentSituation = (
  tournament: SportsWatchInterviewTournament,
  selectedCandidateIds: string[],
): TournamentSituation => {
  if (!tournament.tournamentId) {
    throw new Error("Le tournoi sélectionné ne possède pas d’identifiant officiel.");
  }

  const matches = selectMatches(tournament, selectedCandidateIds).flatMap((match) => {
    const verificationStatus = resolveTournamentMatchVerificationStatus(tournament, match);
    const outcome = match.outcome === "victory" || match.outcome === "defeat"
      ? match.outcome
      : match.outcome === "forfeit" || match.outcome === "retirement"
        ? match.outcomeLabel.startsWith("Victoire") ? "victory" as const : "defeat" as const
        : null;
    return match.eventDate && match.athleteScore && outcome
      ? [{
          candidateId: match.candidateId,
          tournamentId: tournament.tournamentId!,
          tournamentName: tournament.title,
          date: match.eventDate,
          discipline: match.discipline,
          tableau: match.tableau,
          opponents: match.opponents,
          ...(match.partner ? { partner: match.partner } : {}),
          score: match.athleteScore,
          outcome,
          sourceName: match.sourceName,
          sourceUrl: match.sourceUrl,
          verificationStatus: verificationStatus === "disputed"
            ? "unverified" as const
            : verificationStatus,
        }]
      : [];
  });

  return {
    frame: "tournament_review",
    competitionIdentity: tournament.id,
    tournamentId: tournament.tournamentId,
    tournamentName: tournament.title,
    matches,
  };
};
