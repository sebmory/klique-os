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
  SWISS_BADMINTON_PROFILE_URL,
  SWISS_BADMINTON_SOURCE_NAME,
  collectSwissBadmintonCandidates,
} from "@/lib/sports-watch/swiss-badminton-collector";
import {
  PostgresSportsWatchRepository,
  type SportsWatchRepository,
} from "@/lib/sports-watch/repository";
import type {
  SportsWatchAdminStatus,
  SportsWatchArticlePrefill,
  SportsWatchCandidate,
  SportsWatchRunResult,
  SportsWatchSourceKey,
} from "@/types/sports-watch";
import type { Athlete } from "@/types/athlete";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sourceDefinitions: Record<SportsWatchSourceKey, {
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
    url: SWISS_BADMINTON_PROFILE_URL,
    noRecentMessage: "Aucun résultat Swiss Badminton daté des 30 derniers jours. Aucun résultat ancien n’a été remonté.",
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

const requireSourceKey = (value: unknown): SportsWatchSourceKey => {
  const sourceKey = normalize(value);
  if (sourceKey !== "bc-bulle" && sourceKey !== "swiss-badminton") {
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

type SportsWatchServiceDependencies = {
  repository: SportsWatchRepository;
  getAthletes: () => Promise<Athlete[]>;
  collectors: Record<SportsWatchSourceKey, typeof collectBcBulleCandidates>;
  now: () => Date;
};

const defaultDependencies: SportsWatchServiceDependencies = {
  repository: PostgresSportsWatchRepository,
  getAthletes: () => localIntroductionFixturesEnabled()
    ? Promise.resolve(localAdminFixtureAthletes())
    : getAthletesFromGoogleSheets(),
  collectors: {
    "bc-bulle": collectBcBulleCandidates,
    "swiss-badminton": collectSwissBadmintonCandidates,
  },
  now: () => new Date(),
};

const runMessage = (
  sourceKey: SportsWatchSourceKey,
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
  return {
  async list(identity: SportsWatchAdminIdentity): Promise<SportsWatchCandidate[]> {
    return dependencies.repository.listCandidates(identity.workspaceId);
  },

  async run(
    sourceKeyValue: unknown,
    athleteId: unknown,
    identity: SportsWatchAdminIdentity,
  ): Promise<SportsWatchRunResult> {
    const sourceKey = requireSourceKey(sourceKeyValue);
    const source = sourceDefinitions[sourceKey];
    const athlete = resolveSelectedAthlete(athleteId, await dependencies.getAthletes());
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
        sourceUrl: source.url,
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
