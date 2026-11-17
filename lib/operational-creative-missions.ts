import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  listCreativeAvailability,
  type CreativeAvailabilityConflict,
  type CreativeAvailabilityOccurrence,
  type CreativeAvailabilityRule,
} from "@/lib/creative-availability";

export type OperationalMissionType =
  | "media_day"
  | "match_competition"
  | "video"
  | "interview"
  | "other";

export type OperationalMissionSearchMode =
  | "single_creative"
  | "targeted_creatives"
  | "direct_assignment";

export type OperationalMissionDraftInput = {
  idempotencyKey: string;
  title: string;
  missionType: OperationalMissionType;
  athletes: Array<{ id: string; name: string | null }>;
  scheduledAt: string | null;
  periodEndsAt: string | null;
  locationName: string | null;
  region: string | null;
  deliverables: string | null;
  contextNotes: string | null;
  usageRights: string | null;
  budgetAmountMinor: number | null;
  expensesCovered: boolean;
  expenseTerms: string | null;
  responseDeadline: string | null;
  searchMode: OperationalMissionSearchMode | null;
  targetedCreativeProfileIds?: string[];
};

export type OperationalCreativeCandidate = {
  id: string;
  displayName: string;
  creativeType: "photographer" | "videographer" | "both";
  coverageAreas: string[];
  specialties: string[];
  generalAvailability: string | null;
  availabilityRules: CreativeAvailabilityRule[];
  availability: CreativeAvailabilityOccurrence[];
  conflicts: CreativeAvailabilityConflict[];
};

export type MissionCreativeAvailabilityStatus =
  | "available"
  | "unavailable"
  | "unreported";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missionTypes = new Set<OperationalMissionType>([
  "media_day",
  "match_competition",
  "video",
  "interview",
  "other",
]);
const searchModes = new Set<OperationalMissionSearchMode>([
  "single_creative",
  "targeted_creatives",
  "direct_assignment",
]);

const requiredText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${field} invalide.`);
  }
  return value.trim();
};

const optionalText = (value: unknown, field: string, max: number): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new Error(`${field} invalide.`);
  }
  return value.trim() || null;
};

const optionalTimestamp = (value: unknown, field: string): string | null => {
  const normalized = optionalText(value, field, 50);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} invalide.`);
  return parsed.toISOString();
};

const zurichParts = (value: string): {
  date: string;
  time: string;
} => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
};

const normalizeMatchText = (value: string): string =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("fr");

const candidateTypeMatches = (
  missionType: OperationalMissionType,
  creativeType: OperationalCreativeCandidate["creativeType"],
): boolean => creativeType === "both"
  || (["video", "interview"].includes(missionType)
    ? creativeType === "videographer"
    : creativeType === "photographer");

export const resolveMissionCreativeAvailability = ({
  candidate,
  missionType,
  scheduledAt,
  periodEndsAt,
  region,
}: {
  candidate: OperationalCreativeCandidate;
  missionType: OperationalMissionType;
  scheduledAt: string;
  periodEndsAt: string;
  region: string;
}): MissionCreativeAvailabilityStatus => {
  const start = zurichParts(scheduledAt);
  const end = zurichParts(periodEndsAt);
  if (
    !candidateTypeMatches(missionType, candidate.creativeType)
    || start.date !== end.date
    || candidate.conflicts.some((conflict) => conflict.date === start.date)
  ) {
    return "unavailable";
  }
  if ((candidate.availabilityRules ?? []).length === 0) return "unreported";

  const normalizedRegion = normalizeMatchText(region);
  const availabilityMissionType = missionType === "match_competition"
    ? "match_competition"
    : missionType === "media_day"
      ? "media_day"
      : null;
  const coversMission = candidate.availability.some((occurrence) => {
    if (occurrence.date !== start.date) return false;
    const regionMatches = occurrence.regions.length === 0
      || occurrence.regions.some((value) => normalizeMatchText(value) === normalizedRegion);
    const missionTypeMatches = availabilityMissionType === null
      || occurrence.missionTypes.includes(availabilityMissionType);
    const timeMatches = occurrence.allDay
      || (
        occurrence.startTime !== null
        && occurrence.endTime !== null
        && occurrence.startTime <= start.time
        && occurrence.endTime >= end.time
      );
    return regionMatches && missionTypeMatches && timeMatches;
  });
  return coversMission ? "available" : "unavailable";
};

export const parseOperationalMissionDraftInput = (
  value: unknown,
): OperationalMissionDraftInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set([
    "idempotencyKey",
    "title",
    "missionType",
    "athletes",
    "scheduledAt",
    "periodEndsAt",
    "locationName",
    "region",
    "deliverables",
    "contextNotes",
    "usageRights",
    "budgetAmountMinor",
    "expensesCovered",
    "expenseTerms",
    "responseDeadline",
    "searchMode",
    "targetedCreativeProfileIds",
  ]);
  if (!Object.keys(input).every((key) => allowed.has(key))) {
    throw new Error("Requête invalide.");
  }
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!uuidPattern.test(idempotencyKey)) throw new Error("Clé d’action invalide.");
  const missionType = String(input.missionType ?? "") as OperationalMissionType;
  if (!missionTypes.has(missionType)) throw new Error("Type de mission invalide.");
  const athletes = Array.isArray(input.athletes)
    ? input.athletes.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Athlète invalide.");
        }
        const athlete = value as Record<string, unknown>;
        return {
          id: requiredText(athlete.id, "Identifiant athlète", 200),
          name: optionalText(athlete.name, "Nom athlète", 200),
        };
      })
    : [];
  const uniqueAthletes = [...new Map(athletes.map((athlete) => [athlete.id, athlete])).values()];
  const scheduledAt = optionalTimestamp(input.scheduledAt, "Date de début");
  const periodEndsAt = optionalTimestamp(input.periodEndsAt, "Date de fin");
  if (
    scheduledAt
    && periodEndsAt
    && new Date(periodEndsAt).getTime() < new Date(scheduledAt).getTime()
  ) {
    throw new Error("La fin de période doit suivre son début.");
  }
  const budgetAmountMinor = input.budgetAmountMinor === null
    || input.budgetAmountMinor === undefined
    || input.budgetAmountMinor === ""
    ? null
    : Number(input.budgetAmountMinor);
  if (
    budgetAmountMinor !== null
    && (!Number.isInteger(budgetAmountMinor) || budgetAmountMinor < 0)
  ) {
    throw new Error("Budget invalide.");
  }
  const searchMode = input.searchMode
    ? String(input.searchMode) as OperationalMissionSearchMode
    : null;
  if (searchMode && !searchModes.has(searchMode)) {
    throw new Error("Mode de recherche invalide.");
  }
  const targetedCreativeProfileIds = Array.isArray(input.targetedCreativeProfileIds)
    ? [...new Set(input.targetedCreativeProfileIds.map((value) => String(value).trim()))]
    : [];
  if (targetedCreativeProfileIds.some((id) => !uuidPattern.test(id))) {
    throw new Error("Créatif ciblé invalide.");
  }
  if (searchMode === "single_creative" && targetedCreativeProfileIds.length > 1) {
    throw new Error("Le mode créatif précis accepte un seul créatif.");
  }
  return {
    idempotencyKey,
    title: requiredText(input.title, "Titre", 200),
    missionType,
    athletes: uniqueAthletes,
    scheduledAt,
    periodEndsAt,
    locationName: optionalText(input.locationName, "Lieu", 500),
    region: optionalText(input.region, "Région", 200),
    deliverables: optionalText(input.deliverables, "Livrables", 2000),
    contextNotes: optionalText(input.contextNotes, "Contexte", 4000),
    usageRights: optionalText(input.usageRights, "Conditions et droits", 2000),
    budgetAmountMinor,
    expensesCovered: input.expensesCovered === true,
    expenseTerms: optionalText(input.expenseTerms, "Conditions de frais", 1000),
    responseDeadline: optionalTimestamp(input.responseDeadline, "Date limite de réponse"),
    searchMode,
    targetedCreativeProfileIds,
  };
};

const draftValues = (input: OperationalMissionDraftInput) => [
  input.title,
  input.missionType,
  input.scheduledAt,
  input.periodEndsAt,
  input.locationName,
  input.region,
  input.deliverables,
  input.contextNotes,
  input.usageRights,
  input.budgetAmountMinor,
  input.expensesCovered,
  input.expenseTerms,
  input.responseDeadline,
  input.searchMode,
  input.targetedCreativeProfileIds ?? [],
];

const assertTargetedCreativesAvailable = async (
  workspaceId: string,
  input: OperationalMissionDraftInput,
): Promise<void> => {
  const targetedCreativeProfileIds = input.targetedCreativeProfileIds ?? [];
  if (targetedCreativeProfileIds.length === 0) return;
  if (!input.scheduledAt || !input.periodEndsAt || !input.region) {
    throw new Error("Début, fin et région sont requis pour cibler un créatif.");
  }
  const candidates = await listOperationalCreativeCandidates({
    workspaceId,
    from: zurichParts(input.scheduledAt).date,
    to: zurichParts(input.periodEndsAt).date,
  });
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const creativeProfileId of targetedCreativeProfileIds) {
    const candidate = candidateById.get(creativeProfileId);
    if (
      !candidate
      || resolveMissionCreativeAvailability({
        candidate,
        missionType: input.missionType,
        scheduledAt: input.scheduledAt,
        periodEndsAt: input.periodEndsAt,
        region: input.region,
      }) !== "available"
    ) {
      throw new Error("Un créatif ciblé n’est pas disponible sur toute la mission.");
    }
  }
};

export const createAdminOperationalMission = async ({
  workspaceId,
  clerkUserId,
  input,
}: {
  workspaceId: string;
  clerkUserId: string;
  input: OperationalMissionDraftInput;
}): Promise<{ missionId: string; outcome: "changed" | "unchanged" }> => {
  await assertTargetedCreativesAvailable(workspaceId, input);
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH inserted AS MATERIALIZED (
      INSERT INTO creative_missions (
        workspace_id, business_state, title, mission_type, scheduled_at,
        origin_kind, admin_creation_key, period_ends_at, location_name, region,
        expected_deliverables, context_notes, usage_rights, budget_amount_minor,
        expenses_covered, expense_terms, response_deadline, search_mode,
        targeted_creative_profile_ids,
        regularization_status, created_by_actor
      ) VALUES (
        $1, 'organize', $4, $5, $6::timestamptz,
        'admin', $3::uuid, $7::timestamptz, $8, $9,
        $10, $11, $12, $13, $14, $15, $16::timestamptz, $17, $18::uuid[],
        'none', $2
      )
      ON CONFLICT (workspace_id, admin_creation_key)
        WHERE admin_creation_key IS NOT NULL
      DO NOTHING
      RETURNING id
    ),
    resolved AS MATERIALIZED (
      SELECT id, true AS changed FROM inserted
      UNION ALL
      SELECT mission.id, false
      FROM creative_missions mission
      WHERE mission.workspace_id = $1
        AND mission.admin_creation_key = $3::uuid
        AND NOT EXISTS (SELECT 1 FROM inserted)
    ),
    inserted_athletes AS (
      INSERT INTO creative_mission_athletes (
        workspace_id, mission_id, athlete_id, athlete_name_snapshot
      )
      SELECT $1, resolved.id, athlete.id, athlete.name
      FROM resolved
      CROSS JOIN LATERAL jsonb_to_recordset($19::jsonb) AS athlete (
        id text,
        name text
      )
      WHERE resolved.changed
      ON CONFLICT DO NOTHING
    ),
    inserted_event AS (
      INSERT INTO creative_mission_events (
        workspace_id, mission_id, action, from_state, to_state,
        actor, details, idempotency_key
      )
      SELECT $1, resolved.id, 'admin_mission_created', NULL, 'organize',
             $2, jsonb_build_object('origin', 'admin'),
             'admin-create:' || $3
      FROM resolved
      WHERE resolved.changed
      ON CONFLICT DO NOTHING
    )
    SELECT id, changed FROM resolved
  `, [
    workspaceId,
    clerkUserId,
    input.idempotencyKey,
    ...draftValues(input),
    JSON.stringify(input.athletes),
  ]) as Array<{ id: string; changed: boolean }>;
  if (!rows[0]) throw new Error("La mission n’a pas pu être créée.");
  return {
    missionId: rows[0].id,
    outcome: rows[0].changed ? "changed" : "unchanged",
  };
};

export const updateAdminOperationalMission = async ({
  workspaceId,
  clerkUserId,
  missionId,
  input,
}: {
  workspaceId: string;
  clerkUserId: string;
  missionId: string;
  input: OperationalMissionDraftInput;
}): Promise<"changed" | "unchanged" | "not_found" | "conflict"> => {
  if (!uuidPattern.test(missionId)) throw new Error("Mission invalide.");
  await assertTargetedCreativesAvailable(workspaceId, input);
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH target AS MATERIALIZED (
      SELECT *
      FROM creative_missions
      WHERE workspace_id = $1
        AND id = $3::uuid
      FOR UPDATE
    ),
    changed AS MATERIALIZED (
      UPDATE creative_missions mission
      SET title = $5,
          mission_type = $6,
          scheduled_at = $7::timestamptz,
          period_ends_at = $8::timestamptz,
          location_name = $9,
          region = $10,
          expected_deliverables = $11,
          context_notes = $12,
          usage_rights = $13,
          budget_amount_minor = $14,
          expenses_covered = $15,
          expense_terms = $16,
          response_deadline = $17::timestamptz,
          search_mode = $18,
          targeted_creative_profile_ids = $19::uuid[],
          updated_at = NOW()
      FROM target
      WHERE mission.workspace_id = target.workspace_id
        AND mission.id = target.id
        AND target.origin_kind IN ('admin', 'athlete_request')
        AND target.business_state = 'organize'
        AND NOT EXISTS (
          SELECT 1
          FROM creative_mission_events event
          WHERE event.workspace_id = $1
            AND event.mission_id = $3::uuid
            AND event.idempotency_key = 'admin-update:' || $4
        )
      RETURNING mission.id, target.origin_kind
    ),
    deleted_athletes AS (
      DELETE FROM creative_mission_athletes athlete
      USING changed
      WHERE athlete.workspace_id = $1
        AND athlete.mission_id = changed.id
        AND changed.origin_kind = 'admin'
    ),
    inserted_athletes AS (
      INSERT INTO creative_mission_athletes (
        workspace_id, mission_id, athlete_id, athlete_name_snapshot
      )
      SELECT $1, changed.id, athlete.id, athlete.name
      FROM changed
      CROSS JOIN LATERAL jsonb_to_recordset($20::jsonb) AS athlete (
        id text,
        name text
      )
      WHERE changed.origin_kind = 'admin'
      ON CONFLICT DO NOTHING
    ),
    inserted_event AS (
      INSERT INTO creative_mission_events (
        workspace_id, mission_id, action, from_state, to_state,
        actor, details, idempotency_key
      )
      SELECT $1, changed.id, 'admin_mission_updated', 'organize', 'organize',
             $2, '{}'::jsonb, 'admin-update:' || $4
      FROM changed
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM inserted_event) THEN 'changed'
      WHEN EXISTS (
        SELECT 1 FROM creative_mission_events
        WHERE workspace_id = $1
          AND mission_id = $3::uuid
          AND idempotency_key = 'admin-update:' || $4
      ) THEN 'unchanged'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      ELSE 'conflict'
    END AS outcome
  `, [
    workspaceId,
    clerkUserId,
    missionId,
    input.idempotencyKey,
    ...draftValues(input),
    JSON.stringify(input.athletes),
  ]) as Array<{ outcome: "changed" | "unchanged" | "not_found" | "conflict" }>;
  return rows[0]?.outcome ?? "conflict";
};

export const closeAdminOperationalMission = async ({
  workspaceId,
  clerkUserId,
  missionId,
  reason,
  idempotencyKey,
}: {
  workspaceId: string;
  clerkUserId: string;
  missionId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<"changed" | "unchanged" | "not_found" | "conflict"> => {
  if (!uuidPattern.test(missionId) || !uuidPattern.test(idempotencyKey)) {
    throw new Error("Requête invalide.");
  }
  const normalizedReason = requiredText(reason, "Motif", 1000);
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH target AS MATERIALIZED (
      SELECT *
      FROM creative_missions
      WHERE workspace_id = $1
        AND id = $3::uuid
      FOR UPDATE
    ),
    changed AS MATERIALIZED (
      UPDATE creative_missions mission
      SET business_state = 'closed_without_action',
          blocking_reason = $4,
          updated_at = NOW()
      FROM target
      WHERE mission.workspace_id = target.workspace_id
        AND mission.id = target.id
        AND target.origin_kind = 'admin'
        AND target.business_state IN ('review', 'organize')
        AND NOT EXISTS (
          SELECT 1
          FROM creative_mission_events event
          WHERE event.workspace_id = $1
            AND event.mission_id = $3::uuid
            AND event.idempotency_key = 'admin-close:' || $5
        )
      RETURNING mission.id, target.business_state
    ),
    inserted_event AS (
      INSERT INTO creative_mission_events (
        workspace_id, mission_id, action, from_state, to_state,
        actor, note, details, idempotency_key
      )
      SELECT $1, changed.id, 'closed_without_action', changed.business_state,
             'closed_without_action', $2, $4, '{}'::jsonb,
             'admin-close:' || $5
      FROM changed
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM inserted_event) THEN 'changed'
      WHEN EXISTS (
        SELECT 1 FROM creative_mission_events
        WHERE workspace_id = $1
          AND mission_id = $3::uuid
          AND idempotency_key = 'admin-close:' || $5
      ) THEN 'unchanged'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      ELSE 'conflict'
    END AS outcome
  `, [workspaceId, clerkUserId, missionId, normalizedReason, idempotencyKey]) as Array<{
    outcome: "changed" | "unchanged" | "not_found" | "conflict";
  }>;
  return rows[0]?.outcome ?? "conflict";
};

export const listOperationalCreativeCandidates = async ({
  workspaceId,
  from,
  to,
}: {
  workspaceId: string;
  from: string;
  to: string;
}): Promise<OperationalCreativeCandidate[]> => {
  const sql = createContentStorageClient();
  const [profiles, availability] = await Promise.all([
    sql.query(`
      SELECT id, display_name, creative_type, coverage_areas, specialties,
             general_availability
      FROM creative_profiles
      WHERE workspace_id = $1
        AND status = 'active'
      ORDER BY display_name, id
    `, [workspaceId]).then((rows) => rows as Array<{
      id: string;
      display_name: string;
      creative_type: OperationalCreativeCandidate["creativeType"];
      coverage_areas: string[];
      specialties: string[];
      general_availability: string | null;
    }>),
    listCreativeAvailability({ workspaceId, from, to }),
  ]);
  return profiles.map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    creativeType: profile.creative_type,
    coverageAreas: profile.coverage_areas,
    specialties: profile.specialties,
    generalAvailability: profile.general_availability,
    availabilityRules: availability.rules.filter(
      (rule) => rule.creativeProfileId === profile.id,
    ),
    availability: availability.occurrences.filter(
      (occurrence) => occurrence.creativeProfileId === profile.id,
    ),
    conflicts: availability.conflicts.filter(
      (conflict) => conflict.creativeProfileId === profile.id,
    ),
  }));
};
