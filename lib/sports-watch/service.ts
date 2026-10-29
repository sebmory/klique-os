import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import type { SportsWatchCrmAthlete } from "@/lib/google-sheets";
import {
  localAdminFixtureAthletes,
  localIntroductionFixturesEnabled,
} from "@/lib/partner-athlete-introductions/local-fixtures";
import {
  SportsWatchAthleteDirectory,
  sportsWatchAthleteDirectoryErrorMessage,
} from "@/lib/sports-watch/athlete-directory";
import {
  BEBASKET_BASE_URL,
  BEBASKET_SOURCE_NAME,
  collectBeBasketCandidates,
  verifyBeBasketBinding,
} from "@/lib/sports-watch/bebasket-collector";
import {
  BC_BULLE_FEED_URL,
  BC_BULLE_SOURCE_NAME,
  collectBcBulleCandidates,
  type CollectedSportsWatchCandidate,
  type SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";
import {
  IWWF_BASE_URL,
  IWWF_WAKESURF_SOURCE_NAME,
  collectIwwfWakesurfCandidates,
  verifyIwwfProfile,
  type IwwfProfileConfig,
} from "@/lib/sports-watch/iwwf-wakesurf-collector";
import {
  KENPOKAN_FEED_URL,
  KENPOKAN_SOURCE_NAME,
  collectKenpokanCandidates,
} from "@/lib/sports-watch/kenpokan-collector";
import {
  SAFV_BASE_URL,
  SAFV_SOURCE_NAME,
  collectSafvCandidates,
  verifySafvTeam,
  type SafvTeamConfig,
} from "@/lib/sports-watch/safv-collector";
import {
  SWISS_BADMINTON_BASE_URL,
  SWISS_BADMINTON_SOURCE_NAME,
  collectSwissBadmintonCandidates,
  verifySwissBadmintonProfile,
  type SwissBadmintonProfileConfig,
} from "@/lib/sports-watch/swiss-badminton-collector";
import {
  SWISS_BASKETBALL_BASE_URL,
  SWISS_BASKETBALL_DEFAULT_FEDERATION_ID,
  SWISS_BASKETBALL_SOURCE_NAME,
  collectSwissBasketballCandidates,
  verifySwissBasketballBinding,
} from "@/lib/sports-watch/swiss-basketball-collector";
import {
  PostgresSportsWatchRepository,
  type SportsWatchRepository,
} from "@/lib/sports-watch/repository";
import type {
  BeBasketBinding,
  BeBasketBindingVerification,
  BeBasketOfficialIdentity,
  IwwfBinding,
  IwwfIdentityVerification,
  SafvBinding,
  SafvTeamVerification,
  SportsWatchAdminStatus,
  SportsWatchArticlePrefill,
  SportsWatchCandidate,
  SportsWatchCollectionObservation,
  SportsWatchCollectionSourceKey,
  SportsWatchRunResult,
  SwissBasketballBinding,
  SwissBasketballBindingVerification,
  SwissBasketballOfficialIdentity,
  SwissBadmintonBinding,
  SwissBadmintonIdentityVerification,
  SportsWatchPotentialDuplicate,
} from "@/types/sports-watch";
import {
  MANUAL_EDITORIAL_MATERIAL_LIMIT,
  MANUAL_EDITORIAL_TEXT_LIMIT,
  type ManualEditorialMaterial,
} from "@/types/context-intelligence";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const splitEditorialText = (value: string): string[] => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > MANUAL_EDITORIAL_TEXT_LIMIT) {
      throw new SportsWatchError(
        "validation",
        "Le contenu transféré contient un élément indivisible trop long pour le formulaire Article.",
      );
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length <= MANUAL_EDITORIAL_TEXT_LIMIT) {
      current = next;
    } else {
      chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length > MANUAL_EDITORIAL_MATERIAL_LIMIT) {
    throw new SportsWatchError(
      "validation",
      `Le contenu transféré dépasse la limite de ${MANUAL_EDITORIAL_MATERIAL_LIMIT} matières Article.`,
    );
  }
  return chunks;
};
export const buildSportsWatchArticleMaterials = (
  candidate: SportsWatchCandidate,
  provenance: string,
  sourceDate: string,
  text = candidate.excerpt,
): ManualEditorialMaterial[] =>
  splitEditorialText(text).map((chunk, index) => ({
    id: `sports-watch-${candidate.id}-${index + 1}`,
    kind: "note",
    text: chunk,
    provenance,
    sourceDate,
  }));

const normalizeMatchEvidence = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();

const explicitMatchEvidence = (candidate: SportsWatchCandidate): {
  score: string | null;
  tokens: Set<string>;
} | null => {
  const match = candidate.excerpt.match(/\bMatch\s*:\s*([^.]*)\./i)?.[1];
  const participants = candidate.excerpt.match(
    /\bParticipants dans l’ordre du document\s*:\s*([^.]*)\./i,
  )?.[1];
  const importedScore = candidate.excerpt.match(/\bScore tel qu’affiché\s*:\s*([^.]*)\./i)?.[1];
  const evidence = match ?? (participants && importedScore
    ? `${participants} ${importedScore}`
    : null);
  if (!evidence) return null;
  const normalized = normalizeMatchEvidence(evidence);
  const score = normalized.match(/\b\d+\s*-\s*\d+\b/)?.[0].replace(/\s+/g, "") ?? null;
  if (!score) return null;
  const athleteTokens = new Set(normalizeMatchEvidence(candidate.athleteName).split(" "));
  const ignored = new Set(["match", "contre", "versus", "avec", "dans", "ordre", "document"]);
  const tokens = new Set(
    normalized
      .replace(/\b\d+\s*-\s*\d+\b/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !athleteTokens.has(token) && !ignored.has(token)),
  );
  return { score, tokens };
};

const potentialDuplicateReason = (
  left: SportsWatchCandidate,
  right: SportsWatchCandidate,
): string | null => {
  if (left.athleteId !== right.athleteId || left.sourceName === right.sourceName) return null;
  const leftUrl = left.articleUrl.trim().replace(/\/+$/, "").toLocaleLowerCase("fr");
  const rightUrl = right.articleUrl.trim().replace(/\/+$/, "").toLocaleLowerCase("fr");
  if (leftUrl && leftUrl === rightUrl) {
    return "Même URL de résultat fournie par plusieurs sources.";
  }
  if (!left.eventDateFrom || left.eventDateFrom !== right.eventDateFrom) return null;
  const leftEvidence = explicitMatchEvidence(left);
  const rightEvidence = explicitMatchEvidence(right);
  if (!leftEvidence || !rightEvidence || leftEvidence.score !== rightEvidence.score) return null;
  const sharedTokens = [...leftEvidence.tokens].filter((token) => rightEvidence.tokens.has(token));
  return sharedTokens.length >= 2
    ? "Même athlète, même date, même score explicite et participants ou équipes concordants."
    : null;
};

const findPotentialDuplicates = (
  candidates: SportsWatchCandidate[],
): SportsWatchPotentialDuplicate[] => {
  const duplicates: SportsWatchPotentialDuplicate[] = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const reason = potentialDuplicateReason(left, right);
      if (!reason) continue;
      const pair = [left, right].sort((a, b) => a.id.localeCompare(b.id));
      duplicates.push({
        id: pair.map((candidate) => candidate.id).join(":"),
        reason,
        candidates: pair.map((candidate) => ({
          id: candidate.id,
          athleteName: candidate.athleteName,
          sourceName: candidate.sourceName,
          articleUrl: candidate.articleUrl,
          title: candidate.title,
          eventDateFrom: candidate.eventDateFrom,
        })),
      });
    }
  }
  return duplicates;
};

const buildCandidateProvenance = (candidate: SportsWatchCandidate): string => {
  const verificationLabel = candidate.verificationStatus === "verified"
    ? "vérifiée"
    : candidate.verificationStatus === "disputed"
      ? "contestée"
      : "non vérifiée";
  return [
    `${candidate.sourceName} — ${candidate.articleUrl}`,
    `Publication : ${dateLabel(candidate.publicationDate)}`,
    `Événement : ${dateLabel(candidate.eventDateFrom)}${candidate.eventDateTo && candidate.eventDateTo !== candidate.eventDateFrom ? ` au ${dateLabel(candidate.eventDateTo)}` : ""}`,
    `Collecte : ${dateLabel(candidate.collectedAt)}`,
    `Vérification factuelle : ${verificationLabel}`,
  ].join(" · ");
};

const articleResultKindLabel: Record<SportsWatchCandidate["resultKind"], string> = {
  collective_result: "résultat collectif, sans participation individuelle déduite",
  individual_result: "participation individuelle établie",
  news_excerpt: "extrait éditorial attribué, sans performance individuelle déduite",
  participation: "présence ou participation selon les éléments explicites de la source",
};
const sourceDefinitions: Record<SportsWatchCollectionSourceKey, {
  name: string;
  url: string;
  noRecentMessage: string;
}> = {
  "bc-bulle": {
    name: BC_BULLE_SOURCE_NAME,
    url: BC_BULLE_FEED_URL,
    noRecentMessage: "Aucune publication BC Bulle des 30 derniers jours. Aucune archive n’a été remontée.",
  },

  "swiss-badminton": {
    name: SWISS_BADMINTON_SOURCE_NAME,
    url: SWISS_BADMINTON_BASE_URL,
    noRecentMessage: "Aucun résultat Swiss Badminton daté des 30 derniers jours. Aucun résultat ancien n’a été remonté.",
  },
  "iwwf-wakesurf": {
    name: IWWF_WAKESURF_SOURCE_NAME,
    url: IWWF_BASE_URL,
    noRecentMessage: "Aucun résultat IWWF daté des 30 derniers jours. Aucun résultat ancien n’a été remonté.",
  },
  kenpokan: {
    name: KENPOKAN_SOURCE_NAME,
    url: KENPOKAN_FEED_URL,
    noRecentMessage: "Aucune publication Kenpokan Dojo des 30 derniers jours. Aucune archive n’a été remontée.",
  },
  safv: {
    name: SAFV_SOURCE_NAME,
    url: SAFV_BASE_URL,
    noRecentMessage: "Aucun résultat collectif SAFV terminé dans les 30 derniers jours. Aucun match futur ou ancien n’a été remonté.",
  },
  bebasket: {
    name: BEBASKET_SOURCE_NAME,
    url: BEBASKET_BASE_URL,
    noRecentMessage: "Aucun match BeBasket daté des 30 derniers jours n’a été découvert depuis ce calendrier.",
  },
  "swiss-basketball": {
    name: SWISS_BASKETBALL_SOURCE_NAME,
    url: SWISS_BASKETBALL_BASE_URL,
    noRecentMessage: "Aucun match Swiss Basketball terminé dans les 30 derniers jours pour les rattachements actifs.",
  },
};

export type SportsWatchAdminIdentity = {
  workspaceId: string;
  clerkUserId: string;
};

export class SportsWatchError extends Error {
  constructor(
    public readonly code: "forbidden" | "validation" | "not_found" | "conflict" | "source",
    message: string,
  ) {
    super(message);
    this.name = "SportsWatchError";
  }
}

const normalize = (value: unknown): string => String(value ?? "").trim();

const requireUuid = (value: unknown): string => {
  const id = normalize(value);
  if (!UUID_PATTERN.test(id)) throw new SportsWatchError("validation", "Le candidat de veille est invalide.");
  return id;
};

const requireSourceKey = (value: unknown): SportsWatchCollectionSourceKey => {
  const sourceKey = normalize(value);
  if (
    sourceKey !== "bc-bulle"
    && sourceKey !== "swiss-badminton"
    && sourceKey !== "iwwf-wakesurf"
    && sourceKey !== "kenpokan"
    && sourceKey !== "safv"
    && sourceKey !== "bebasket"
    && sourceKey !== "swiss-basketball"
  ) {
    throw new SportsWatchError("validation", "Sélectionnez une source de veille valide.");
  }
  return sourceKey;
};

export const requireSportsWatchAdmin = async (request: Request): Promise<SportsWatchAdminIdentity> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess;
  const identity = {
    workspaceId: normalize(access?.workspaceId),
    clerkUserId: normalize(profile?.clerkUser.id),
  };
  if (!identity.workspaceId || !identity.clerkUserId || access?.role !== "admin" || access.status !== "active") {
    throw new SportsWatchError("forbidden", "Un accès Admin actif est requis.");
  }
  return identity;
};

const resolveSelectedAthlete = (
  athleteIdValue: unknown,
  athletes: readonly SportsWatchCrmAthlete[],
): SportsWatchAthleteSnapshot => {
  const requestedId = normalize(athleteIdValue);
  if (!requestedId) throw new SportsWatchError("validation", "Sélectionnez un athlète CRM.");
  const athlete = athletes.find((item) =>
    normalize(item.key) === requestedId || normalize(item.athleteId) === requestedId);
  if (!athlete) throw new SportsWatchError("not_found", "L’athlète CRM sélectionné est introuvable.");
  const id = normalize(athlete.athleteId) || normalize(athlete.key);
  if (!id || !normalize(athlete.name)) {
    throw new SportsWatchError("validation", "La fiche Athlète ne possède pas d’identité exploitable.");
  }
  return {
    id,
    name: normalize(athlete.name),
    sport: normalize(athlete.sport),
    club: normalize(athlete.club),
  };
};

type SportsWatchCollector = (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    lookbackDays: number;
    dependencies: { now: () => Date };
    swissProfile?: SwissBadmintonProfileConfig;
    iwwfProfile?: IwwfProfileConfig;
    safvTeam?: SafvTeamConfig;
    beBasketIdentity?: BeBasketOfficialIdentity;
    swissBasketballIdentity?: SwissBasketballOfficialIdentity;
  },
) => Promise<{
  candidates: CollectedSportsWatchCandidate[];
  scannedCount: number;
  recentCount: number;
  observations?: SportsWatchCollectionObservation[];
}>;

type SportsWatchServiceDependencies = {
  repository: SportsWatchRepository;
  getAthletes: (identity: SportsWatchAdminIdentity) => Promise<SportsWatchCrmAthlete[]>;
  collectors: Record<SportsWatchCollectionSourceKey, SportsWatchCollector>;
  verifySwissProfile: typeof verifySwissBadmintonProfile;
  verifyIwwfProfile: typeof verifyIwwfProfile;
  verifySafvTeam: typeof verifySafvTeam;
  verifyBeBasketBinding: typeof verifyBeBasketBinding;
  verifySwissBasketballBinding: typeof verifySwissBasketballBinding;
  now: () => Date;
};

const defaultDependencies: SportsWatchServiceDependencies = {
  repository: PostgresSportsWatchRepository,
  getAthletes: (identity) => localIntroductionFixturesEnabled()
    ? Promise.resolve(localAdminFixtureAthletes())
    : SportsWatchAthleteDirectory.resolve({
        ...identity,
        accessRole: "admin",
        accessStatus: "active",
      }),
  collectors: {
    "bc-bulle": collectBcBulleCandidates,
    "swiss-badminton": (athlete, options) =>
      collectSwissBadmintonCandidates(athlete, {
        lookbackDays: options.lookbackDays,
        dependencies: options.dependencies,
        profile: options.swissProfile,
      }),
    "iwwf-wakesurf": (athlete, options) =>
      collectIwwfWakesurfCandidates(athlete, {
        lookbackDays: options.lookbackDays,
        dependencies: options.dependencies,
        profile: options.iwwfProfile,
      }),
    kenpokan: collectKenpokanCandidates,
    safv: (athlete, options) =>
      collectSafvCandidates(athlete, {
        lookbackDays: options.lookbackDays,
        dependencies: options.dependencies,
        team: options.safvTeam,
      }),
    bebasket: (athlete, options) =>
      collectBeBasketCandidates(athlete, {
        lookbackDays: options.lookbackDays,
        dependencies: options.dependencies,
        identity: options.beBasketIdentity,
      }),
    "swiss-basketball": (athlete, options) =>
      collectSwissBasketballCandidates(athlete, {
        lookbackDays: options.lookbackDays,
        dependencies: options.dependencies,
        identity: options.swissBasketballIdentity,
      }),
  },
  verifySwissProfile: verifySwissBadmintonProfile,
  verifyIwwfProfile,
  verifySafvTeam,
  verifyBeBasketBinding,
  verifySwissBasketballBinding,
  now: () => new Date(),
};

const runMessage = (
  sourceKey: SportsWatchCollectionSourceKey,
  recentCount: number,
  createdCount: number,
  candidateCount: number,
  observations: SportsWatchCollectionObservation[] = [],
): string => {
  if (recentCount === 0 && sourceKey !== "swiss-basketball") {
    return sourceDefinitions[sourceKey].noRecentMessage;
  }
  if (sourceKey === "bebasket" && observations.length > 0) {
    const count = (status: SportsWatchCollectionObservation["status"]) =>
      observations.filter((observation) => observation.status === status).length;
    const ambiguousWarnings = observations
      .filter((observation) => observation.status === "team_ambiguous")
      .map((observation) => observation.warning ?? `Feuille ambiguë : ${observation.matchUrl}`);
    return [
      `${observations.length} match${observations.length === 1 ? "" : "es"} récent${observations.length === 1 ? "" : "s"} examiné${observations.length === 1 ? "" : "s"}.`,
      `Feuille absente : ${count("sheet_absent")}.`,
      `Joueuse absente : ${count("player_absent")}.`,
      `Joueuse listée sans participation établie : ${count("player_listed_without_participation")}.`,
      `Participation explicite : ${count("participation_explicit")}.`,
      `Feuille ambiguë écartée : ${count("team_ambiguous")}.`,
      ...ambiguousWarnings,
      createdCount === 0
        ? "Aucun nouveau candidat : les participations étaient absentes ou déjà collectées sans modification."
        : `${createdCount} nouveau${createdCount === 1 ? "" : "x"} candidat${createdCount === 1 ? "" : "s"} soumis à la revue Admin.`,
    ].join(" ");
  }
  if (sourceKey === "swiss-basketball") {
    const partialFailures = observations
      .filter((observation) => observation.status === "binding_error")
      .map((observation) => observation.warning ?? observation.matchUrl);
    const participationCount = observations.filter((observation) =>
      observation.status === "participation_explicit").length;
    const listedCount = observations.filter((observation) =>
      observation.status === "player_listed_without_participation").length;
    const absentCount = observations.filter((observation) =>
      observation.status === "player_absent").length;
    return [
      `${recentCount} match${recentCount === 1 ? "" : "es"} terminé${recentCount === 1 ? "" : "s"} examiné${recentCount === 1 ? "" : "s"}.`,
      `Participation établie : ${participationCount}.`,
      `Présence sans participation établie : ${listedCount}.`,
      `Joueuse absente de la feuille : ${absentCount}.`,
      partialFailures.length > 0
        ? `Couverture partielle : ${partialFailures.length} rattachement${partialFailures.length === 1 ? "" : "s"} en échec. ${partialFailures.join(" ")}`
        : "Tous les rattachements actifs ont été lus.",
      createdCount === 0
        ? "Aucun nouveau candidat."
        : `${createdCount} nouveau${createdCount === 1 ? "" : "x"} candidat${createdCount === 1 ? "" : "s"} soumis à la revue Admin.`,
    ].join(" ");
  }
  if (candidateCount === 0) {
    return "Aucune publication récente ne peut être attribuée à cet athlète avec les éléments disponibles.";
  }
  if (createdCount === 0) {
    return "Les publications attribuables avaient déjà été collectées sans modification.";
  }
  return `${createdCount} nouveau${createdCount === 1 ? "" : "x"} candidat${createdCount === 1 ? "" : "s"} ajouté${createdCount === 1 ? "" : "s"}.`;
};

const dateLabel = (value: string | null): string => value?.slice(0, 10) ?? "inconnue";

const isPostgresUniqueViolation = (error: unknown): boolean =>
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: unknown }).code === "23505";

export const createSportsWatchService = (
  overrides: Partial<Omit<SportsWatchServiceDependencies, "collectors">> & {
    collectors?: Partial<SportsWatchServiceDependencies["collectors"]>;
  } = {},
) => {
  const dependencies: SportsWatchServiceDependencies = {
    ...defaultDependencies,
    ...overrides,
    collectors: {
      ...defaultDependencies.collectors,
      ...overrides.collectors,
    },
  };
  const resolveAuthoritativeAthlete = async (
    athleteId: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchAthleteSnapshot> => {
    try {
      return resolveSelectedAthlete(athleteId, await dependencies.getAthletes(identity));
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      console.error("[sports_watch] Impossible de résoudre le registre CRM des athlètes.", {
        workspaceId: identity.workspaceId,
        clerkUserId: identity.clerkUserId,
        error,
      });
      throw new SportsWatchError("source", sportsWatchAthleteDirectoryErrorMessage(error));
    }
  };
  const verifySwissBinding = async (
    athleteId: unknown,
    profileUrl: unknown,
    playerId: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SwissBadmintonIdentityVerification> => {
    const athlete = await resolveAuthoritativeAthlete(athleteId, identity);
    const url = normalize(profileUrl);
    if (!url) throw new SportsWatchError("validation", "Saisissez l’URL du profil officiel.");
    try {
      return await dependencies.verifySwissProfile(athlete, {
        profileUrl: url,
        playerId: normalize(playerId) || undefined,
        dependencies: { now: dependencies.now },
      });
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      throw new SportsWatchError(
        "source",
        error instanceof Error ? error.message : "La vérification du profil officiel a échoué.",
      );
    }
  };
  const verifyIwwfBinding = async (
    athleteId: unknown,
    profileUrl: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<IwwfIdentityVerification> => {
    const athlete = await resolveAuthoritativeAthlete(athleteId, identity);
    const url = normalize(profileUrl);
    if (!url) throw new SportsWatchError("validation", "Saisissez l’URL du profil IWWF officiel.");
    try {
      return await dependencies.verifyIwwfProfile(athlete, {
        profileUrl: url,
        dependencies: { now: dependencies.now },
      });
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      throw new SportsWatchError(
        "source",
        error instanceof Error ? error.message : "La vérification du profil IWWF a échoué.",
      );
    }
  };
  const verifySafvBinding = async (
    athleteId: unknown,
    scheduleUrl: unknown,
    teamName: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SafvTeamVerification> => {
    const athlete = await resolveAuthoritativeAthlete(athleteId, identity);
    const url = normalize(scheduleUrl);
    const officialTeamName = normalize(teamName);
    if (!url) throw new SportsWatchError("validation", "Saisissez l’URL du calendrier SAFV.");
    if (!officialTeamName) throw new SportsWatchError("validation", "Saisissez le nom officiel de l’équipe.");
    try {
      return await dependencies.verifySafvTeam(athlete, {
        scheduleUrl: url,
        teamName: officialTeamName,
        dependencies: { now: dependencies.now },
      });
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      throw new SportsWatchError(
        "source",
        error instanceof Error ? error.message : "La vérification de l’équipe SAFV a échoué.",
      );
    }
  };
  const verifyConfiguredBeBasketBinding = async (
    athleteId: unknown,
    calendarUrl: unknown,
    teamName: unknown,
    playerName: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<BeBasketBindingVerification> => {
    const athlete = await resolveAuthoritativeAthlete(athleteId, identity);
    const url = normalize(calendarUrl);
    const team = normalize(teamName);
    const player = normalize(playerName);
    if (!url) throw new SportsWatchError("validation", "Saisissez l’URL du calendrier BeBasket.");
    if (!team) throw new SportsWatchError("validation", "Saisissez le nom de l’équipe BeBasket.");
    if (!player) throw new SportsWatchError("validation", "Saisissez le nom complet de la joueuse.");
    try {
      return await dependencies.verifyBeBasketBinding(athlete, {
        calendarUrl: url,
        teamName: team,
        playerName: player,
        dependencies: { now: dependencies.now },
      });
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      throw new SportsWatchError(
        "source",
        error instanceof Error ? error.message : "La vérification du rattachement BeBasket a échoué.",
      );
    }
  };
  const verifyConfiguredSwissBasketballBinding = async (
    athleteId: unknown,
    seasonId: unknown,
    leagueId: unknown,
    teamId: unknown,
    officialPlayerId: unknown,
    officialPlayerName: unknown,
    identity: SportsWatchAdminIdentity,
    federationId: unknown = SWISS_BASKETBALL_DEFAULT_FEDERATION_ID,
  ): Promise<SwissBasketballBindingVerification> => {
    const athlete = await resolveAuthoritativeAthlete(athleteId, identity);
    const federation = normalize(federationId) || SWISS_BASKETBALL_DEFAULT_FEDERATION_ID;
    const season = normalize(seasonId);
    const league = normalize(leagueId);
    const team = normalize(teamId);
    const playerId = normalize(officialPlayerId);
    const playerName = normalize(officialPlayerName);
    if (!season || !league || !team || !playerId || !playerName) {
      throw new SportsWatchError(
        "validation",
        "Saisissez les identifiants officiels de saison, ligue, équipe et joueur, ainsi que le nom officiel.",
      );
    }
    try {
      return await dependencies.verifySwissBasketballBinding(athlete, {
        federationId: federation,
        seasonId: season,
        leagueId: league,
        teamId: team,
        officialPlayerId: playerId,
        officialPlayerName: playerName,
        dependencies: { now: dependencies.now },
      });
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      throw new SportsWatchError(
        "source",
        error instanceof Error ? error.message : "La vérification Swiss Basketball a échoué.",
      );
    }
  };
  return {
  async list(identity: SportsWatchAdminIdentity): Promise<SportsWatchCandidate[]> {
    return dependencies.repository.listCandidates(identity.workspaceId);
  },

  async listSwissBindings(identity: SportsWatchAdminIdentity): Promise<SwissBadmintonBinding[]> {
    return dependencies.repository.listSwissBindings(identity.workspaceId);
  },

  async listIwwfBindings(identity: SportsWatchAdminIdentity): Promise<IwwfBinding[]> {
    return dependencies.repository.listIwwfBindings(identity.workspaceId);
  },

  async listSafvBindings(identity: SportsWatchAdminIdentity): Promise<SafvBinding[]> {
    return dependencies.repository.listSafvBindings(identity.workspaceId);
  },

  async listBeBasketBindings(identity: SportsWatchAdminIdentity): Promise<BeBasketBinding[]> {
    return dependencies.repository.listBeBasketBindings(identity.workspaceId);
  },

  async listSwissBasketballBindings(
    identity: SportsWatchAdminIdentity,
  ): Promise<SwissBasketballBinding[]> {
    return dependencies.repository.listSwissBasketballBindings(identity.workspaceId);
  },

  verifySwissBinding,
  verifyIwwfBinding,
  verifySafvBinding,
  verifyBeBasketBinding: verifyConfiguredBeBasketBinding,
  verifySwissBasketballBinding: verifyConfiguredSwissBasketballBinding,

  async confirmSwissBinding(
    athleteId: unknown,
    profileUrl: unknown,
    playerId: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SwissBadmintonBinding> {
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const verification = await verifySwissBinding(
      athleteId,
      profileUrl,
      playerId,
      identity,
    );
    try {
      const binding = await dependencies.repository.saveSwissBinding({
        workspaceId: identity.workspaceId,
        verification,
        expectedVersion,
        clerkUserId: identity.clerkUserId,
        confirmedAt: dependencies.now().toISOString(),
      });
      if (!binding) {
        throw new SportsWatchError(
          "conflict",
          "Le rattachement a été modifié. Rechargez sa configuration avant de confirmer.",
        );
      }
      return binding;
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      if (isPostgresUniqueViolation(error)) {
        throw new SportsWatchError(
          "conflict",
          "Ce profil ou cet identifiant joueur est déjà rattaché à un autre athlète actif de cet espace.",
        );
      }
      throw error;
    }
  },

  async disableSwissBinding(
    athleteId: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SwissBadmintonBinding> {
    const selectedAthleteId = normalize(athleteId);
    if (!selectedAthleteId) {
      throw new SportsWatchError("validation", "Le rattachement Swiss Badminton est invalide.");
    }
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const binding = await dependencies.repository.disableSwissBinding({
      workspaceId: identity.workspaceId,
      athleteId: selectedAthleteId,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié, désactivé ou n’est pas accessible dans cet espace.",
      );
    }
    return binding;
  },

  async confirmIwwfBinding(
    athleteId: unknown,
    profileUrl: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<IwwfBinding> {
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const verification = await verifyIwwfBinding(athleteId, profileUrl, identity);
    try {
      const binding = await dependencies.repository.saveIwwfBinding({
        workspaceId: identity.workspaceId,
        verification,
        expectedVersion,
        clerkUserId: identity.clerkUserId,
        confirmedAt: dependencies.now().toISOString(),
      });
      if (!binding) {
        throw new SportsWatchError(
          "conflict",
          "Le rattachement a été modifié. Rechargez sa configuration avant de confirmer.",
        );
      }
      return binding;
    } catch (error) {
      if (error instanceof SportsWatchError) throw error;
      if (isPostgresUniqueViolation(error)) {
        throw new SportsWatchError(
          "conflict",
          "Ce profil ou cet identifiant IWWF est déjà rattaché à un autre athlète actif de cet espace.",
        );
      }
      throw error;
    }
  },

  async disableIwwfBinding(
    athleteId: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<IwwfBinding> {
    const selectedAthleteId = normalize(athleteId);
    if (!selectedAthleteId) {
      throw new SportsWatchError("validation", "Le rattachement IWWF est invalide.");
    }
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const binding = await dependencies.repository.disableIwwfBinding({
      workspaceId: identity.workspaceId,
      athleteId: selectedAthleteId,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié, désactivé ou n’est pas accessible dans cet espace.",
      );
    }
    return binding;
  },

  async confirmSafvBinding(
    athleteId: unknown,
    scheduleUrl: unknown,
    teamName: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SafvBinding> {
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const verification = await verifySafvBinding(
      athleteId,
      scheduleUrl,
      teamName,
      identity,
    );
    const binding = await dependencies.repository.saveSafvBinding({
      workspaceId: identity.workspaceId,
      verification,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
      confirmedAt: dependencies.now().toISOString(),
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié. Rechargez sa configuration avant de confirmer.",
      );
    }
    return binding;
  },

  async disableSafvBinding(
    athleteId: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SafvBinding> {
    const selectedAthleteId = normalize(athleteId);
    if (!selectedAthleteId) {
      throw new SportsWatchError("validation", "Le rattachement SAFV est invalide.");
    }
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const binding = await dependencies.repository.disableSafvBinding({
      workspaceId: identity.workspaceId,
      athleteId: selectedAthleteId,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié, désactivé ou n’est pas accessible dans cet espace.",
      );
    }
    return binding;
  },

  async confirmBeBasketBinding(
    athleteId: unknown,
    calendarUrl: unknown,
    teamName: unknown,
    playerName: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<BeBasketBinding> {
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const verification = await verifyConfiguredBeBasketBinding(
      athleteId,
      calendarUrl,
      teamName,
      playerName,
      identity,
    );
    const binding = await dependencies.repository.saveBeBasketBinding({
      workspaceId: identity.workspaceId,
      verification,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
      confirmedAt: dependencies.now().toISOString(),
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié. Rechargez sa configuration avant de confirmer.",
      );
    }
    return binding;
  },

  async disableBeBasketBinding(
    athleteId: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<BeBasketBinding> {
    const selectedAthleteId = normalize(athleteId);
    if (!selectedAthleteId) {
      throw new SportsWatchError("validation", "Le rattachement BeBasket est invalide.");
    }
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const binding = await dependencies.repository.disableBeBasketBinding({
      workspaceId: identity.workspaceId,
      athleteId: selectedAthleteId,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié, désactivé ou n’est pas accessible dans cet espace.",
      );
    }
    return binding;
  },

  async confirmSwissBasketballBinding(
    athleteId: unknown,
    seasonId: unknown,
    leagueId: unknown,
    teamId: unknown,
    officialPlayerId: unknown,
    officialPlayerName: unknown,
    identityMatchConfirmed: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
    federationId: unknown = SWISS_BASKETBALL_DEFAULT_FEDERATION_ID,
  ): Promise<SwissBasketballBinding> {
    if (identityMatchConfirmed !== true) {
      throw new SportsWatchError(
        "validation",
        "Confirmez explicitement que l’identité CRM et l’identité officielle désignent la même personne.",
      );
    }
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const verification = await verifyConfiguredSwissBasketballBinding(
      athleteId,
      seasonId,
      leagueId,
      teamId,
      officialPlayerId,
      officialPlayerName,
      identity,
      federationId,
    );
    const confirmedVerification: SwissBasketballBindingVerification = {
      ...verification,
      evidence: [
        ...verification.evidence,
        `Correspondance explicitement confirmée par l’Admin : identité CRM ${verification.athlete.name} ↔ identité officielle ${verification.officialIdentity.playerName}, joueur ${verification.officialIdentity.playerId}.`,
      ],
    };
    const binding = await dependencies.repository.saveSwissBasketballBinding({
      workspaceId: identity.workspaceId,
      verification: confirmedVerification,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
      confirmedAt: dependencies.now().toISOString(),
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié. Rechargez sa configuration avant de confirmer.",
      );
    }
    return binding;
  },

  async disableSwissBasketballBinding(
    bindingIdValue: unknown,
    expectedVersionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SwissBasketballBinding> {
    const bindingId = requireUuid(bindingIdValue);
    const expectedVersion = Number(expectedVersionValue);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new SportsWatchError("validation", "La version du rattachement est invalide.");
    }
    const binding = await dependencies.repository.disableSwissBasketballBinding({
      workspaceId: identity.workspaceId,
      bindingId,
      expectedVersion,
      clerkUserId: identity.clerkUserId,
    });
    if (!binding) {
      throw new SportsWatchError(
        "conflict",
        "Le rattachement a été modifié, désactivé ou n’est pas accessible dans cet espace.",
      );
    }
    return binding;
  },

  async run(
    sourceKeyValue: unknown,
    athleteId: unknown,
    identity: SportsWatchAdminIdentity,
    options: {
      preparedAthlete?: SportsWatchAthleteSnapshot;
      refreshBatchId?: string;
    } = {},
  ): Promise<SportsWatchRunResult> {
    const sourceKey = requireSourceKey(sourceKeyValue);
    const source = sourceDefinitions[sourceKey];
    const athlete = options.preparedAthlete
      ?? await resolveAuthoritativeAthlete(athleteId, identity);
    if (normalize(athleteId) !== athlete.id) {
      throw new SportsWatchError("validation", "L’athlète préparé ne correspond pas à la tâche.");
    }
    const swissBinding = sourceKey === "swiss-badminton"
      ? await dependencies.repository.getActiveSwissBinding(identity.workspaceId, athlete.id)
      : null;
    const iwwfBinding = sourceKey === "iwwf-wakesurf"
      ? await dependencies.repository.getActiveIwwfBinding(identity.workspaceId, athlete.id)
      : null;
    const safvBinding = sourceKey === "safv"
      ? await dependencies.repository.getActiveSafvBinding(identity.workspaceId, athlete.id)
      : null;
    const beBasketBinding = sourceKey === "bebasket"
      ? await dependencies.repository.getActiveBeBasketBinding(identity.workspaceId, athlete.id)
      : null;
    const swissBasketballBindings = sourceKey === "swiss-basketball"
      ? await dependencies.repository.getActiveSwissBasketballBindings(
        identity.workspaceId,
        athlete.id,
      )
      : [];
    if (sourceKey === "swiss-badminton" && !swissBinding) {
      throw new SportsWatchError(
        "validation",
        "Configurez et confirmez le profil Swiss Badminton de cet athlète avant de lancer la veille.",
      );
    }
    if (sourceKey === "iwwf-wakesurf" && !iwwfBinding) {
      throw new SportsWatchError(
        "validation",
        "Configurez et confirmez le profil IWWF de cet athlète avant de lancer la veille.",
      );
    }
    if (sourceKey === "safv" && !safvBinding) {
      throw new SportsWatchError(
        "validation",
        "Configurez et confirmez l’équipe SAFV de cet athlète avant de lancer la veille.",
      );
    }
    if (sourceKey === "bebasket" && !beBasketBinding) {
      throw new SportsWatchError(
        "validation",
        "Configurez et confirmez l’équipe et la joueuse BeBasket avant de lancer la veille.",
      );
    }
    if (sourceKey === "swiss-basketball" && swissBasketballBindings.length === 0) {
      throw new SportsWatchError(
        "validation",
        "Configurez et confirmez au moins une équipe Swiss Basketball avant de lancer la veille.",
      );
    }
    if (swissBasketballBindings.length > 8) {
      throw new SportsWatchError(
        "validation",
        "La collecte Swiss Basketball est limitée à 8 rattachements actifs par athlète.",
      );
    }
    const now = dependencies.now().toISOString();
    const runId = await dependencies.repository.startRun({
      workspaceId: identity.workspaceId,
      sourceKey,
      athleteId: athlete.id,
      athleteName: athlete.name,
      clerkUserId: identity.clerkUserId,
      now,
      refreshBatchId: options.refreshBatchId,
    });
    if (!runId) {
      throw new SportsWatchError("conflict", `Une collecte ${source.name} est déjà en cours pour cet espace.`);
    }

    try {
      const collection = sourceKey === "swiss-basketball"
        ? await (async () => {
            const candidates: CollectedSportsWatchCandidate[] = [];
            const observations: SportsWatchCollectionObservation[] = [];
            let scannedCount = 0;
            let recentCount = 0;
            let successfulBindings = 0;
            for (const binding of swissBasketballBindings) {
              try {
                const result = await dependencies.collectors["swiss-basketball"](athlete, {
                  lookbackDays: 30,
                  dependencies: { now: dependencies.now },
                  swissBasketballIdentity: binding.officialIdentity,
                });
                successfulBindings += 1;
                scannedCount += result.scannedCount;
                recentCount += result.recentCount;
                candidates.push(...result.candidates);
                observations.push(...(result.observations ?? []));
              } catch (error) {
                observations.push({
                  matchUrl: binding.officialIdentity.scheduleUrl,
                  title: `${binding.officialIdentity.teamName} · ${binding.officialIdentity.leagueName}`,
                  eventDate: dependencies.now().toISOString().slice(0, 10),
                  status: "binding_error",
                  warning: `${binding.officialIdentity.teamName} · ${binding.officialIdentity.leagueName} : ${error instanceof Error ? error.message : "collecte indisponible"}.`,
                });
              }
            }
            if (successfulBindings === 0) {
              throw new SportsWatchError(
                "source",
                observations.map((observation) => observation.warning).filter(Boolean).join(" "),
              );
            }
            const uniqueCandidates = [...new Map(candidates.map((candidate) => [
              `${candidate.logicalKey}|${candidate.contentHash}`,
              candidate,
            ])).values()];
            return {
              candidates: uniqueCandidates,
              observations,
              scannedCount,
              recentCount,
            };
          })()
        : await dependencies.collectors[sourceKey](athlete, {
            lookbackDays: 30,
            dependencies: { now: dependencies.now },
            swissProfile: swissBinding?.officialIdentity,
            iwwfProfile: iwwfBinding?.officialIdentity,
            safvTeam: safvBinding?.officialTeam,
            beBasketIdentity: beBasketBinding?.officialIdentity,
          });
      const createdCount = await dependencies.repository.saveCandidates(
        identity.workspaceId,
        collection.candidates,
      );
      const message = runMessage(
        sourceKey,
        collection.recentCount,
        createdCount,
        collection.candidates.length,
        collection.observations,
      );
      await dependencies.repository.completeRun({
        workspaceId: identity.workspaceId,
        runId,
        scannedCount: collection.scannedCount,
        recentCount: collection.recentCount,
        createdCount,
        message,
      });
      return {
        sourceName: source.name,
        sourceUrl: swissBinding?.officialIdentity.profileUrl
          ?? iwwfBinding?.officialIdentity.profileUrl
          ?? safvBinding?.officialTeam.scheduleUrl
          ?? beBasketBinding?.officialIdentity.calendarUrl
          ?? swissBasketballBindings[0]?.officialIdentity.scheduleUrl
          ?? source.url,
        message,
        scannedCount: collection.scannedCount,
        recentCount: collection.recentCount,
        createdCount,
        observations: collection.observations,
        candidates: await dependencies.repository.listCandidates(identity.workspaceId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `La collecte ${source.name} a échoué.`;
      await dependencies.repository.failRun({ workspaceId: identity.workspaceId, runId, message });
      if (error instanceof SportsWatchError) throw error;
      throw new SportsWatchError("source", message);
    }
  },

  async review(
    candidateIdValue: unknown,
    statusValue: unknown,
    versionValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchCandidate> {
    const candidateId = requireUuid(candidateIdValue);
    const status = normalize(statusValue) as SportsWatchAdminStatus;
    const version = Number(versionValue);
    if (
      !["validated", "exploited", "rejected"].includes(status)
      || !Number.isInteger(version)
      || version < 1
    ) {
      throw new SportsWatchError("validation", "Décision ou version invalide.");
    }
    const current = await dependencies.repository.getCandidate(
      identity.workspaceId,
      candidateId,
    );
    if (!current) {
      throw new SportsWatchError(
        "not_found",
        "Candidat introuvable dans cet espace.",
      );
    }
    if (status === "validated") {
      if (current.attributionStatus === "ambiguous") {
        throw new SportsWatchError(
          "validation",
          "L’attribution de ce candidat est ambiguë. La validation éditoriale est bloquée.",
        );
      }
    }
    if (status === "exploited" && current.adminStatus !== "validated") {
      throw new SportsWatchError(
        "validation",
        "Seul un résultat validé éditorialement peut être marqué comme exploité.",
      );
    }
    if (
      status === "validated"
      && !["pending", "rejected", "exploited"].includes(current.adminStatus)
    ) {
      throw new SportsWatchError("validation", "Cette transition éditoriale n’est pas autorisée.");
    }
    const candidate = await dependencies.repository.reviewCandidate({
      workspaceId: identity.workspaceId,
      candidateId,
      status: status as Exclude<SportsWatchAdminStatus, "pending">,
      expectedVersion: version,
      clerkUserId: identity.clerkUserId,
    });
    if (!candidate) {
      throw new SportsWatchError("conflict", "Le candidat a été modifié ou n’est pas accessible dans cet espace.");
    }
    return candidate;
  },

  async buildArticlePrefill(
    candidateIdValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchArticlePrefill> {
    const candidateId = requireUuid(candidateIdValue);
    const candidate = await dependencies.repository.getValidatedCandidate(
      identity.workspaceId,
      candidateId,
    );
    if (!candidate) {
      throw new SportsWatchError("not_found", "Candidat validé introuvable dans cet espace.");
    }
    const sourceDate = candidate.eventDateFrom
      ?? candidate.publicationDate?.slice(0, 10)
      ?? candidate.collectedAt.slice(0, 10);
    return {
      candidateId: candidate.id,
      candidateIds: [candidate.id],
      athleteId: candidate.athleteId,
      athleteIds: [candidate.athleteId],
      verificationStatus: candidate.verificationStatus,
      materials: buildSportsWatchArticleMaterials(
        candidate,
        buildCandidateProvenance(candidate),
        sourceDate,
      ),
      potentialDuplicates: [],
    };
  },

  async buildArticlePrefillFromSelection(
    candidateIdsValue: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchArticlePrefill> {
    if (!Array.isArray(candidateIdsValue) || candidateIdsValue.length === 0) {
      throw new SportsWatchError("validation", "Sélectionnez au moins un résultat validé.");
    }
    if (candidateIdsValue.length > MANUAL_EDITORIAL_MATERIAL_LIMIT) {
      throw new SportsWatchError(
        "validation",
        `La sélection dépasse la capacité maximale de ${MANUAL_EDITORIAL_MATERIAL_LIMIT} matières Article.`,
      );
    }
    const candidateIds = candidateIdsValue.map(requireUuid);
    if (new Set(candidateIds).size !== candidateIds.length) {
      throw new SportsWatchError("validation", "La sélection contient un résultat en double.");
    }
    const candidates = await dependencies.repository.getArticleCandidates(
      identity.workspaceId,
      candidateIds,
    );
    if (
      candidates.length !== candidateIds.length
      || candidates.some((candidate, index) => candidate.id !== candidateIds[index])
    ) {
      throw new SportsWatchError(
        "conflict",
        "Un résultat appartient à un autre espace, a été remplacé ou n’est plus éligible. Actualisez la veille et réduisez la sélection.",
      );
    }
    const multipleCandidates = candidates.length > 1;
    const materials = candidates.flatMap((candidate) => {
      const sourceDate = candidate.eventDateFrom
        ?? candidate.publicationDate?.slice(0, 10)
        ?? candidate.collectedAt.slice(0, 10);
      const text = multipleCandidates
        ? [
            `Athlète : ${candidate.athleteName}.`,
            `Statut factuel : ${articleResultKindLabel[candidate.resultKind]}.`,
            `Résultat : ${candidate.title}.`,
            candidate.excerpt,
          ].join(" ")
        : candidate.excerpt;
      return buildSportsWatchArticleMaterials(
        candidate,
        buildCandidateProvenance(candidate),
        sourceDate,
        text,
      );
    });
    if (materials.length > MANUAL_EDITORIAL_MATERIAL_LIMIT) {
      throw new SportsWatchError(
        "validation",
        `La sélection exige ${materials.length} matières, au-delà de la limite de ${MANUAL_EDITORIAL_MATERIAL_LIMIT}. Réduisez la sélection avant le transfert.`,
      );
    }
    const athleteIds = [...new Set(candidates.map((candidate) => candidate.athleteId))];
    const verificationStatus = candidates.some((candidate) =>
      candidate.verificationStatus === "disputed")
      ? "disputed"
      : candidates.every((candidate) => candidate.verificationStatus === "verified")
        ? "verified"
        : "unverified";
    return {
      candidateId: candidates[0].id,
      candidateIds,
      athleteId: athleteIds.length === 1 ? athleteIds[0] : null,
      athleteIds,
      verificationStatus,
      materials,
      potentialDuplicates: findPotentialDuplicates(candidates),
    };
  },
  };
};

export const SportsWatchService = createSportsWatchService();

export const sportsWatchErrorStatus = (error: unknown): number => {
  if (!(error instanceof SportsWatchError)) return 500;
  if (error.code === "forbidden") return 403;
  if (error.code === "not_found") return 404;
  if (error.code === "conflict") return 409;
  if (error.code === "source") return 502;
  return 400;
};
