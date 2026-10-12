import { createHash, randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  mapCreativeMissionExecution,
  type CreativeMissionExecution,
  type CreativeMissionExecutionRow,
} from "@/lib/creative-mission-execution";

export type CreativeMissionResponseStatus = "accepted" | "refused";
export type CreativeMissionResponseDisplayState =
  | "pending"
  | "accepted"
  | "refused"
  | "assignment_changed"
  | "cancelled";

export type CreativeMissionResponseEvent = {
  action: CreativeMissionResponseStatus;
  note: string | null;
  authoredBy: "creative";
  createdAt: string;
};

export type CreativeMissionResponse = {
  state: CreativeMissionResponseDisplayState;
  note: string | null;
  respondedAt: string | null;
  history: CreativeMissionResponseEvent[];
};

export type CreativePortalMission = {
  reference: string;
  title: string;
  discipline: string;
  missionType: string;
  missionContext: string;
  missionDate: string;
  startTime: string | null;
  endTime: string | null;
  locationName: string;
  locationDetails: string | null;
  brief: string;
  deliverables: string;
  deliveryDueDate: string | null;
  compensationType: string;
  compensationAmountChfCents: number | null;
  expenseDetails: string | null;
  missionStatus: "ready" | "cancelled";
  response: CreativeMissionResponse;
  execution?: CreativeMissionExecution | null;
};

export type CreativeMissionResponseMutationOutcome =
  | "changed"
  | "unchanged"
  | "idempotency_conflict"
  | "mission_not_found"
  | "assignment_changed"
  | "access_denied"
  | "mission_cancelled";

type PortalMissionRow = CreativeMissionExecutionRow & {
  reference_code: string;
  title: string;
  sport_discipline: string;
  mission_type: string;
  mission_context: string;
  mission_date: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string;
  location_details: string | null;
  brief: string;
  deliverables: string;
  delivery_due_date: string | null;
  compensation_type: string;
  compensation_amount_chf_cents: number | string | null;
  expense_details: string | null;
  mission_status: "ready" | "cancelled";
  response_status: CreativeMissionResponseStatus | null;
  response_note: string | null;
  response_updated_at: string | Date | null;
  response_history: Array<{
    action: CreativeMissionResponseStatus;
    note: string | null;
    createdAt: string;
  }>;
};

type AdminResponseRow = {
  current_creative_profile_id: string | null;
  response_creative_profile_id: string | null;
  mission_status: "draft" | "ready" | "cancelled" | null;
  response_status: CreativeMissionResponseStatus | null;
  response_note: string | null;
  response_updated_at: string | Date | null;
  response_history: Array<{
    action: CreativeMissionResponseStatus;
    note: string | null;
    createdAt: string;
  }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value: string, field: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new Error(`${field} doit être un UUID.`);
  return normalized;
};

const normalizeReference = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  if (!/^KLIQUE-[A-Z0-9]{8}$/.test(normalized)) {
    throw new Error("La référence de mission est invalide.");
  }
  return normalized;
};

export const parseCreativeMissionResponseInput = (value: unknown): {
  action: CreativeMissionResponseStatus;
  note: string | null;
  idempotencyKey: string;
} => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  if (
    !Object.keys(input).every((key) => ["action", "note", "idempotencyKey"].includes(key))
    || (input.action !== "accepted" && input.action !== "refused")
    || typeof input.idempotencyKey !== "string"
    || (input.note !== undefined && input.note !== null && typeof input.note !== "string")
  ) {
    throw new Error("Requête invalide.");
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (input.action === "refused" && !note) {
    throw new Error("Le motif du refus est obligatoire.");
  }
  if (note.length > 500) {
    throw new Error("La note ne peut pas dépasser 500 caractères.");
  }
  return {
    action: input.action,
    note: note || null,
    idempotencyKey: normalizeUuid(input.idempotencyKey, "idempotencyKey"),
  };
};

const mapHistory = (history: PortalMissionRow["response_history"] | null | undefined) =>
  (Array.isArray(history) ? history : []).map((event) => ({
    action: event.action,
    note: event.note,
    authoredBy: "creative" as const,
    createdAt: new Date(event.createdAt).toISOString(),
  }));

const responseState = (row: AdminResponseRow): CreativeMissionResponseDisplayState => {
  if (row.mission_status === "cancelled") return "cancelled";
  if (
    row.response_status
    && row.response_creative_profile_id !== row.current_creative_profile_id
  ) {
    return "assignment_changed";
  }
  return row.response_status ?? "pending";
};

const mapResponse = (row: AdminResponseRow): CreativeMissionResponse => ({
  state: responseState(row),
  note: row.response_note,
  respondedAt: row.response_updated_at
    ? new Date(row.response_updated_at).toISOString()
    : null,
  history: mapHistory(row.response_history),
});

export type CreativeMissionRepository = {
  listForCreative: (input: {
    workspaceId: string;
    creativeProfileId: string;
  }) => Promise<CreativePortalMission[]>;
  getAdminResponse: (input: {
    workspaceId: string;
    requestId: string;
  }) => Promise<CreativeMissionResponse | null>;
  respond: (input: {
    workspaceId: string;
    creativeProfileId: string;
    clerkUserId: string;
    reference: string;
    action: CreativeMissionResponseStatus;
    note: string | null;
    idempotencyKey: string;
  }) => Promise<CreativeMissionResponseMutationOutcome>;
};

export const createCreativeMissionRepository = (): CreativeMissionRepository => {
  const sql = createContentStorageClient();
  return {
    async listForCreative({ workspaceId, creativeProfileId }) {
      const rows = await sql.query(`
        SELECT mission.reference_code, mission.title, mission.sport_discipline,
               mission.mission_type, mission.mission_context,
               mission.mission_date::text, mission.start_time, mission.end_time,
               mission.location_name, mission.location_details, mission.brief,
               mission.deliverables, mission.delivery_due_date::text,
               mission.compensation_type, mission.compensation_amount_chf_cents,
               mission.expense_details, mission.status AS mission_status,
               response.status AS response_status, response.note AS response_note,
               response.updated_at AS response_updated_at,
               COALESCE(history.items, '[]'::jsonb) AS response_history,
               execution.status AS execution_status,
               COALESCE(execution.delivery_links, '[]'::jsonb) AS execution_delivery_links,
               execution.delivery_note AS execution_delivery_note,
               execution.change_request_note AS execution_change_request_note,
               execution.started_at AS execution_started_at,
               execution.delivered_at AS execution_delivered_at,
               execution.completed_at AS execution_completed_at,
               COALESCE(execution_history.items, '[]'::jsonb) AS execution_history
        FROM athlete_service_requests request
        JOIN athlete_service_request_missions mission
          ON mission.workspace_id = request.workspace_id
         AND mission.service_request_id = request.id
        LEFT JOIN creative_mission_responses response
          ON response.workspace_id = request.workspace_id
         AND response.service_request_id = request.id
         AND response.creative_profile_id = $2::uuid
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'action', event.action,
              'note', event.note,
              'createdAt', event.created_at
            )
            ORDER BY event.created_at DESC, event.id DESC
          ) AS items
          FROM creative_mission_response_events event
          WHERE event.workspace_id = request.workspace_id
            AND event.service_request_id = request.id
            AND event.creative_profile_id = $2::uuid
        ) history ON TRUE
        LEFT JOIN creative_mission_executions execution
          ON execution.workspace_id = request.workspace_id
         AND execution.service_request_id = request.id
         AND execution.creative_profile_id = $2::uuid
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'action', event.action,
              'note', event.note,
              'deliveryLinks', event.delivery_links_snapshot,
              'createdAt', event.created_at
            )
            ORDER BY event.created_at DESC, event.id DESC
          ) AS items
          FROM creative_mission_execution_events event
          WHERE event.workspace_id = request.workspace_id
            AND event.service_request_id = request.id
            AND event.creative_profile_id = $2::uuid
        ) execution_history ON TRUE
        WHERE request.workspace_id = $1
          AND request.assigned_creative_profile_id = $2::uuid
          AND mission.status IN ('ready', 'cancelled')
        ORDER BY mission.mission_date ASC, mission.start_time ASC NULLS LAST, mission.reference_code
      `, [workspaceId, normalizeUuid(creativeProfileId, "creativeProfileId")]) as PortalMissionRow[];

      return rows.map((row) => ({
        reference: row.reference_code,
        title: row.title,
        discipline: row.sport_discipline,
        missionType: row.mission_type,
        missionContext: row.mission_context,
        missionDate: row.mission_date,
        startTime: row.start_time?.slice(0, 5) ?? null,
        endTime: row.end_time?.slice(0, 5) ?? null,
        locationName: row.location_name,
        locationDetails: row.location_details,
        brief: row.brief,
        deliverables: row.deliverables,
        deliveryDueDate: row.delivery_due_date,
        compensationType: row.compensation_type,
        compensationAmountChfCents: row.compensation_amount_chf_cents === null
          ? null
          : Number(row.compensation_amount_chf_cents),
        expenseDetails: row.expense_details,
        missionStatus: row.mission_status,
        response: mapResponse({
          current_creative_profile_id: creativeProfileId,
          response_creative_profile_id: row.response_status ? creativeProfileId : null,
          mission_status: row.mission_status,
          response_status: row.response_status,
          response_note: row.response_note,
          response_updated_at: row.response_updated_at,
          response_history: row.response_history,
        }),
        execution: mapCreativeMissionExecution(
          row,
          row.mission_status === "ready" && row.response_status === "accepted",
        ),
      }));
    },

    async getAdminResponse({ workspaceId, requestId }) {
      const rows = await sql.query(`
        SELECT request.assigned_creative_profile_id AS current_creative_profile_id,
               mission.status AS mission_status,
               response.creative_profile_id AS response_creative_profile_id,
               response.status AS response_status, response.note AS response_note,
               response.updated_at AS response_updated_at,
               COALESCE(history.items, '[]'::jsonb) AS response_history
        FROM athlete_service_requests request
        LEFT JOIN athlete_service_request_missions mission
          ON mission.workspace_id = request.workspace_id
         AND mission.service_request_id = request.id
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
              'action', event.action,
              'note', event.note,
              'createdAt', event.created_at
            )
            ORDER BY event.created_at DESC, event.id DESC
          ) AS items
          FROM creative_mission_response_events event
          WHERE event.workspace_id = request.workspace_id
            AND event.service_request_id = request.id
        ) history ON TRUE
        WHERE request.workspace_id = $1 AND request.id = $2::uuid
        LIMIT 1
      `, [workspaceId, normalizeUuid(requestId, "requestId")]) as AdminResponseRow[];
      return rows[0] ? mapResponse(rows[0]) : null;
    },

    async respond(input) {
      const workspaceId = input.workspaceId.trim();
      const creativeProfileId = normalizeUuid(input.creativeProfileId, "creativeProfileId");
      const reference = normalizeReference(input.reference);
      const idempotencyKey = normalizeUuid(input.idempotencyKey, "idempotencyKey");
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ action: input.action, note: input.note }))
        .digest("hex");
      const eventId = randomUUID();
      const responseId = randomUUID();

      const query = sql.query(`
        WITH locked_access AS MATERIALIZED (
          SELECT status
          FROM creative_access
          WHERE workspace_id = $1
            AND creative_profile_id = $2::uuid
            AND clerk_user_id = $3
          FOR UPDATE
        ),
        target AS (
          SELECT request.id AS service_request_id, mission.id AS mission_id,
                 request.assigned_creative_profile_id, mission.status AS mission_status,
                 profile.status AS profile_status,
                 (SELECT status FROM locked_access LIMIT 1) AS access_status
          FROM athlete_service_request_missions mission
          JOIN athlete_service_requests request
            ON request.workspace_id = mission.workspace_id
           AND request.id = mission.service_request_id
          JOIN creative_profiles profile
            ON profile.workspace_id = request.workspace_id
           AND profile.id = $2::uuid
          WHERE mission.workspace_id = $1
            AND mission.reference_code = $4
          FOR UPDATE OF request, mission, profile
        ),
        existing AS (
          SELECT request_fingerprint
          FROM creative_mission_response_events event
          JOIN target ON target.service_request_id = event.service_request_id
          WHERE event.workspace_id = $1
            AND event.creative_profile_id = $2::uuid
            AND event.idempotency_key = $7::uuid
        ),
        inserted AS (
          INSERT INTO creative_mission_response_events (
            id, workspace_id, service_request_id, mission_id, creative_profile_id,
            action, note, author_clerk_user_id, request_fingerprint,
            idempotency_key, created_at
          )
          SELECT $8::uuid, $1, target.service_request_id, target.mission_id, $2::uuid,
                 $5, $6, $3, $9, $7::uuid, NOW()
          FROM target
          WHERE NOT EXISTS (SELECT 1 FROM existing)
            AND target.assigned_creative_profile_id = $2::uuid
            AND target.profile_status = 'active'
            AND target.access_status = 'active'
            AND NOT ($5 = 'accepted' AND target.mission_status = 'cancelled')
          RETURNING service_request_id
        ),
        projected AS (
          INSERT INTO creative_mission_responses (
            id, workspace_id, service_request_id, mission_id, creative_profile_id,
            status, note, author_clerk_user_id, last_idempotency_key,
            created_at, updated_at
          )
          SELECT $10::uuid, $1, inserted.service_request_id, target.mission_id, $2::uuid,
                 $5, $6, $3, $7::uuid, NOW(), NOW()
          FROM inserted
          JOIN target ON target.service_request_id = inserted.service_request_id
          ON CONFLICT (workspace_id, service_request_id, creative_profile_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            note = EXCLUDED.note,
            author_clerk_user_id = EXCLUDED.author_clerk_user_id,
            last_idempotency_key = EXCLUDED.last_idempotency_key,
            updated_at = NOW()
          RETURNING service_request_id
        )
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM existing WHERE request_fingerprint = $9) THEN 'unchanged'
          WHEN EXISTS (SELECT 1 FROM existing) THEN 'idempotency_conflict'
          WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'mission_not_found'
          WHEN EXISTS (
            SELECT 1 FROM target
            WHERE profile_status <> 'active' OR access_status IS DISTINCT FROM 'active'
          ) THEN 'access_denied'
          WHEN EXISTS (
            SELECT 1 FROM target WHERE assigned_creative_profile_id IS DISTINCT FROM $2::uuid
          ) THEN 'assignment_changed'
          WHEN $5 = 'accepted' AND EXISTS (
            SELECT 1 FROM target WHERE mission_status = 'cancelled'
          ) THEN 'mission_cancelled'
          WHEN EXISTS (SELECT 1 FROM projected) THEN 'changed'
          ELSE 'access_denied'
        END AS outcome
      `, [
        workspaceId,
        creativeProfileId,
        input.clerkUserId,
        reference,
        input.action,
        input.note,
        idempotencyKey,
        eventId,
        fingerprint,
        responseId,
      ]);
      const results = await sql.transaction([query], { isolationLevel: "Serializable" });
      const row = (results[0] as Array<{ outcome: CreativeMissionResponseMutationOutcome }>)[0];
      return row?.outcome ?? "access_denied";
    },
  };
};

export const listCreativePortalMissions = (input: {
  workspaceId: string;
  creativeProfileId: string;
}) => createCreativeMissionRepository().listForCreative(input);

export const getAdminCreativeMissionResponse = (input: {
  workspaceId: string;
  requestId: string;
}) => createCreativeMissionRepository().getAdminResponse(input);

export const respondToCreativeMission = (input: {
  workspaceId: string;
  creativeProfileId: string;
  clerkUserId: string;
  reference: string;
  action: CreativeMissionResponseStatus;
  note: string | null;
  idempotencyKey: string;
}) => createCreativeMissionRepository().respond(input);
