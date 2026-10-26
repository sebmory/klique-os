import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import {
  localAdminFixtureAthletes,
  localIntroductionFixturesEnabled,
} from "@/lib/partner-athlete-introductions/local-fixtures";
import {
  BC_BULLE_FEED_URL,
  BC_BULLE_SOURCE_NAME,
  collectBcBulleCandidates,
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
  PostgresSportsWatchRepository,
  type SportsWatchRepository,
} from "@/lib/sports-watch/repository";
import type {
  IwwfBinding,
  IwwfIdentityVerification,
  SafvBinding,
  SafvTeamVerification,
  SportsWatchAdminStatus,
  SportsWatchArticlePrefill,
  SportsWatchCandidate,
  SportsWatchCollectionSourceKey,
  SportsWatchRunResult,
  SwissBadmintonBinding,
  SwissBadmintonIdentityVerification,
} from "@/types/sports-watch";
import type { Athlete } from "@/types/athlete";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  athletes: readonly Athlete[],
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
  },
) => ReturnType<typeof collectBcBulleCandidates>;

type SportsWatchServiceDependencies = {
  repository: SportsWatchRepository;
  getAthletes: () => Promise<Athlete[]>;
  collectors: Record<SportsWatchCollectionSourceKey, SportsWatchCollector>;
  verifySwissProfile: typeof verifySwissBadmintonProfile;
  verifyIwwfProfile: typeof verifyIwwfProfile;
  verifySafvTeam: typeof verifySafvTeam;
  now: () => Date;
};

const defaultDependencies: SportsWatchServiceDependencies = {
  repository: PostgresSportsWatchRepository,
  getAthletes: () => localIntroductionFixturesEnabled()
    ? Promise.resolve(localAdminFixtureAthletes())
    : getAthletesFromGoogleSheets(),
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
  },
  verifySwissProfile: verifySwissBadmintonProfile,
  verifyIwwfProfile,
  verifySafvTeam,
  now: () => new Date(),
};

const runMessage = (
  sourceKey: SportsWatchCollectionSourceKey,
  recentCount: number,
  createdCount: number,
  candidateCount: number,
): string => {
  if (recentCount === 0) {
    return sourceDefinitions[sourceKey].noRecentMessage;
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
  const verifySwissBinding = async (
    athleteId: unknown,
    profileUrl: unknown,
    playerId: unknown,
    _identity: SportsWatchAdminIdentity,
  ): Promise<SwissBadmintonIdentityVerification> => {
    const athlete = resolveSelectedAthlete(athleteId, await dependencies.getAthletes());
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
    _identity: SportsWatchAdminIdentity,
  ): Promise<IwwfIdentityVerification> => {
    const athlete = resolveSelectedAthlete(athleteId, await dependencies.getAthletes());
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
    _identity: SportsWatchAdminIdentity,
  ): Promise<SafvTeamVerification> => {
    const athlete = resolveSelectedAthlete(athleteId, await dependencies.getAthletes());
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

  verifySwissBinding,
  verifyIwwfBinding,
  verifySafvBinding,

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

  async run(
    sourceKeyValue: unknown,
    athleteId: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchRunResult> {
    const sourceKey = requireSourceKey(sourceKeyValue);
    const source = sourceDefinitions[sourceKey];
    const athlete = resolveSelectedAthlete(athleteId, await dependencies.getAthletes());
    const swissBinding = sourceKey === "swiss-badminton"
      ? await dependencies.repository.getActiveSwissBinding(identity.workspaceId, athlete.id)
      : null;
    const iwwfBinding = sourceKey === "iwwf-wakesurf"
      ? await dependencies.repository.getActiveIwwfBinding(identity.workspaceId, athlete.id)
      : null;
    const safvBinding = sourceKey === "safv"
      ? await dependencies.repository.getActiveSafvBinding(identity.workspaceId, athlete.id)
      : null;
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
    const now = dependencies.now().toISOString();
    const runId = await dependencies.repository.startRun({
      workspaceId: identity.workspaceId,
      sourceKey,
      athleteId: athlete.id,
      athleteName: athlete.name,
      clerkUserId: identity.clerkUserId,
      now,
    });
    if (!runId) {
      throw new SportsWatchError("conflict", `Une collecte ${source.name} est déjà en cours pour cet espace.`);
    }

    try {
      const collection = await dependencies.collectors[sourceKey](athlete, {
        lookbackDays: 30,
        dependencies: { now: dependencies.now },
        swissProfile: swissBinding?.officialIdentity,
        iwwfProfile: iwwfBinding?.officialIdentity,
        safvTeam: safvBinding?.officialTeam,
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
          ?? source.url,
        message,
        scannedCount: collection.scannedCount,
        recentCount: collection.recentCount,
        createdCount,
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
    if (!["validated", "rejected"].includes(status) || !Number.isInteger(version) || version < 1) {
      throw new SportsWatchError("validation", "Décision ou version invalide.");
    }
    if (status === "validated") {
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
      if (current.attributionStatus === "ambiguous") {
        throw new SportsWatchError(
          "validation",
          "L’attribution de ce candidat est ambiguë. La validation éditoriale est bloquée.",
        );
      }
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
    const verificationLabel = candidate.verificationStatus === "verified"
      ? "vérifiée"
      : candidate.verificationStatus === "disputed"
        ? "contestée"
        : "non vérifiée";
    const provenance = [
      `${candidate.sourceName} — ${candidate.articleUrl}`,
      `Publication : ${dateLabel(candidate.publicationDate)}`,
      `Événement : ${dateLabel(candidate.eventDateFrom)}${candidate.eventDateTo && candidate.eventDateTo !== candidate.eventDateFrom ? ` au ${dateLabel(candidate.eventDateTo)}` : ""}`,
      `Collecte : ${dateLabel(candidate.collectedAt)}`,
      `Vérification factuelle : ${verificationLabel}`,
    ].join(" · ");
    return {
      candidateId: candidate.id,
      athleteId: candidate.athleteId,
      verificationStatus: candidate.verificationStatus,
      material: {
        id: `sports-watch-${candidate.id}`,
        kind: "note",
        text: candidate.excerpt,
        provenance,
        sourceDate: candidate.eventDateFrom ?? candidate.publicationDate?.slice(0, 10) ?? candidate.collectedAt.slice(0, 10),
      },
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
