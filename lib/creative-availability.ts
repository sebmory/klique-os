import { createContentStorageClient } from "@/lib/content-storage/db";

export type CreativeAvailabilityMissionType = "match_competition" | "media_day";
export type CreativeAvailabilityRecurrence = "none" | "weekly";

export type CreativeAvailabilityInput = {
  availabilityDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  recurrence: CreativeAvailabilityRecurrence;
  recurrenceUntil: string | null;
  exceptionDates: string[];
  regions: string[];
  missionTypes: CreativeAvailabilityMissionType[];
  internalComment: string | null;
};

export type CreativeAvailabilityRule = CreativeAvailabilityInput & {
  id: string;
  creativeProfileId: string;
  creativeDisplayName: string;
  planningTimezone: "Europe/Zurich";
  createdAt: string;
  updatedAt: string;
};

export type CreativeAvailabilityOccurrence = {
  ruleId: string;
  creativeProfileId: string;
  creativeDisplayName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  regions: string[];
  missionTypes: CreativeAvailabilityMissionType[];
  internalComment: string | null;
};

export type CreativeAvailabilityConflict = {
  briefId: string;
  creativeProfileId: string;
  creativeDisplayName: string;
  date: string;
  title: string;
  region: string;
};

type AvailabilityRow = {
  id: string;
  creative_profile_id: string;
  creative_display_name: string;
  availability_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  recurrence: CreativeAvailabilityRecurrence;
  recurrence_until: string | null;
  regions: string[];
  mission_types: CreativeAvailabilityMissionType[];
  internal_comment: string | null;
  exception_dates: string[];
  created_at: string | Date;
  updated_at: string | Date;
};

const civilDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isCivilDate = (value: string): boolean => {
  if (!civilDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

const addCivilDays = (value: string, days: number): string => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const civilDayDistance = (from: string, to: string): number => {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round((
    Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)
  ) / 86_400_000);
};

const normalizedTextArray = (
  value: unknown,
  field: string,
  maxItems: number,
  allowEmpty = false,
): string[] => {
  if (!Array.isArray(value)) throw new Error(`${field} invalide.`);
  const normalized = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "fr-CH"));
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maxItems) {
    throw new Error(`${field} invalide.`);
  }
  return normalized;
};

export const parseCreativeAvailabilityInput = (value: unknown): CreativeAvailabilityInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  const allowed = [
    "availabilityDate",
    "startTime",
    "endTime",
    "allDay",
    "recurrence",
    "recurrenceUntil",
    "exceptionDates",
    "regions",
    "missionTypes",
    "internalComment",
  ];
  if (!Object.keys(input).every((key) => allowed.includes(key))) {
    throw new Error("Requête invalide.");
  }
  const availabilityDate = String(input.availabilityDate ?? "").trim();
  if (!isCivilDate(availabilityDate)) throw new Error("Date invalide.");
  const allDay = input.allDay === true;
  const startTime = allDay ? null : String(input.startTime ?? "").trim();
  const endTime = allDay ? null : String(input.endTime ?? "").trim();
  if (!allDay && (!timePattern.test(startTime!) || !timePattern.test(endTime!) || endTime! <= startTime!)) {
    throw new Error("La plage horaire est invalide.");
  }
  const recurrence = input.recurrence === "weekly" ? "weekly" : input.recurrence === "none"
    ? "none"
    : null;
  if (!recurrence) throw new Error("Récurrence invalide.");
  const recurrenceUntil = recurrence === "weekly"
    ? String(input.recurrenceUntil ?? "").trim()
    : null;
  if (
    recurrence === "weekly"
    && (
      !recurrenceUntil
      || !isCivilDate(recurrenceUntil)
      || recurrenceUntil < availabilityDate
      || civilDayDistance(availabilityDate, recurrenceUntil) > 366
    )
  ) {
    throw new Error("La récurrence doit se terminer dans un délai maximal d’un an.");
  }
  const exceptionDates = normalizedTextArray(input.exceptionDates ?? [], "Exceptions", 53, true)
    .filter((date) => {
      if (!isCivilDate(date)) throw new Error("Date d’exception invalide.");
      return date >= availabilityDate && (!recurrenceUntil || date <= recurrenceUntil);
    });
  const regions = normalizedTextArray(input.regions, "Régions", 20);
  const missionTypes = normalizedTextArray(input.missionTypes, "Types de mission", 2);
  if (!missionTypes.every((type) => ["match_competition", "media_day"].includes(type))) {
    throw new Error("Type de mission invalide.");
  }
  const internalComment = typeof input.internalComment === "string"
    ? input.internalComment.trim() || null
    : null;
  if (internalComment && internalComment.length > 1000) {
    throw new Error("Le commentaire ne peut pas dépasser 1000 caractères.");
  }
  return {
    availabilityDate,
    startTime,
    endTime,
    allDay,
    recurrence,
    recurrenceUntil,
    exceptionDates,
    regions,
    missionTypes: missionTypes as CreativeAvailabilityMissionType[],
    internalComment,
  };
};

const mapRule = (row: AvailabilityRow): CreativeAvailabilityRule => ({
  id: row.id,
  creativeProfileId: row.creative_profile_id,
  creativeDisplayName: row.creative_display_name,
  availabilityDate: row.availability_date,
  startTime: row.start_time?.slice(0, 5) ?? null,
  endTime: row.end_time?.slice(0, 5) ?? null,
  allDay: row.all_day,
  recurrence: row.recurrence,
  recurrenceUntil: row.recurrence_until,
  exceptionDates: row.exception_dates ?? [],
  regions: row.regions,
  missionTypes: row.mission_types,
  internalComment: row.internal_comment,
  planningTimezone: "Europe/Zurich",
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

export const expandCreativeAvailabilityRules = (
  rules: CreativeAvailabilityRule[],
  from: string,
  to: string,
): CreativeAvailabilityOccurrence[] => {
  if (!isCivilDate(from) || !isCivilDate(to) || to < from || civilDayDistance(from, to) > 366) {
    throw new Error("Période de consultation invalide.");
  }
  return rules.flatMap((rule) => {
    const exceptions = new Set(rule.exceptionDates);
    const end = rule.recurrence === "weekly"
      ? rule.recurrenceUntil!
      : rule.availabilityDate;
    const occurrences: CreativeAvailabilityOccurrence[] = [];
    for (let date = rule.availabilityDate; date <= end; date = addCivilDays(date, 7)) {
      if (date >= from && date <= to && !exceptions.has(date)) {
        occurrences.push({
          ruleId: rule.id,
          creativeProfileId: rule.creativeProfileId,
          creativeDisplayName: rule.creativeDisplayName,
          date,
          startTime: rule.startTime,
          endTime: rule.endTime,
          allDay: rule.allDay,
          regions: rule.regions,
          missionTypes: rule.missionTypes,
          internalComment: rule.internalComment,
        });
      }
      if (rule.recurrence === "none") break;
    }
    return occurrences;
  }).sort((left, right) => (
    left.date.localeCompare(right.date)
    || left.creativeDisplayName.localeCompare(right.creativeDisplayName, "fr-CH")
    || String(left.startTime).localeCompare(String(right.startTime))
  ));
};

export const listCreativeAvailability = async ({
  workspaceId,
  creativeProfileId,
  from,
  to,
  region,
  missionType,
}: {
  workspaceId: string;
  creativeProfileId?: string;
  from: string;
  to: string;
  region?: string;
  missionType?: CreativeAvailabilityMissionType;
}): Promise<{
  rules: CreativeAvailabilityRule[];
  occurrences: CreativeAvailabilityOccurrence[];
  conflicts: CreativeAvailabilityConflict[];
}> => {
  if (!isCivilDate(from) || !isCivilDate(to) || to < from || civilDayDistance(from, to) > 366) {
    throw new Error("Période de consultation invalide.");
  }
  if (creativeProfileId && !uuidPattern.test(creativeProfileId)) {
    throw new Error("Créatif invalide.");
  }
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    SELECT rule.id, rule.creative_profile_id, profile.display_name AS creative_display_name,
           rule.availability_date::text, rule.start_time::text, rule.end_time::text,
           rule.all_day, rule.recurrence, rule.recurrence_until::text,
           rule.regions, rule.mission_types, rule.internal_comment,
           COALESCE(exception_dates.items, ARRAY[]::text[]) AS exception_dates,
           rule.created_at, rule.updated_at
    FROM creative_availability_rules rule
    JOIN creative_profiles profile
      ON profile.workspace_id = rule.workspace_id
     AND profile.id = rule.creative_profile_id
     AND profile.status = 'active'
    LEFT JOIN LATERAL (
      SELECT array_agg(exception.exception_date::text ORDER BY exception.exception_date) AS items
      FROM creative_availability_exceptions exception
      WHERE exception.workspace_id = rule.workspace_id
        AND exception.availability_rule_id = rule.id
    ) exception_dates ON TRUE
    WHERE rule.workspace_id = $1
      AND ($2::uuid IS NULL OR rule.creative_profile_id = $2::uuid)
      AND rule.availability_date <= $4::date
      AND COALESCE(rule.recurrence_until, rule.availability_date) >= $3::date
      AND ($5::text IS NULL OR $5 = ANY(rule.regions))
      AND ($6::text IS NULL OR $6 = ANY(rule.mission_types))
    ORDER BY rule.availability_date, profile.display_name, rule.start_time NULLS FIRST
  `, [
    workspaceId,
    creativeProfileId ?? null,
    from,
    to,
    region?.trim() || null,
    missionType ?? null,
  ]) as AvailabilityRow[];
  const rules = rows.map(mapRule);
  const conflicts = await sql.query(`
    SELECT brief.id AS brief_id, assignment.creative_profile_id,
           profile.display_name AS creative_display_name,
           brief.scheduled_date::text AS date, brief.title, brief.region
    FROM production_creative_assignments assignment
    JOIN production_creative_briefs brief
      ON brief.workspace_id = assignment.workspace_id
     AND brief.id = assignment.brief_id
    JOIN creative_profiles profile
      ON profile.workspace_id = assignment.workspace_id
     AND profile.id = assignment.creative_profile_id
    LEFT JOIN athlete_session_requests session_request
      ON session_request.workspace_id = brief.workspace_id
     AND session_request.id = brief.origin_request_id
     AND brief.origin_type = 'athlete_session_request'
    WHERE assignment.workspace_id = $1
      AND assignment.status = 'active'
      AND assignment.confirmation_status = 'confirmed'
      AND brief.scheduled_date BETWEEN $3::date AND $4::date
      AND ($2::uuid IS NULL OR assignment.creative_profile_id = $2::uuid)
      AND (
        brief.origin_type <> 'athlete_session_request'
        OR session_request.workflow_status IN ('confirmed', 'completed')
      )
    ORDER BY brief.scheduled_date, profile.display_name
  `, [workspaceId, creativeProfileId ?? null, from, to]) as Array<{
    brief_id: string;
    creative_profile_id: string;
    creative_display_name: string;
    date: string;
    title: string;
    region: string;
  }>;
  return {
    rules,
    occurrences: expandCreativeAvailabilityRules(rules, from, to),
    conflicts: conflicts.map((conflict) => ({
      briefId: conflict.brief_id,
      creativeProfileId: conflict.creative_profile_id,
      creativeDisplayName: conflict.creative_display_name,
      date: conflict.date,
      title: conflict.title,
      region: conflict.region,
    })),
  };
};

export const saveCreativeAvailability = async ({
  workspaceId,
  creativeProfileId,
  actorClerkUserId,
  ruleId,
  input,
}: {
  workspaceId: string;
  creativeProfileId: string;
  actorClerkUserId: string;
  ruleId?: string;
  input: CreativeAvailabilityInput;
}): Promise<string> => {
  if (!uuidPattern.test(creativeProfileId) || (ruleId && !uuidPattern.test(ruleId))) {
    throw new Error("Disponibilité invalide.");
  }
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH active_profile AS (
      SELECT id
      FROM creative_profiles
      WHERE workspace_id = $1 AND id = $2::uuid AND status = 'active'
    ), saved AS (
      INSERT INTO creative_availability_rules (
        id, workspace_id, creative_profile_id, availability_date,
        start_time, end_time, all_day, recurrence, recurrence_until,
        regions, mission_types, internal_comment,
        created_by_clerk_user_id, updated_by_clerk_user_id
      )
      SELECT COALESCE($3::uuid, gen_random_uuid()), $1, id, $4::date,
             $5::time, $6::time, $7, $8, $9::date,
             $10::text[], $11::text[], $12, $13, $13
      FROM active_profile
      ON CONFLICT (id) DO UPDATE SET
        availability_date = EXCLUDED.availability_date,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        all_day = EXCLUDED.all_day,
        recurrence = EXCLUDED.recurrence,
        recurrence_until = EXCLUDED.recurrence_until,
        regions = EXCLUDED.regions,
        mission_types = EXCLUDED.mission_types,
        internal_comment = EXCLUDED.internal_comment,
        updated_by_clerk_user_id = EXCLUDED.updated_by_clerk_user_id,
        updated_at = NOW()
      WHERE creative_availability_rules.workspace_id = $1
        AND creative_availability_rules.creative_profile_id = $2::uuid
      RETURNING id
    ), removed_exceptions AS (
      DELETE FROM creative_availability_exceptions exception
      USING saved
      WHERE exception.workspace_id = $1
        AND exception.availability_rule_id = saved.id
    ), inserted_exceptions AS (
      INSERT INTO creative_availability_exceptions (
        workspace_id, availability_rule_id, exception_date, created_by_clerk_user_id
      )
      SELECT $1, saved.id, exception_date::date, $13
      FROM saved
      CROSS JOIN unnest($14::text[]) AS exception_date
      RETURNING id
    )
    SELECT id FROM saved
  `, [
    workspaceId,
    creativeProfileId,
    ruleId ?? null,
    input.availabilityDate,
    input.startTime,
    input.endTime,
    input.allDay,
    input.recurrence,
    input.recurrenceUntil,
    input.regions,
    input.missionTypes,
    input.internalComment,
    actorClerkUserId,
    input.exceptionDates,
  ]) as Array<{ id: string }>;
  if (!rows[0]) throw new Error("Créatif ou disponibilité introuvable.");
  return rows[0].id;
};

export const deleteCreativeAvailability = async ({
  workspaceId,
  creativeProfileId,
  ruleId,
}: {
  workspaceId: string;
  creativeProfileId: string;
  ruleId: string;
}): Promise<boolean> => {
  if (!uuidPattern.test(creativeProfileId) || !uuidPattern.test(ruleId)) return false;
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    DELETE FROM creative_availability_rules
    WHERE workspace_id = $1
      AND creative_profile_id = $2::uuid
      AND id = $3::uuid
    RETURNING id
  `, [workspaceId, creativeProfileId, ruleId]);
  return Boolean(rows[0]);
};
