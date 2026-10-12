import { createHash, randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type CreativeMissionExecutionStatus =
  | "accepted"
  | "in_progress"
  | "delivered"
  | "changes_requested"
  | "completed";

export type CreativeMissionExecutionEvent = {
  action: "started" | "delivered" | "changes_requested" | "completed";
  note: string | null;
  deliveryLinks: string[];
  createdAt: string;
};

export type CreativeMissionExecution = {
  status: CreativeMissionExecutionStatus;
  deliveryLinks: string[];
  deliveryNote: string | null;
  changeRequestNote: string | null;
  startedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  history: CreativeMissionExecutionEvent[];
};

export type CreativeMissionExecutionRow = {
  execution_status: CreativeMissionExecutionStatus | null;
  execution_delivery_links: unknown;
  execution_delivery_note: string | null;
  execution_change_request_note: string | null;
  execution_started_at: string | Date | null;
  execution_delivered_at: string | Date | null;
  execution_completed_at: string | Date | null;
  execution_history: Array<{
    action: CreativeMissionExecutionEvent["action"];
    note: string | null;
    deliveryLinks: unknown;
    createdAt: string | Date;
  }> | null;
};

export type CreativeMissionExecutionMutationOutcome =
  | "changed"
  | "unchanged"
  | "idempotency_conflict"
  | "mission_not_found"
  | "assignment_changed"
  | "access_denied"
  | "mission_not_ready"
  | "response_not_accepted"
  | "mission_cancelled"
  | "invalid_transition";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const normalizeNote = (value: unknown, required: boolean): string | null => {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error("La note est invalide.");
  }
  const note = typeof value === "string" ? value.trim() : "";
  if (required && !note) throw new Error("La note de livraison est obligatoire.");
  if (note.length > 2000) throw new Error("La note ne peut pas dépasser 2000 caractères.");
  return note || null;
};

const normalizeDeliveryLinks = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 10) {
    throw new Error("Les liens de livraison sont invalides.");
  }
  const links = value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error("Les liens de livraison sont invalides.");
    }
    let parsed: URL;
    try {
      parsed = new URL(entry.trim());
    } catch {
      throw new Error("Chaque lien de livraison doit être une URL HTTPS valide.");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error("Chaque lien de livraison doit être une URL HTTPS valide.");
    }
    return parsed.toString();
  });
  return [...new Set(links)];
};

export const parseCreativeMissionExecutionInput = (value: unknown): {
  action: "started" | "delivered";
  note: string | null;
  deliveryLinks: string[];
  idempotencyKey: string;
} => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) =>
      !["action", "note", "deliveryLinks", "idempotencyKey"].includes(key)
    )
    || (input.action !== "started" && input.action !== "delivered")
    || typeof input.idempotencyKey !== "string"
  ) {
    throw new Error("Requête invalide.");
  }
  const deliveryLinks = input.action === "delivered"
    ? normalizeDeliveryLinks(input.deliveryLinks ?? [])
    : [];
  return {
    action: input.action,
    note: normalizeNote(input.note, input.action === "delivered" && deliveryLinks.length === 0),
    deliveryLinks,
    idempotencyKey: normalizeUuid(input.idempotencyKey, "idempotencyKey"),
  };
};

const toIso = (value: string | Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

const safeLinks = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export const mapCreativeMissionExecution = (
  row: CreativeMissionExecutionRow,
  fallbackAccepted: boolean,
): CreativeMissionExecution | null => {
  if (!row.execution_status && !fallbackAccepted) return null;
  return {
    status: row.execution_status ?? "accepted",
    deliveryLinks: safeLinks(row.execution_delivery_links),
    deliveryNote: row.execution_delivery_note,
    changeRequestNote: row.execution_change_request_note,
    startedAt: toIso(row.execution_started_at),
    deliveredAt: toIso(row.execution_delivered_at),
    completedAt: toIso(row.execution_completed_at),
    history: (row.execution_history ?? []).map((event) => ({
      action: event.action,
      note: event.note,
      deliveryLinks: safeLinks(event.deliveryLinks),
      createdAt: new Date(event.createdAt).toISOString(),
    })),
  };
};

export const transitionCreativeMissionExecution = async (input: {
  workspaceId: string;
  creativeProfileId: string;
  clerkUserId: string;
  reference: string;
  action: "started" | "delivered";
  note: string | null;
  deliveryLinks: string[];
  idempotencyKey: string;
}): Promise<CreativeMissionExecutionMutationOutcome> => {
  const workspaceId = input.workspaceId.trim();
  const creativeProfileId = normalizeUuid(input.creativeProfileId, "creativeProfileId");
  const reference = normalizeReference(input.reference);
  const idempotencyKey = normalizeUuid(input.idempotencyKey, "idempotencyKey");
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({
      action: input.action,
      note: input.note,
      deliveryLinks: input.deliveryLinks,
    }))
    .digest("hex");
  const eventId = randomUUID();
  const projectionId = randomUUID();
  const sql = createContentStorageClient();

  const seedQuery = sql.query(`
    WITH locked_access AS MATERIALIZED (
      SELECT status
      FROM creative_access
      WHERE workspace_id = $1
        AND creative_profile_id = $2::uuid
        AND clerk_user_id = $3
      FOR UPDATE
    ),
    target AS MATERIALIZED (
      SELECT request.id AS service_request_id, mission.id AS mission_id,
             request.assigned_creative_profile_id,
             mission.status AS mission_status, profile.status AS profile_status,
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
    locked_response AS MATERIALIZED (
      SELECT response.status
      FROM creative_mission_responses response
      JOIN target ON target.service_request_id = response.service_request_id
      WHERE response.workspace_id = $1
        AND response.creative_profile_id = $2::uuid
      FOR UPDATE
    )
    INSERT INTO creative_mission_executions (
      id, workspace_id, service_request_id, mission_id, creative_profile_id,
      status, delivery_links, delivery_note, change_request_note,
      last_idempotency_key, updated_by_clerk_user_id
    )
    SELECT $6::uuid, $1, target.service_request_id, target.mission_id, $2::uuid,
           'accepted', '[]'::jsonb, NULL, NULL, $5::uuid, $3
    FROM target
    WHERE $7 = 'started'
      AND target.assigned_creative_profile_id = $2::uuid
      AND target.mission_status = 'ready'
      AND target.profile_status = 'active'
      AND target.access_status = 'active'
      AND (SELECT status FROM locked_response LIMIT 1) = 'accepted'
    ON CONFLICT (workspace_id, service_request_id) DO NOTHING
  `, [
    workspaceId,
    creativeProfileId,
    input.clerkUserId.trim(),
    reference,
    idempotencyKey,
    projectionId,
    input.action,
  ]);

  const transitionQuery = sql.query(`
    WITH locked_access AS MATERIALIZED (
      SELECT status
      FROM creative_access
      WHERE workspace_id = $1
        AND creative_profile_id = $2::uuid
        AND clerk_user_id = $3
      FOR UPDATE
    ),
    target AS MATERIALIZED (
      SELECT request.id AS service_request_id, mission.id AS mission_id,
             request.assigned_creative_profile_id,
             mission.status AS mission_status, profile.status AS profile_status,
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
    locked_response AS MATERIALIZED (
      SELECT response.status
      FROM creative_mission_responses response
      JOIN target ON target.service_request_id = response.service_request_id
      WHERE response.workspace_id = $1
        AND response.creative_profile_id = $2::uuid
      FOR UPDATE
    ),
    locked_execution AS MATERIALIZED (
      SELECT execution.status
      FROM creative_mission_executions execution
      JOIN target ON target.service_request_id = execution.service_request_id
      WHERE execution.workspace_id = $1
        AND execution.creative_profile_id = $2::uuid
      FOR UPDATE
    ),
    existing AS MATERIALIZED (
      SELECT request_fingerprint
      FROM creative_mission_execution_events event
      JOIN target ON target.service_request_id = event.service_request_id
      WHERE event.workspace_id = $1
        AND event.creative_profile_id = $2::uuid
        AND event.idempotency_key = $8::uuid
    ),
    inserted AS (
      INSERT INTO creative_mission_execution_events (
        id, workspace_id, service_request_id, mission_id, creative_profile_id,
        action, note, delivery_links_snapshot, authored_by_clerk_user_id,
        request_fingerprint, idempotency_key
      )
      SELECT $10::uuid, $1, target.service_request_id, target.mission_id, $2::uuid,
             $5, $6, $7::jsonb, $3, $9, $8::uuid
      FROM target
      JOIN locked_execution ON TRUE
      WHERE NOT EXISTS (SELECT 1 FROM existing)
        AND target.assigned_creative_profile_id = $2::uuid
        AND target.mission_status = 'ready'
        AND target.profile_status = 'active'
        AND target.access_status = 'active'
        AND (SELECT status FROM locked_response LIMIT 1) = 'accepted'
        AND (
          ($5 = 'started' AND locked_execution.status = 'accepted')
          OR ($5 = 'delivered' AND locked_execution.status IN ('in_progress', 'changes_requested'))
        )
      RETURNING service_request_id
    ),
    projected AS (
      UPDATE creative_mission_executions execution
      SET status = CASE WHEN $5 = 'started' THEN 'in_progress' ELSE 'delivered' END,
          delivery_links = CASE WHEN $5 = 'delivered' THEN $7::jsonb ELSE execution.delivery_links END,
          delivery_note = CASE WHEN $5 = 'delivered' THEN $6 ELSE execution.delivery_note END,
          last_idempotency_key = $8::uuid,
          updated_by_clerk_user_id = $3,
          started_at = CASE WHEN $5 = 'started' THEN NOW() ELSE execution.started_at END,
          delivered_at = CASE WHEN $5 = 'delivered' THEN NOW() ELSE execution.delivered_at END,
          updated_at = NOW()
      FROM inserted
      WHERE execution.workspace_id = $1
        AND execution.service_request_id = inserted.service_request_id
      RETURNING execution.service_request_id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM existing WHERE request_fingerprint = $9) THEN 'unchanged'
      WHEN EXISTS (SELECT 1 FROM existing) THEN 'idempotency_conflict'
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'mission_not_found'
      WHEN EXISTS (SELECT 1 FROM target WHERE mission_status = 'cancelled') THEN 'mission_cancelled'
      WHEN EXISTS (SELECT 1 FROM target WHERE assigned_creative_profile_id IS DISTINCT FROM $2::uuid)
        THEN 'assignment_changed'
      WHEN EXISTS (SELECT 1 FROM target WHERE profile_status <> 'active' OR access_status IS DISTINCT FROM 'active')
        THEN 'access_denied'
      WHEN EXISTS (SELECT 1 FROM target WHERE mission_status <> 'ready') THEN 'mission_not_ready'
      WHEN COALESCE((SELECT status FROM locked_response LIMIT 1), '') <> 'accepted'
        THEN 'response_not_accepted'
      WHEN EXISTS (SELECT 1 FROM projected) THEN 'changed'
      ELSE 'invalid_transition'
    END AS outcome
  `, [
    workspaceId,
    creativeProfileId,
    input.clerkUserId.trim(),
    reference,
    input.action,
    input.note,
    JSON.stringify(input.deliveryLinks),
    idempotencyKey,
    requestFingerprint,
    eventId,
  ]);

  const results = await sql.transaction(
    [seedQuery, transitionQuery],
    { isolationLevel: "Serializable" },
  );
  const row = (results[1] as Array<{ outcome: CreativeMissionExecutionMutationOutcome }>)[0];
  return row?.outcome ?? "mission_not_found";
};