import { createHash, randomUUID } from "node:crypto";
import type { SportsWatchCrmAthlete } from "@/lib/google-sheets";
import {
  localAdminFixtureAthletes,
  localIntroductionFixturesEnabled,
} from "@/lib/partner-athlete-introductions/local-fixtures";
import { SportsWatchAthleteDirectory } from "@/lib/sports-watch/athlete-directory";
import {
  PostgresSportsWatchRepository,
  type SportsWatchManualEntryCandidateInput,
  type SportsWatchRepository,
} from "@/lib/sports-watch/repository";
import {
  normalizeSportsWatchSport,
} from "@/lib/sports-watch/sport";
import {
  SportsWatchError,
  type SportsWatchAdminIdentity,
} from "@/lib/sports-watch/service";
import type {
  SportsWatchCandidate,
  SportsWatchManualBasketballDetails,
  SportsWatchManualEntryCreation,
  SportsWatchManualEntryDuplicate,
  SportsWatchManualEntryMetadata,
  SportsWatchManualFootballDetails,
  SportsWatchManualNewsType,
  SportsWatchManualStatistic,
  SportsWatchParticipationStatus,
  SportsWatchResultKind,
} from "@/types/sports-watch";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FOOTSTATS_SOURCE = "Footstats Pro";
export const FOOTSTATS_MANUAL_SOURCE_LABEL =
  "Footstats Pro — saisie manuelle Admin, source tierce non officielle";

const newsTypes = new Set<SportsWatchManualNewsType>([
  "result_match",
  "individual_performance",
  "selection_callup",
  "transfer_signing",
  "injury_return",
  "distinction",
  "record",
  "other_news",
]);

const participationStatuses = new Set<SportsWatchParticipationStatus>([
  "starter",
  "entered",
  "unused_substitute",
  "unknown",
]);

const newsTypeLabels: Record<SportsWatchManualNewsType, string> = {
  result_match: "Résultat ou match",
  individual_performance: "Performance individuelle",
  selection_callup: "Sélection ou convocation",
  transfer_signing: "Transfert ou signature",
  injury_return: "Blessure ou retour",
  distinction: "Distinction",
  record: "Record",
  other_news: "Autre actualité",
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizedComparison = (value: string | null): string => (value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const assertObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SportsWatchError("validation", `${label} est invalide.`);
  }
  return value as Record<string, unknown>;
};

const assertAllowedKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) => {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) {
    throw new SportsWatchError(
      "validation",
      `${label} contient un champ non reconnu : ${unexpected}.`,
    );
  }
};

const text = (
  value: unknown,
  label: string,
  maxLength: number,
  required = false,
): string | null => {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new SportsWatchError("validation", `${label} doit être un texte.`);
  }
  const result = normalize(value);
  if (required && !result) {
    throw new SportsWatchError("validation", `${label} est obligatoire.`);
  }
  if (result.length > maxLength) {
    throw new SportsWatchError(
      "validation",
      `${label} dépasse la limite de ${maxLength} caractères.`,
    );
  }
  if (/<\/?[a-z][^>]*>/i.test(result)) {
    throw new SportsWatchError("validation", `${label} ne peut pas contenir de HTML.`);
  }
  return result || null;
};

const integer = (
  value: unknown,
  label: string,
  maximum: number,
): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
    || value > maximum
  ) {
    throw new SportsWatchError(
      "validation",
      `${label} doit être un nombre entier compris entre 0 et ${maximum}.`,
    );
  }
  return value;
};

const booleanOrNull = (value: unknown, label: string): boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") {
    throw new SportsWatchError("validation", `${label} doit être oui, non ou inconnu.`);
  }
  return value;
};

const sourceReference = (value: unknown, label: string): string | null => {
  const result = text(value, label, 1000);
  if (!result) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(result)) {
    let url: URL;
    try {
      url = new URL(result);
    } catch {
      throw new SportsWatchError("validation", `${label} contient une URL invalide.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new SportsWatchError("validation", `${label} accepte uniquement une URL HTTP(S).`);
    }
  }
  return result;
};

const strictDate = (value: unknown): string => {
  const result = normalize(value);
  if (!ISO_DATE_PATTERN.test(result)) {
    throw new SportsWatchError("validation", "La date de l’événement est invalide.");
  }
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new SportsWatchError("validation", "La date de l’événement est invalide.");
  }
  return result;
};

const statistics = (value: unknown): SportsWatchManualStatistic[] => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) {
    throw new SportsWatchError(
      "validation",
      "Les statistiques personnalisées sont limitées à 12 lignes.",
    );
  }
  return value.map((item, index) => {
    const record = assertObject(item, `La statistique ${index + 1}`);
    assertAllowedKeys(record, ["label", "value", "unit"], `La statistique ${index + 1}`);
    return {
      label: text(record.label, `Le libellé de la statistique ${index + 1}`, 80, true)!,
      value: text(record.value, `La valeur de la statistique ${index + 1}`, 120, true)!,
      unit: text(record.unit, `L’unité de la statistique ${index + 1}`, 40),
    };
  });
};

const footballDetails = (
  value: unknown,
  athleteSport: string,
): SportsWatchManualFootballDetails | null => {
  if (value === null || value === undefined) return null;
  if (
    !normalizeSportsWatchSport(athleteSport).includes("football")
    || normalizeSportsWatchSport(athleteSport).includes("americain")
    || normalizeSportsWatchSport(athleteSport).includes("foot us")
  ) {
    throw new SportsWatchError(
      "validation",
      "Les champs football ne correspondent pas au sport de l’athlète.",
    );
  }
  const record = assertObject(value, "Les informations football");
  assertAllowedKeys(record, [
    "team",
    "participationStatus",
    "minutes",
    "goals",
    "assists",
    "yellowCards",
    "redCards",
    "opponent",
    "score",
    "competition",
    "footstatsReference",
    "footstatsPlayerId",
    "footstatsTeamId",
  ], "Les informations football");
  const participationStatus = normalize(record.participationStatus) as SportsWatchParticipationStatus;
  if (!participationStatuses.has(participationStatus)) {
    throw new SportsWatchError("validation", "Le statut de participation football est invalide.");
  }
  const minutes = integer(record.minutes, "Les minutes jouées", 300);
  if (
    minutes !== null
    && participationStatus !== "starter"
    && participationStatus !== "entered"
  ) {
    throw new SportsWatchError(
      "validation",
      "Les minutes exigent une participation comme titulaire ou après une entrée en jeu.",
    );
  }
  return {
    team: text(record.team, "Le club ou l’équipe", 160),
    participationStatus,
    minutes,
    goals: integer(record.goals, "Les buts", 100),
    assists: integer(record.assists, "Les passes décisives", 100),
    yellowCards: integer(record.yellowCards, "Les cartons jaunes", 20),
    redCards: integer(record.redCards, "Les cartons rouges", 20),
    opponent: text(record.opponent, "L’adversaire", 200),
    score: text(record.score, "Le score collectif", 80),
    competition: text(record.competition, "La compétition", 160),
    footstatsReference: sourceReference(record.footstatsReference, "La référence Footstats"),
    footstatsPlayerId: text(record.footstatsPlayerId, "L’identifiant joueur Footstats", 100),
    footstatsTeamId: text(record.footstatsTeamId, "L’identifiant équipe Footstats", 100),
  };
};

const basketballDetails = (
  value: unknown,
  athleteSport: string,
): SportsWatchManualBasketballDetails | null => {
  if (value === null || value === undefined) return null;
  if (!normalizeSportsWatchSport(athleteSport).includes("basket")) {
    throw new SportsWatchError(
      "validation",
      "Les champs basketball ne correspondent pas au sport de l’athlète.",
    );
  }
  const record = assertObject(value, "Les informations basketball");
  assertAllowedKeys(record, [
    "starter",
    "minutes",
    "points",
    "rebounds",
    "assists",
    "steals",
    "blocks",
  ], "Les informations basketball");
  return {
    starter: booleanOrNull(record.starter, "La titularisation"),
    minutes: integer(record.minutes, "Les minutes", 300),
    points: integer(record.points, "Les points", 300),
    rebounds: integer(record.rebounds, "Les rebonds", 100),
    assists: integer(record.assists, "Les passes", 100),
    steals: integer(record.steals, "Les interceptions", 100),
    blocks: integer(record.blocks, "Les contres", 100),
  };
};

type ValidatedInput = {
  athleteId: string;
  eventDate: string;
  newsType: SportsWatchManualNewsType;
  title: string;
  summary: string;
  initialStatus: "pending" | "validated";
  idempotencyKey: string;
  metadata: SportsWatchManualEntryMetadata;
};

const validateInput = (
  value: unknown,
  athlete: SportsWatchCrmAthlete,
): ValidatedInput => {
  const input = assertObject(value, "La saisie manuelle");
  assertAllowedKeys(input, [
    "athleteId",
    "eventDate",
    "newsType",
    "title",
    "summary",
    "competition",
    "opponent",
    "score",
    "source",
    "sourceReference",
    "internalNote",
    "initialStatus",
    "idempotencyKey",
    "football",
    "basketball",
    "statistics",
    "allowPotentialDuplicate",
  ], "La saisie manuelle");
  const newsType = normalize(input.newsType) as SportsWatchManualNewsType;
  if (!newsTypes.has(newsType)) {
    throw new SportsWatchError("validation", "Le type d’actualité est invalide.");
  }
  const initialStatus = normalize(input.initialStatus);
  if (initialStatus !== "pending" && initialStatus !== "validated") {
    throw new SportsWatchError("validation", "Le statut initial est invalide.");
  }
  const idempotencyKey = normalize(input.idempotencyKey);
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new SportsWatchError("validation", "La clé de protection de la requête est invalide.");
  }
  const football = footballDetails(input.football, athlete.sport);
  const basketball = basketballDetails(input.basketball, athlete.sport);
  const genericCompetition = text(input.competition, "La compétition", 160);
  const genericOpponent = text(input.opponent, "L’adversaire", 200);
  const genericScore = text(input.score, "Le score", 80);
  const declaredSource = text(input.source, "La source", 160);
  const declaredReference = sourceReference(input.sourceReference, "L’URL ou la référence");
  const hasFootstatsMetadata = Boolean(
    football?.footstatsReference
    || football?.footstatsPlayerId
    || football?.footstatsTeamId
    || declaredReference?.toLowerCase().includes("footstats"),
  );
  if (
    hasFootstatsMetadata
    && declaredSource
    && normalizedComparison(declaredSource) !== normalizedComparison(FOOTSTATS_SOURCE)
  ) {
    throw new SportsWatchError(
      "validation",
      "Une référence Footstats doit utiliser la source « Footstats Pro ».",
    );
  }
  const competition = football?.competition ?? genericCompetition;
  const opponent = football?.opponent ?? genericOpponent;
  const score = football?.score ?? genericScore;
  return {
    athleteId: normalize(input.athleteId),
    eventDate: strictDate(input.eventDate),
    newsType,
    title: text(input.title, "Le titre", 300, true)!,
    summary: text(input.summary, "Le résumé factuel", 3000, true)!,
    initialStatus,
    idempotencyKey,
    metadata: {
      mode: "manual_entry",
      newsType,
      competition,
      opponent,
      score,
      source: hasFootstatsMetadata ? FOOTSTATS_SOURCE : declaredSource,
      sourceReference: declaredReference,
      internalNote: text(input.internalNote, "La note interne", 1500),
      football,
      basketball,
      statistics: statistics(input.statistics),
    },
  };
};

const resultKind = (newsType: SportsWatchManualNewsType): SportsWatchResultKind => {
  if (newsType === "result_match") return "collective_result";
  if (newsType === "individual_performance" || newsType === "record") {
    return "individual_result";
  }
  if (newsType === "selection_callup") return "participation";
  return "news_excerpt";
};

const participationLabel: Record<SportsWatchParticipationStatus, string> = {
  starter: "Titulaire.",
  entered: "Entré en jeu.",
  unused_substitute: "Remplaçant sans entrer en jeu.",
  unknown: "Participation inconnue.",
};

const numberLine = (label: string, value: number | null, unit = ""): string | null =>
  value === null ? null : `${label} : ${value}${unit}.`;

const sourceName = (source: string | null): string => {
  if (normalizedComparison(source) === normalizedComparison(FOOTSTATS_SOURCE)) {
    return FOOTSTATS_MANUAL_SOURCE_LABEL;
  }
  return source ? `${source} — saisie manuelle` : "Saisie manuelle Admin";
};

const buildExcerpt = (
  input: ValidatedInput,
  athlete: SportsWatchCrmAthlete,
): string => {
  const football = input.metadata.football;
  const basketball = input.metadata.basketball;
  const lines = [
    "Origine : saisie manuelle Admin.",
    `Type : ${newsTypeLabels[input.newsType]}.`,
    `Athlète : ${athlete.name}.`,
    `Date de l’événement : ${input.eventDate}.`,
    input.metadata.competition ? `Compétition : ${input.metadata.competition}.` : null,
    input.metadata.opponent ? `Adversaire : ${input.metadata.opponent}.` : null,
    input.metadata.score ? `Score déclaré : ${input.metadata.score}.` : null,
    input.summary,
    football ? `Participation : ${participationLabel[football.participationStatus]}` : null,
    football?.score
      ? "Le score collectif ne constitue pas une preuve de participation individuelle."
      : null,
    football ? numberLine("Minutes jouées", football.minutes) : null,
    football ? numberLine("Buts", football.goals) : null,
    football ? numberLine("Passes décisives", football.assists) : null,
    football ? numberLine("Cartons jaunes", football.yellowCards) : null,
    football ? numberLine("Cartons rouges", football.redCards) : null,
    basketball?.starter === null || basketball === null
      ? null
      : `Titulaire : ${basketball.starter ? "oui" : "non"}.`,
    basketball ? numberLine("Minutes", basketball.minutes) : null,
    basketball ? numberLine("Points", basketball.points) : null,
    basketball ? numberLine("Rebonds", basketball.rebounds) : null,
    basketball ? numberLine("Passes", basketball.assists) : null,
    basketball ? numberLine("Interceptions", basketball.steals) : null,
    basketball ? numberLine("Contres", basketball.blocks) : null,
    ...input.metadata.statistics.map((statistic) =>
      `${statistic.label} : ${statistic.value}${statistic.unit ? ` ${statistic.unit}` : ""}.`),
    `Source déclarée : ${sourceName(input.metadata.source)}.`,
    "Statut factuel initial : non vérifié.",
  ];
  return lines.filter((line): line is string => Boolean(line)).join(" ");
};

const canonicalIdentity = (
  athleteId: string,
  input: ValidatedInput,
): Record<string, string> => {
  const opponent = normalizedComparison(input.metadata.opponent);
  const score = normalizedComparison(input.metadata.score);
  return {
    athleteId,
    eventDate: input.eventDate,
    opponent,
    score,
    fallback: opponent || score
      ? ""
      : `${input.newsType}|${normalizedComparison(input.title)}`,
  };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const candidatePayload = (
  athlete: SportsWatchCrmAthlete,
  input: ValidatedInput,
  now: string,
): SportsWatchManualEntryCandidateInput => {
  const id = randomUUID();
  const reference = input.metadata.sourceReference;
  const httpReference = reference && /^https?:\/\//i.test(reference) ? reference : "";
  const metadata = input.metadata;
  const logicalKey = `manual-entry|${sha256(JSON.stringify(canonicalIdentity(
    normalize(athlete.athleteId) || normalize(athlete.key),
    input,
  )))}`;
  const contentHash = sha256(JSON.stringify({
    athleteId: normalize(athlete.athleteId) || normalize(athlete.key),
    eventDate: input.eventDate,
    newsType: input.newsType,
    title: input.title,
    summary: input.summary,
    initialStatus: input.initialStatus,
    metadata,
  }));
  return {
    id,
    athlete: {
      id: normalize(athlete.athleteId) || normalize(athlete.key),
      name: normalize(athlete.name),
      sport: normalize(athlete.sport),
      club: normalize(athlete.club),
    },
    sourceName: sourceName(metadata.source),
    sourceUrl: httpReference,
    articleUrl: httpReference,
    title: input.title,
    excerpt: buildExcerpt(input, athlete),
    resultKind: resultKind(input.newsType),
    eventDate: input.eventDate,
    collectedAt: now,
    attributionEvidence: [
      "Athlète sélectionné explicitement par un Admin dans le registre CRM actif.",
      "Origine manuelle ; aucune collecte ni vérification factuelle automatique.",
      metadata.source && normalizedComparison(metadata.source) === normalizedComparison(FOOTSTATS_SOURCE)
        ? "Footstats Pro est une source tierce non officielle."
        : "La provenance déclarée doit être vérifiée avant publication.",
    ],
    initialStatus: input.initialStatus,
    logicalKey,
    contentHash,
    metadata,
    idempotencyKey: input.idempotencyKey,
  };
};

const scoreFromCandidate = (candidate: SportsWatchCandidate): string =>
  normalizedComparison(
    candidate.manualEntry?.score
    ?? candidate.excerpt.match(/\b(?:Score déclaré|Score final explicite|Match)\s*:\s*([^.]*)/i)?.[1]
    ?? "",
  );

const opponentMatchesCandidate = (
  opponent: string,
  candidate: SportsWatchCandidate,
): boolean => {
  if (!opponent) return false;
  const manualOpponent = normalizedComparison(candidate.manualEntry?.opponent ?? null);
  if (manualOpponent) return manualOpponent === opponent;
  return normalizedComparison(`${candidate.title} ${candidate.excerpt}`).includes(opponent);
};

const potentialDuplicates = (
  candidate: SportsWatchManualEntryCandidateInput,
  existing: Array<{ candidate: SportsWatchCandidate; sourceKey: string }>,
): SportsWatchManualEntryDuplicate[] => {
  const opponent = normalizedComparison(candidate.metadata.opponent);
  const score = normalizedComparison(candidate.metadata.score);
  const title = normalizedComparison(candidate.title);
  return existing.flatMap(({ candidate: item, sourceKey }) => {
    const opponentMatch = opponentMatchesCandidate(opponent, item);
    const existingScore = scoreFromCandidate(item);
    const scoreMatch = Boolean(score && existingScore && existingScore.includes(score));
    const titleMatch = Boolean(title && normalizedComparison(item.title) === title);
    if (!opponentMatch && !scoreMatch && !titleMatch) return [];
    const reason = opponentMatch && scoreMatch
      ? "Même athlète, même date, même adversaire et même score."
      : opponentMatch
        ? "Même athlète, même date et même adversaire."
        : scoreMatch
          ? "Même athlète, même date et même score."
          : "Même athlète, même date et même titre.";
    return [{
      candidateId: item.id,
      sourceName: item.sourceName,
      title: item.title,
      eventDate: item.eventDateFrom,
      articleUrl: item.articleUrl,
      reason: sourceKey === "manual-entry"
        ? `${reason} Une autre saisie manuelle existe déjà.`
        : `${reason} Un candidat collecté automatiquement existe déjà.`,
    }];
  });
};

export class SportsWatchManualEntryConflictError extends SportsWatchError {
  constructor(
    message: string,
    public readonly duplicates: SportsWatchManualEntryDuplicate[],
  ) {
    super("conflict", message);
    this.name = "SportsWatchManualEntryConflictError";
  }
}

type Dependencies = {
  repository: SportsWatchRepository;
  getAthletes: (identity: SportsWatchAdminIdentity) => Promise<SportsWatchCrmAthlete[]>;
  now: () => Date;
};

const defaultDependencies: Dependencies = {
  repository: PostgresSportsWatchRepository,
  getAthletes: (identity) => localIntroductionFixturesEnabled()
    ? Promise.resolve(localAdminFixtureAthletes())
    : SportsWatchAthleteDirectory.resolve({
        ...identity,
        accessRole: "admin",
        accessStatus: "active",
      }),
  now: () => new Date(),
};

export const createSportsWatchManualEntryService = (
  overrides: Partial<Dependencies> = {},
) => {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    async create(
      value: unknown,
      identity: SportsWatchAdminIdentity,
    ): Promise<SportsWatchManualEntryCreation> {
      const request = assertObject(value, "La saisie manuelle");
      const requestedAthleteId = normalize(request.athleteId);
      const athletes = await dependencies.getAthletes(identity);
      const athlete = athletes.find((item) =>
        normalize(item.athleteId) === requestedAthleteId
        || normalize(item.key) === requestedAthleteId);
      if (!athlete) {
        throw new SportsWatchError(
          "not_found",
          "L’athlète actif sélectionné est introuvable dans cet espace.",
        );
      }
      if (!["actif", "active"].includes(normalizedComparison(athlete.status))) {
        throw new SportsWatchError(
          "validation",
          "La saisie manuelle exige un athlète actif dans cet espace.",
        );
      }
      const input = validateInput(value, athlete);
      const now = dependencies.now().toISOString();
      const prepared = candidatePayload(athlete, input, now);
      const repeated = await dependencies.repository.getManualEntryByIdempotency(
        identity.workspaceId,
        input.idempotencyKey,
      );
      if (repeated) {
        if (repeated.contentHash !== prepared.contentHash) {
          throw new SportsWatchError(
            "conflict",
            "Cette requête a déjà été utilisée avec un contenu différent.",
          );
        }
        return { candidate: repeated.candidate, created: false };
      }
      const exact = await dependencies.repository.getExactManualEntry(
        identity.workspaceId,
        prepared.athlete.id,
        prepared.logicalKey,
        prepared.contentHash,
      );
      if (exact) return { candidate: exact, created: false };

      const allowPotentialDuplicate = request.allowPotentialDuplicate === true;
      const nearby = await dependencies.repository.listManualEntryDuplicates(
        identity.workspaceId,
        prepared.athlete.id,
        prepared.eventDate,
      );
      const duplicates = potentialDuplicates(prepared, nearby);
      if (duplicates.length > 0 && !allowPotentialDuplicate) {
        throw new SportsWatchManualEntryConflictError(
          "Une actualité probablement équivalente existe déjà. Confirmez le rapprochement avant de créer cette saisie.",
          duplicates,
        );
      }
      const created = await dependencies.repository.createManualEntry({
        workspaceId: identity.workspaceId,
        clerkUserId: identity.clerkUserId,
        candidate: prepared,
      });
      if (created) return { candidate: created, created: true };

      const concurrent = await dependencies.repository.getManualEntryByIdempotency(
        identity.workspaceId,
        input.idempotencyKey,
      ) ?? await dependencies.repository.getExactManualEntry(
        identity.workspaceId,
        prepared.athlete.id,
        prepared.logicalKey,
        prepared.contentHash,
      ).then((candidate) => candidate
        ? { candidate, contentHash: prepared.contentHash }
        : null);
      if (!concurrent) {
        throw new SportsWatchError(
          "conflict",
          "La saisie a été modifiée simultanément. Rechargez Sports Watch avant de réessayer.",
        );
      }
      if (concurrent.contentHash !== prepared.contentHash) {
        throw new SportsWatchError(
          "conflict",
          "Cette requête a déjà été utilisée avec un contenu différent.",
        );
      }
      return { candidate: concurrent.candidate, created: false };
    },
  };
};

export const SportsWatchManualEntryService = createSportsWatchManualEntryService();

export const validateSportsWatchManualEntryInput = validateInput;
export const buildSportsWatchManualEntryCandidate = candidatePayload;

export const sportsWatchManualEntryTestUtils = {
  validateInput,
  candidatePayload,
  potentialDuplicates,
};
