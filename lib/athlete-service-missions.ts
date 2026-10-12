import { createHash, randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  parseAthleteServiceMissionInput,
  type AthleteServiceMission,
  type AthleteServiceMissionEvent,
  type AthleteServiceMissionInput,
  type AthleteServiceMissionRecord,
  type AthleteServiceMissionStatus,
} from "@/lib/athlete-service-mission-domain";

export type AthleteServiceMissionMutationOutcome =
  | "changed"
  | "unchanged"
  | "missing_request"
  | "missing_mission"
  | "cancelled"
  | "idempotency_conflict";

export type AthleteServiceMissionMutationResult =
  | {
      outcome: "changed" | "unchanged";
      record: AthleteServiceMissionRecord;
    }
  | {
      outcome: Exclude<AthleteServiceMissionMutationOutcome, "changed" | "unchanged">;
      record: null;
    };

type MissionRow = {
  request_id: string;
  athlete_id: string;
  product_name: string;
  assigned_creative_profile_id: string | null;
  mission_id: string | null;
  reference_code: string | null;
  title: string | null;
  brief: string | null;
  sport_discipline: string | null;
  mission_type: AthleteServiceMission["missionType"] | null;
  mission_context: AthleteServiceMission["missionContext"] | null;
  location_name: string | null;
  location_details: string | null;
  mission_date: string | null;
  start_time: string | null;
  end_time: string | null;
  delivery_due_date: string | null;
  deliverables: string | null;
  compensation_type: AthleteServiceMission["compensationType"] | null;
  compensation_amount_chf_cents: number | string | null;
  expense_details: string | null;
  internal_admin_notes: string | null;
  mission_status: AthleteServiceMissionStatus | null;
  created_by_clerk_user_id: string | null;
  updated_by_clerk_user_id: string | null;
  mission_created_at: string | Date | null;
  mission_updated_at: string | Date | null;
  event_id: string | null;
  event_action: AthleteServiceMissionEvent["action"] | null;
  changed_fields: string[] | null;
  event_snapshot: Record<string, unknown> | null;
  event_author: string | null;
  event_created_at: string | Date | null;
  response_creative_profile_id: string | null;
  response_status: "accepted" | "refused" | null;
  response_note: string | null;
  response_updated_at: string | Date | null;
  response_history: Array<{
    action: "accepted" | "refused";
    note: string | null;
    createdAt: string;
  }>;
};

type OutcomeRow = {
  outcome: AthleteServiceMissionMutationOutcome;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} est requis.`);
  return normalized;
};

const normalizeUuid = (value: string, field: string): string => {
  const normalized = normalizeRequired(value, field).toLowerCase();
  if (!uuidPattern.test(normalized)) throw new Error(`${field} doit être un UUID.`);
  return normalized;
};

const toDateOnly = (value: string | null): string | null => {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Une date civile de mission est invalide.");
  }
  return value;
};

const toTime = (value: string | null): string | null => value?.slice(0, 5) ?? null;
const toIso = (value: string | Date): string => new Date(value).toISOString();

const mapMission = (row: MissionRow): AthleteServiceMission | null => {
  if (
    !row.mission_id
    || !row.reference_code
    || !row.title
    || !row.brief
    || !row.sport_discipline
    || !row.mission_type
    || !row.mission_context
    || !row.location_name
    || !row.mission_date
    || !row.deliverables
    || !row.compensation_type
    || !row.mission_status
    || !row.created_by_clerk_user_id
    || !row.updated_by_clerk_user_id
    || !row.mission_created_at
    || !row.mission_updated_at
  ) {
    return null;
  }
  return {
    id: row.mission_id,
    requestId: row.request_id,
    referenceCode: row.reference_code,
    title: row.title,
    brief: row.brief,
    sportDiscipline: row.sport_discipline,
    missionType: row.mission_type,
    missionContext: row.mission_context,
    locationName: row.location_name,
    locationDetails: row.location_details,
    missionDate: toDateOnly(row.mission_date)!,
    startTime: toTime(row.start_time),
    endTime: toTime(row.end_time),
    deliveryDueDate: toDateOnly(row.delivery_due_date),
    deliverables: row.deliverables,
    compensationType: row.compensation_type,
    compensationAmountChfCents: row.compensation_amount_chf_cents === null
      ? null
      : Number(row.compensation_amount_chf_cents),
    expenseDetails: row.expense_details,
    internalAdminNotes: row.internal_admin_notes,
    status: row.mission_status,
    createdByClerkUserId: row.created_by_clerk_user_id,
    updatedByClerkUserId: row.updated_by_clerk_user_id,
    createdAt: toIso(row.mission_created_at),
    updatedAt: toIso(row.mission_updated_at),
  };
};

const mapRecords = (rows: MissionRow[]): AthleteServiceMissionRecord[] => {
  const records = new Map<string, AthleteServiceMissionRecord>();
  for (const row of rows) {
    let record = records.get(row.request_id);
    if (!record) {
      record = {
        requestId: row.request_id,
        athleteId: row.athlete_id,
        productName: row.product_name,
        assignedCreativeProfileId: row.assigned_creative_profile_id,
        mission: mapMission(row),
        history: [],
        creativeResponse: {
          state: row.mission_status === "cancelled"
            ? "cancelled"
            : row.response_status && row.response_creative_profile_id !== row.assigned_creative_profile_id
              ? "assignment_changed"
              : row.response_status ?? "pending",
          note: row.response_note,
          respondedAt: row.response_updated_at
            ? new Date(row.response_updated_at).toISOString()
            : null,
          history: (row.response_history ?? []).map((event) => ({
            action: event.action,
            note: event.note,
            authoredBy: "creative",
            createdAt: new Date(event.createdAt).toISOString(),
          })),
        },
      };
      records.set(row.request_id, record);
    }
    if (
      row.event_id
      && row.event_action
      && row.changed_fields
      && row.event_snapshot
      && row.event_author
      && row.event_created_at
    ) {
      record.history.push({
        id: row.event_id,
        action: row.event_action,
        changedFields: row.changed_fields,
        snapshot: row.event_snapshot,
        authoredByClerkUserId: row.event_author,
        createdAt: toIso(row.event_created_at),
      });
    }
  }
  return [...records.values()];
};

const fingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const referenceCode = (): string => `KLIQUE-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export type AthleteServiceMissionRepository = {
  list: (input: {
    workspaceId: string;
    requestId?: string;
    athleteId?: string;
  }) => Promise<AthleteServiceMissionRecord[]>;
  save: (input: {
    workspaceId: string;
    requestId: string;
    missionId: string;
    referenceCode: string;
    mission: AthleteServiceMissionInput;
    idempotencyKey: string;
    requestFingerprint: string;
    authoredByClerkUserId: string;
  }) => Promise<AthleteServiceMissionMutationOutcome>;
  cancel: (input: {
    workspaceId: string;
    requestId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    authoredByClerkUserId: string;
  }) => Promise<AthleteServiceMissionMutationOutcome>;
};

const createRepository = (): AthleteServiceMissionRepository => {
  const sql = createContentStorageClient();
  return {
    async list({ workspaceId, requestId, athleteId }) {
      const rows = await sql.query(`
        SELECT request.id AS request_id, request.athlete_id, product.name AS product_name,
               request.assigned_creative_profile_id,
               mission.id AS mission_id, mission.reference_code, mission.title, mission.brief,
               mission.sport_discipline, mission.mission_type, mission.mission_context,
               mission.location_name, mission.location_details,
               mission.mission_date::text AS mission_date,
               mission.start_time, mission.end_time,
               mission.delivery_due_date::text AS delivery_due_date,
               mission.deliverables, mission.compensation_type,
               mission.compensation_amount_chf_cents, mission.expense_details,
               mission.internal_admin_notes, mission.status AS mission_status,
               mission.created_by_clerk_user_id, mission.updated_by_clerk_user_id,
               mission.created_at AS mission_created_at,
               mission.updated_at AS mission_updated_at,
               event.id AS event_id, event.action AS event_action,
               event.changed_fields, event.snapshot AS event_snapshot,
               event.authored_by_clerk_user_id AS event_author,
               event.created_at AS event_created_at,
               response.creative_profile_id AS response_creative_profile_id,
               response.status AS response_status, response.note AS response_note,
               response.updated_at AS response_updated_at,
               COALESCE(response_history.items, '[]'::jsonb) AS response_history
        FROM athlete_service_requests request
        JOIN athlete_service_products product ON product.code = request.product_code
        LEFT JOIN athlete_service_request_missions mission
          ON mission.workspace_id = request.workspace_id
         AND mission.service_request_id = request.id
        LEFT JOIN athlete_service_request_mission_events event
          ON event.workspace_id = request.workspace_id
         AND event.service_request_id = request.id
        LEFT JOIN LATERAL (
          SELECT current_response.*
          FROM creative_mission_responses current_response
          WHERE current_response.workspace_id = request.workspace_id
            AND current_response.service_request_id = request.id
          ORDER BY current_response.updated_at DESC, current_response.id DESC
          LIMIT 1
        ) response ON TRUE
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'action', response_event.action,
              'note', response_event.note,
              'createdAt', response_event.created_at
            )
            ORDER BY response_event.created_at DESC, response_event.id DESC
          ) AS items
          FROM creative_mission_response_events response_event
          WHERE response_event.workspace_id = request.workspace_id
            AND response_event.service_request_id = request.id
        ) response_history ON TRUE
        WHERE request.workspace_id = $1
          AND ($2::uuid IS NULL OR request.id = $2::uuid)
          AND ($3::text IS NULL OR request.athlete_id = $3)
        ORDER BY request.requested_at DESC, request.id, event.created_at DESC, event.id DESC
      `, [workspaceId, requestId ?? null, athleteId ?? null]) as MissionRow[];
      return mapRecords(rows);
    },
    async save(input) {
      const mission = input.mission;
      const rows = await sql.query(`
        WITH locked_request AS MATERIALIZED (
          SELECT id
          FROM athlete_service_requests
          WHERE workspace_id = $1 AND id = $2::uuid
          FOR UPDATE
        ),
        current_mission AS MATERIALIZED (
          SELECT mission.*
          FROM athlete_service_request_missions mission
          JOIN locked_request ON locked_request.id = mission.service_request_id
          WHERE mission.workspace_id = $1
        ),
        existing_event AS MATERIALIZED (
          SELECT request_fingerprint
          FROM athlete_service_request_mission_events
          WHERE workspace_id = $1
            AND service_request_id = $2::uuid
            AND idempotency_key = $23::uuid
        ),
        changed AS (
          INSERT INTO athlete_service_request_missions (
            id, workspace_id, service_request_id, reference_code, title, brief,
            sport_discipline, mission_type, mission_context, location_name,
            location_details, mission_date, start_time, end_time, delivery_due_date,
            deliverables, compensation_type, compensation_amount_chf_cents,
            expense_details, internal_admin_notes, status,
            created_by_clerk_user_id, updated_by_clerk_user_id
          )
          SELECT $3::uuid, $1, $2::uuid, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12::date, $13::time, $14::time, $15::date, $16, $17,
                 $18::integer, $19, $20, $21, $22, $22
          FROM locked_request
          WHERE NOT EXISTS (SELECT 1 FROM existing_event)
          ON CONFLICT (workspace_id, service_request_id)
          DO UPDATE SET
            title = EXCLUDED.title,
            brief = EXCLUDED.brief,
            sport_discipline = EXCLUDED.sport_discipline,
            mission_type = EXCLUDED.mission_type,
            mission_context = EXCLUDED.mission_context,
            location_name = EXCLUDED.location_name,
            location_details = EXCLUDED.location_details,
            mission_date = EXCLUDED.mission_date,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            delivery_due_date = EXCLUDED.delivery_due_date,
            deliverables = EXCLUDED.deliverables,
            compensation_type = EXCLUDED.compensation_type,
            compensation_amount_chf_cents = EXCLUDED.compensation_amount_chf_cents,
            expense_details = EXCLUDED.expense_details,
            internal_admin_notes = EXCLUDED.internal_admin_notes,
            status = EXCLUDED.status,
            updated_by_clerk_user_id = EXCLUDED.updated_by_clerk_user_id,
            updated_at = NOW()
          WHERE athlete_service_request_missions.status <> 'cancelled'
            AND ROW(
              athlete_service_request_missions.title,
              athlete_service_request_missions.brief,
              athlete_service_request_missions.sport_discipline,
              athlete_service_request_missions.mission_type,
              athlete_service_request_missions.mission_context,
              athlete_service_request_missions.location_name,
              athlete_service_request_missions.location_details,
              athlete_service_request_missions.mission_date,
              athlete_service_request_missions.start_time,
              athlete_service_request_missions.end_time,
              athlete_service_request_missions.delivery_due_date,
              athlete_service_request_missions.deliverables,
              athlete_service_request_missions.compensation_type,
              athlete_service_request_missions.compensation_amount_chf_cents,
              athlete_service_request_missions.expense_details,
              athlete_service_request_missions.internal_admin_notes,
              athlete_service_request_missions.status
            ) IS DISTINCT FROM ROW(
              EXCLUDED.title, EXCLUDED.brief, EXCLUDED.sport_discipline,
              EXCLUDED.mission_type, EXCLUDED.mission_context, EXCLUDED.location_name,
              EXCLUDED.location_details, EXCLUDED.mission_date, EXCLUDED.start_time,
              EXCLUDED.end_time, EXCLUDED.delivery_due_date, EXCLUDED.deliverables,
              EXCLUDED.compensation_type, EXCLUDED.compensation_amount_chf_cents,
              EXCLUDED.expense_details, EXCLUDED.internal_admin_notes, EXCLUDED.status
            )
          RETURNING *
        ),
        inserted_event AS (
          INSERT INTO athlete_service_request_mission_events (
            id, workspace_id, service_request_id, mission_id, action, changed_fields,
            snapshot, request_fingerprint, idempotency_key, authored_by_clerk_user_id
          )
          SELECT $24::uuid, $1, $2::uuid, changed.id,
                 CASE WHEN current_mission.id IS NULL THEN 'created' ELSE 'updated' END,
                 ARRAY_REMOVE(ARRAY[
                   CASE WHEN current_mission.id IS NULL OR current_mission.title IS DISTINCT FROM changed.title THEN 'title' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.brief IS DISTINCT FROM changed.brief THEN 'brief' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.sport_discipline IS DISTINCT FROM changed.sport_discipline THEN 'sportDiscipline' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.mission_type IS DISTINCT FROM changed.mission_type THEN 'missionType' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.mission_context IS DISTINCT FROM changed.mission_context THEN 'missionContext' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.location_name IS DISTINCT FROM changed.location_name THEN 'locationName' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.location_details IS DISTINCT FROM changed.location_details THEN 'locationDetails' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.mission_date IS DISTINCT FROM changed.mission_date THEN 'missionDate' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.start_time IS DISTINCT FROM changed.start_time THEN 'startTime' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.end_time IS DISTINCT FROM changed.end_time THEN 'endTime' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.delivery_due_date IS DISTINCT FROM changed.delivery_due_date THEN 'deliveryDueDate' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.deliverables IS DISTINCT FROM changed.deliverables THEN 'deliverables' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.compensation_type IS DISTINCT FROM changed.compensation_type THEN 'compensationType' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.compensation_amount_chf_cents IS DISTINCT FROM changed.compensation_amount_chf_cents THEN 'compensationAmountChfCents' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.expense_details IS DISTINCT FROM changed.expense_details THEN 'expenseDetails' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.internal_admin_notes IS DISTINCT FROM changed.internal_admin_notes THEN 'internalAdminNotes' END,
                   CASE WHEN current_mission.id IS NULL OR current_mission.status IS DISTINCT FROM changed.status THEN 'status' END
                 ], NULL),
                 jsonb_build_object(
                   'title', changed.title,
                   'brief', changed.brief,
                   'sportDiscipline', changed.sport_discipline,
                   'missionType', changed.mission_type,
                   'missionContext', changed.mission_context,
                   'locationName', changed.location_name,
                   'locationDetails', changed.location_details,
                   'missionDate', changed.mission_date,
                   'startTime', changed.start_time,
                   'endTime', changed.end_time,
                   'deliveryDueDate', changed.delivery_due_date,
                   'deliverables', changed.deliverables,
                   'compensationType', changed.compensation_type,
                   'compensationAmountChfCents', changed.compensation_amount_chf_cents,
                   'expenseDetails', changed.expense_details,
                   'internalAdminNotes', changed.internal_admin_notes,
                   'status', changed.status
                 ),
                 $25, $23::uuid, $22
          FROM changed
          LEFT JOIN current_mission ON TRUE
          RETURNING id
        )
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM existing_event)
            AND (SELECT request_fingerprint FROM existing_event) = $25 THEN 'unchanged'
          WHEN EXISTS (SELECT 1 FROM existing_event) THEN 'idempotency_conflict'
          WHEN NOT EXISTS (SELECT 1 FROM locked_request) THEN 'missing_request'
          WHEN EXISTS (SELECT 1 FROM current_mission WHERE status = 'cancelled') THEN 'cancelled'
          WHEN EXISTS (SELECT 1 FROM inserted_event) THEN 'changed'
          ELSE 'unchanged'
        END AS outcome
      `, [
        input.workspaceId,
        input.requestId,
        input.missionId,
        input.referenceCode,
        mission.title,
        mission.brief,
        mission.sportDiscipline,
        mission.missionType,
        mission.missionContext,
        mission.locationName,
        mission.locationDetails,
        mission.missionDate,
        mission.startTime,
        mission.endTime,
        mission.deliveryDueDate,
        mission.deliverables,
        mission.compensationType,
        mission.compensationAmountChfCents,
        mission.expenseDetails,
        mission.internalAdminNotes,
        mission.status,
        input.authoredByClerkUserId,
        input.idempotencyKey,
        randomUUID(),
        input.requestFingerprint,
      ]) as OutcomeRow[];
      return rows[0]?.outcome ?? "missing_request";
    },
    async cancel(input) {
      const rows = await sql.query(`
        WITH locked_request AS MATERIALIZED (
          SELECT id
          FROM athlete_service_requests
          WHERE workspace_id = $1 AND id = $2::uuid
          FOR UPDATE
        ),
        current_mission AS MATERIALIZED (
          SELECT mission.*
          FROM athlete_service_request_missions mission
          JOIN locked_request ON locked_request.id = mission.service_request_id
          WHERE mission.workspace_id = $1
        ),
        existing_event AS MATERIALIZED (
          SELECT request_fingerprint
          FROM athlete_service_request_mission_events
          WHERE workspace_id = $1
            AND service_request_id = $2::uuid
            AND idempotency_key = $4::uuid
        ),
        changed AS (
          UPDATE athlete_service_request_missions mission
          SET status = 'cancelled', updated_by_clerk_user_id = $3, updated_at = NOW()
          FROM current_mission
          WHERE mission.workspace_id = $1
            AND mission.service_request_id = $2::uuid
            AND current_mission.status <> 'cancelled'
            AND NOT EXISTS (SELECT 1 FROM existing_event)
          RETURNING mission.*
        ),
        inserted_event AS (
          INSERT INTO athlete_service_request_mission_events (
            id, workspace_id, service_request_id, mission_id, action, changed_fields,
            snapshot, request_fingerprint, idempotency_key, authored_by_clerk_user_id
          )
          SELECT $5::uuid, $1, $2::uuid, changed.id, 'cancelled', ARRAY['status'],
                 jsonb_build_object('status', 'cancelled'),
                 $6, $4::uuid, $3
          FROM changed
          RETURNING id
        )
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM existing_event)
            AND (SELECT request_fingerprint FROM existing_event) = $6 THEN 'unchanged'
          WHEN EXISTS (SELECT 1 FROM existing_event) THEN 'idempotency_conflict'
          WHEN NOT EXISTS (SELECT 1 FROM locked_request) THEN 'missing_request'
          WHEN NOT EXISTS (SELECT 1 FROM current_mission) THEN 'missing_mission'
          WHEN EXISTS (SELECT 1 FROM current_mission WHERE status = 'cancelled') THEN 'unchanged'
          WHEN EXISTS (SELECT 1 FROM inserted_event) THEN 'changed'
          ELSE 'unchanged'
        END AS outcome
      `, [
        input.workspaceId,
        input.requestId,
        input.authoredByClerkUserId,
        input.idempotencyKey,
        randomUUID(),
        input.requestFingerprint,
      ]) as OutcomeRow[];
      return rows[0]?.outcome ?? "missing_request";
    },
  };
};

export const listAthleteServiceMissions = async ({
  workspaceId,
  requestId,
  athleteId,
  repository = createRepository(),
}: {
  workspaceId: string;
  requestId?: string;
  athleteId?: string;
  repository?: AthleteServiceMissionRepository;
}): Promise<AthleteServiceMissionRecord[]> => repository.list({
  workspaceId: normalizeRequired(workspaceId, "workspaceId"),
  ...(requestId ? { requestId: normalizeUuid(requestId, "requestId") } : {}),
  ...(athleteId ? { athleteId: normalizeRequired(athleteId, "athleteId") } : {}),
});

const loadChangedRecord = async (
  repository: AthleteServiceMissionRepository,
  workspaceId: string,
  requestId: string,
  outcome: AthleteServiceMissionMutationOutcome,
): Promise<AthleteServiceMissionMutationResult> => {
  if (outcome !== "changed" && outcome !== "unchanged") {
    return { outcome, record: null };
  }
  const record = (await repository.list({ workspaceId, requestId }))[0];
  if (!record) return { outcome: "missing_request", record: null };
  return { outcome, record };
};

export const saveAthleteServiceMission = async ({
  workspaceId,
  requestId,
  mission,
  idempotencyKey,
  authoredByClerkUserId,
  repository = createRepository(),
}: {
  workspaceId: string;
  requestId: string;
  mission: AthleteServiceMissionInput;
  idempotencyKey: string;
  authoredByClerkUserId: string;
  repository?: AthleteServiceMissionRepository;
}): Promise<AthleteServiceMissionMutationResult> => {
  const validatedMission = parseAthleteServiceMissionInput(mission);
  const normalized = {
    workspaceId: normalizeRequired(workspaceId, "workspaceId"),
    requestId: normalizeUuid(requestId, "requestId"),
    idempotencyKey: normalizeUuid(idempotencyKey, "idempotencyKey"),
    authoredByClerkUserId: normalizeRequired(authoredByClerkUserId, "authoredByClerkUserId"),
  };
  const outcome = await repository.save({
    ...normalized,
    missionId: randomUUID(),
    referenceCode: referenceCode(),
    mission: validatedMission,
    requestFingerprint: fingerprint({ action: "save", mission: validatedMission }),
  });
  return loadChangedRecord(repository, normalized.workspaceId, normalized.requestId, outcome);
};

export const cancelAthleteServiceMission = async ({
  workspaceId,
  requestId,
  idempotencyKey,
  authoredByClerkUserId,
  repository = createRepository(),
}: {
  workspaceId: string;
  requestId: string;
  idempotencyKey: string;
  authoredByClerkUserId: string;
  repository?: AthleteServiceMissionRepository;
}): Promise<AthleteServiceMissionMutationResult> => {
  const normalized = {
    workspaceId: normalizeRequired(workspaceId, "workspaceId"),
    requestId: normalizeUuid(requestId, "requestId"),
    idempotencyKey: normalizeUuid(idempotencyKey, "idempotencyKey"),
    authoredByClerkUserId: normalizeRequired(authoredByClerkUserId, "authoredByClerkUserId"),
  };
  const outcome = await repository.cancel({
    ...normalized,
    requestFingerprint: fingerprint({ action: "cancel" }),
  });
  return loadChangedRecord(repository, normalized.workspaceId, normalized.requestId, outcome);
};
