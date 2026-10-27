import { createHash, randomUUID } from "node:crypto";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import {
  localAdminFixtureAthletes,
  localIntroductionFixturesEnabled,
} from "@/lib/partner-athlete-introductions/local-fixtures";
import {
  deleteSportsWatchImportFile,
  readSportsWatchImportFile,
  uploadSportsWatchImportFile,
} from "@/lib/sports-watch/import-file";
import { extractSportsWatchImport } from "@/lib/sports-watch/import-extractor";
import {
  SportsWatchImportRepository,
  type SportsWatchImportRecord,
} from "@/lib/sports-watch/import-repository";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";
import { normalizeSportsWatchSport } from "@/lib/sports-watch/sport";
import {
  SportsWatchError,
  type SportsWatchAdminIdentity,
} from "@/lib/sports-watch/service";
import type { Athlete } from "@/types/athlete";
import type {
  SportsWatchCandidate,
  SportsWatchImport,
  SportsWatchImportConfirmation,
  SportsWatchIndividualStatistic,
} from "@/types/sports-watch";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedResultKinds = new Set(["individual_result", "collective_result", "participation"]);

type ImportRepository = typeof SportsWatchImportRepository;

type ImportServiceDependencies = {
  repository: ImportRepository;
  getAthletes: () => Promise<Athlete[]>;
  uploadFile: typeof uploadSportsWatchImportFile;
  deleteFile: typeof deleteSportsWatchImportFile;
  readFile: typeof readSportsWatchImportFile;
  extract: typeof extractSportsWatchImport;
  getCandidate: typeof PostgresSportsWatchRepository.getCandidate;
  now: () => Date;
};

const defaults: ImportServiceDependencies = {
  repository: SportsWatchImportRepository,
  getAthletes: () => localIntroductionFixturesEnabled()
    ? Promise.resolve(localAdminFixtureAthletes())
    : getAthletesFromGoogleSheets(),
  uploadFile: uploadSportsWatchImportFile,
  deleteFile: deleteSportsWatchImportFile,
  readFile: readSportsWatchImportFile,
  extract: extractSportsWatchImport,
  getCandidate: PostgresSportsWatchRepository.getCandidate,
  now: () => new Date(),
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const requireUuid = (value: unknown, label: string): string => {
  const id = normalize(value);
  if (!UUID_PATTERN.test(id)) throw new SportsWatchError("validation", `${label} est invalide.`);
  return id;
};

const isSupportedSport = (sport: string): boolean => {
  const normalized = normalizeSportsWatchSport(sport);
  return normalized.includes("basket")
    || normalized.includes("tennis")
    || (
      normalized.includes("football")
      && !normalized.includes("americain")
      && !normalized.includes("us")
    );
};

const resolveAthlete = async (
  athleteIdValue: unknown,
  dependencies: ImportServiceDependencies,
) => {
  const athleteId = normalize(athleteIdValue);
  if (!athleteId) throw new SportsWatchError("validation", "Sélectionnez un athlète CRM.");
  const athlete = (await dependencies.getAthletes()).find((item) =>
    normalize(item.athleteId) === athleteId || normalize(item.key) === athleteId);
  if (!athlete) throw new SportsWatchError("not_found", "L’athlète CRM est introuvable.");
  if (!isSupportedSport(athlete.sport)) {
    throw new SportsWatchError(
      "validation",
      "L’import manuel est limité au basket, au football et au tennis pour ce lot.",
    );
  }
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

const optionalText = (value: unknown, limit: number): string | null => {
  const text = normalize(value);
  return text ? text.slice(0, limit) : null;
};

const optionalDate = (value: unknown, label: string): string | null => {
  const text = normalize(value);
  if (!text) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== text
  ) {
    throw new SportsWatchError("validation", `${label} est invalide.`);
  }
  return text;
};

const optionalFinalScore = (value: unknown): string | null => {
  const score = optionalText(value, 120);
  if (!score) return null;
  if (!/\d+\s*(?:[-–—:]\s*|\bà\b)\d+/i.test(score)) {
    throw new SportsWatchError(
      "validation",
      "Le score final exige deux scores opposés explicitement visibles ; un total isolé n’est pas accepté.",
    );
  }
  return score;
};

const validateStatistics = (value: unknown): SportsWatchIndividualStatistic[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item === "string") {
          const statisticValue = normalize(item).slice(0, 300);
          return statisticValue
            ? [{ label: "Statistique", value: statisticValue, evidence: null }]
            : [];
        }
        if (typeof item !== "object" || item === null) return [];
        const statistic = item as Record<string, unknown>;
        const label = normalize(statistic.label).slice(0, 120);
        const statisticValue = normalize(statistic.value).slice(0, 120);
        if (!label || !statisticValue) return [];
        return [{
          label,
          value: statisticValue,
          evidence: optionalText(statistic.evidence, 600),
        }];
      }).slice(0, 30)
    : [];

const validateConfirmation = (value: unknown): SportsWatchImportConfirmation => {
  if (typeof value !== "object" || value === null) {
    throw new SportsWatchError("validation", "Les informations confirmées sont invalides.");
  }
  const input = value as Record<string, unknown>;
  const sourceName = normalize(input.sourceName).slice(0, 160);
  if (!sourceName) throw new SportsWatchError("validation", "La source est obligatoire.");
  const resultKind = normalize(input.resultKind);
  if (!allowedResultKinds.has(resultKind)) {
    throw new SportsWatchError("validation", "Le type de résultat est invalide.");
  }
  const individualParticipationExplicit = input.individualParticipationExplicit === true;
  const individualEvidence = optionalText(input.individualEvidence, 600);
  const individualStatistics = validateStatistics(input.individualStatistics);
  if (
    (resultKind === "individual_result" || resultKind === "participation")
    && (!individualParticipationExplicit || !individualEvidence)
  ) {
    throw new SportsWatchError(
      "validation",
      "Une participation ou performance individuelle exige une preuve explicite dans le document.",
    );
  }
  if (
    resultKind === "collective_result"
    && individualParticipationExplicit
  ) {
    throw new SportsWatchError(
      "validation",
      "Un résultat collectif ne peut pas attribuer automatiquement une participation individuelle.",
    );
  }
  return {
    sourceName,
    documentDate: optionalDate(input.documentDate, "La date du document"),
    matchDate: optionalDate(input.matchDate, "La date du match"),
    competition: optionalText(input.competition, 160),
    participantA: optionalText(input.participantA, 200),
    participantB: optionalText(input.participantB, 200),
    score: optionalFinalScore(input.score),
    resultKind: resultKind as SportsWatchImportConfirmation["resultKind"],
    individualParticipationExplicit,
    individualEvidence,
    individualStatistics,
  };
};

export const buildSportsWatchImportCandidateContent = (
  imported: SportsWatchImportRecord,
  confirmation: SportsWatchImportConfirmation,
) => {
  const participants = [confirmation.participantA, confirmation.participantB]
    .filter(Boolean)
    .join(" — ");
  const title = [
    confirmation.competition,
    participants || imported.athleteName,
  ].filter(Boolean).join(" · ").slice(0, 300);
  const lines = [
    confirmation.resultKind === "collective_result"
      ? "Résultat collectif — participation individuelle non vérifiée."
      : confirmation.resultKind === "participation"
        ? "Participation individuelle explicitement indiquée dans le document importé."
        : "Résultat individuel explicitement attribué dans le document importé.",
    `Source : ${confirmation.sourceName}.`,
    `Date du document : ${confirmation.documentDate ?? "non indiquée"}.`,
    `Date du match : ${confirmation.matchDate ?? "non indiquée"}.`,
    confirmation.competition ? `Compétition : ${confirmation.competition}.` : null,
    participants ? `Participants dans l’ordre du document : ${participants}.` : null,
    confirmation.score ? `Score tel qu’affiché : ${confirmation.score}.` : null,
    confirmation.individualEvidence
      ? `Preuve de participation individuelle : ${confirmation.individualEvidence}.`
      : null,
    confirmation.individualStatistics.length > 0
      ? `${confirmation.individualParticipationExplicit
          ? "Statistiques individuelles confirmées"
          : "Propositions statistiques non attribuées"} : ${
          confirmation.individualStatistics
            .map((statistic) => `${statistic.label} : ${statistic.value}`)
            .join(" ; ")
        }.`
      : null,
    (() => {
      const evidence = Array.from(new Set(
        confirmation.individualStatistics
          .map((statistic) => statistic.evidence)
          .filter((item): item is string => Boolean(item)),
      ));
      return evidence.length > 0
        ? `Preuves des statistiques dans le document : ${evidence.join(" ; ")}.`
        : null;
    })(),
  ].filter((line): line is string => Boolean(line));
  const sourceUrl = `/api/admin/sports-watch/imports/${imported.id}/file`;
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(confirmation))
    .digest("hex");
  return {
    id: randomUUID(),
    sourceName: confirmation.sourceName,
    sourceUrl,
    title: title || `Résultat importé · ${imported.athleteName}`,
    excerpt: lines.join(" "),
    resultKind: confirmation.resultKind,
    publicationDate: confirmation.documentDate
      ? `${confirmation.documentDate}T00:00:00.000Z`
      : null,
    eventDate: confirmation.matchDate,
    attributionEvidence: confirmation.resultKind === "collective_result"
      ? [
          "Document privé importé et confirmé par un Admin.",
          "Résultat collectif uniquement ; aucune participation individuelle n’est attribuée.",
          ...(confirmation.individualStatistics.length > 0
            ? ["Les statistiques visibles sont conservées comme propositions non attribuées à confirmer."]
            : []),
        ]
      : [
          "Document privé importé et confirmé par un Admin.",
          `Preuve individuelle confirmée : ${confirmation.individualEvidence}`,
        ],
    logicalKey: `manual-import|${imported.id}`,
    contentHash: payloadHash,
  };
};

export const createSportsWatchImportService = (
  overrides: Partial<ImportServiceDependencies> = {},
) => {
  const dependencies = { ...defaults, ...overrides };
  return {
    async upload(
      athleteId: unknown,
      file: File,
      identity: SportsWatchAdminIdentity,
    ): Promise<SportsWatchImport> {
      const athlete = await resolveAthlete(athleteId, dependencies);
      const uploaded = await dependencies.uploadFile(file);
      try {
        const result = await dependencies.repository.create({
          workspaceId: identity.workspaceId,
          athlete,
          clerkUserId: identity.clerkUserId,
          file: uploaded,
        });
        if (!result.created) await dependencies.deleteFile(uploaded.pathname);
        return result.imported;
      } catch (error) {
        await dependencies.deleteFile(uploaded.pathname);
        throw error;
      }
    },

    async get(
      importIdValue: unknown,
      identity: SportsWatchAdminIdentity,
    ): Promise<SportsWatchImportRecord> {
      const importId = requireUuid(importIdValue, "L’import");
      const imported = await dependencies.repository.get(identity.workspaceId, importId);
      if (!imported) throw new SportsWatchError("not_found", "Import introuvable dans cet espace.");
      return imported;
    },

    async extract(
      importIdValue: unknown,
      expectedVersionValue: unknown,
      identity: SportsWatchAdminIdentity,
    ): Promise<SportsWatchImport> {
      const imported = await this.get(importIdValue, identity);
      const expectedVersion = Number(expectedVersionValue);
      if (
        !Number.isInteger(expectedVersion)
        || expectedVersion !== imported.version
        || imported.status === "confirmed"
      ) {
        throw new SportsWatchError("conflict", "L’import a été modifié ou déjà confirmé.");
      }
      const result = await dependencies.extract({
        workspaceId: identity.workspaceId,
        clerkUserId: identity.clerkUserId,
        contentType: imported.contentType,
        filename: imported.originalFilename,
        bytes: await dependencies.readFile(imported.blobPathname),
        athlete: {
          name: imported.athleteName,
          sport: imported.athleteSport,
          club: imported.athleteClub,
        },
      });
      const saved = await dependencies.repository.saveExtraction({
        workspaceId: identity.workspaceId,
        importId: imported.id,
        expectedVersion,
        ...result,
      });
      if (!saved) {
        throw new SportsWatchError(
          "conflict",
          "L’import a été modifié pendant l’extraction. Rechargez-le avant de continuer.",
        );
      }
      return saved;
    },

    async confirm(
      importIdValue: unknown,
      expectedVersionValue: unknown,
      confirmationValue: unknown,
      identity: SportsWatchAdminIdentity,
    ): Promise<{ imported: SportsWatchImport; candidate: SportsWatchCandidate }> {
      const imported = await this.get(importIdValue, identity);
      if (imported.status === "confirmed" && imported.candidateId) {
        const candidate = await dependencies.getCandidate(
          identity.workspaceId,
          imported.candidateId,
        );
        if (!candidate) throw new Error("Le candidat confirmé est introuvable.");
        return { imported, candidate };
      }
      const expectedVersion = Number(expectedVersionValue);
      if (
        imported.status !== "extracted"
        || !Number.isInteger(expectedVersion)
        || expectedVersion !== imported.version
      ) {
        throw new SportsWatchError("conflict", "L’extraction a été modifiée ou n’est pas prête à confirmer.");
      }
      const confirmation = validateConfirmation(confirmationValue);
      const candidateContent = buildSportsWatchImportCandidateContent(imported, confirmation);
      const candidate = await dependencies.repository.confirm({
        workspaceId: identity.workspaceId,
        importId: imported.id,
        expectedVersion,
        clerkUserId: identity.clerkUserId,
        confirmation,
        candidate: {
          ...candidateContent,
          collectedAt: dependencies.now().toISOString(),
        },
      });
      if (!candidate) {
        throw new SportsWatchError(
          "conflict",
          "L’import a été confirmé ou modifié par une autre action.",
        );
      }
      const confirmed = await dependencies.repository.get(identity.workspaceId, imported.id);
      if (!confirmed) throw new Error("L’import confirmé est introuvable.");
      return { imported: confirmed, candidate };
    },
  };
};

export const SportsWatchImportService = createSportsWatchImportService();
