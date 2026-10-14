import { createHash, randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  buildAthleteServiceRequestCommercialCompletionTransaction,
  readAthleteServiceRequestCommercialCompletionResult,
  type AthleteServiceRequestCommercialCompletionOutcome,
} from "@/lib/athlete-service-request-commercial-completion";

export type AdminCreativeMissionReviewAction = "changes_requested" | "completed";

export type AdminCreativeMissionReviewOutcome =
  | "changed"
  | "unchanged"
  | "idempotency_conflict"
  | "request_not_in_progress"
  | "mission_not_found"
  | "mission_not_ready"
  | "assignment_changed"
  | "response_not_accepted"
  | "execution_not_delivered"
  | "pack_not_supported"
  | "commercial_conflict"
  | "insufficient_rights"
  | "ineligible"
  | "invalid_transition";

export type AdminCreativeMissionReviewResult = {
  outcome: AdminCreativeMissionReviewOutcome;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value: string, field: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new Error(`${field} doit être un UUID.`);
  return normalized;
};

const normalizeNote = (value: unknown, required: boolean): string | null => {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new Error("Le motif est invalide.");
  }
  const note = typeof value === "string" ? value.trim() : "";
  if (required && !note) throw new Error("Le motif des modifications est obligatoire.");
  if (note.length > 2000) throw new Error("Le motif ne peut pas dépasser 2000 caractères.");
  return note || null;
};

export const parseAdminCreativeMissionReviewInput = (value: unknown): {
  requestId: string;
  action: AdminCreativeMissionReviewAction;
  note: string | null;
  idempotencyKey: string;
} => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) =>
      !["requestId", "action", "note", "idempotencyKey"].includes(key)
    )
    || (input.action !== "changes_requested" && input.action !== "completed")
    || typeof input.requestId !== "string"
    || typeof input.idempotencyKey !== "string"
  ) {
    throw new Error("Requête invalide.");
  }
  return {
    requestId: normalizeUuid(input.requestId, "requestId"),
    action: input.action,
    note: normalizeNote(input.note, input.action === "changes_requested"),
    idempotencyKey: normalizeUuid(input.idempotencyKey, "idempotencyKey"),
  };
};

const fingerprint = (input: {
  requestId: string;
  action: AdminCreativeMissionReviewAction;
  note: string | null;
}): string => createHash("sha256").update(JSON.stringify(input)).digest("hex");

type ReviewRow = {
  outcome:
    | AdminCreativeMissionReviewOutcome
    | "commercial_not_completed";
};

const mapCommercialFailure = (
  outcome: AthleteServiceRequestCommercialCompletionOutcome,
): AdminCreativeMissionReviewOutcome => {
  if (outcome === "insufficient_rights") return "insufficient_rights";
  if (outcome === "ineligible") return "ineligible";
  return "commercial_conflict";
};

const requestChanges = async (input: {
  workspaceId: string;
  requestId: string;
  note: string;
  idempotencyKey: string;
  clerkUserId: string;
  requestFingerprint: string;
}): Promise<AdminCreativeMissionReviewResult> => {
  const sql = createContentStorageClient();
  const eventId = randomUUID();
  let resultIndex = 0;
  const results = await sql.transaction((transactionSql) => {
    const lockRequest = transactionSql`
      SELECT request.id
      FROM athlete_service_requests request
      WHERE request.workspace_id = ${input.workspaceId}
        AND request.id = ${input.requestId}::uuid
      FOR UPDATE OF request
    `;
    const lockMission = transactionSql`
      SELECT mission.id
      FROM athlete_service_request_missions mission
      WHERE mission.workspace_id = ${input.workspaceId}
        AND mission.service_request_id = ${input.requestId}::uuid
      FOR UPDATE OF mission
    `;
    const lockResponse = transactionSql`
      SELECT response.id
      FROM creative_mission_responses response
      WHERE response.workspace_id = ${input.workspaceId}
        AND response.service_request_id = ${input.requestId}::uuid
      FOR UPDATE OF response
    `;
    const lockExecution = transactionSql`
      SELECT execution.id
      FROM creative_mission_executions execution
      WHERE execution.workspace_id = ${input.workspaceId}
        AND execution.service_request_id = ${input.requestId}::uuid
      FOR UPDATE OF execution
    `;
    const review = transactionSql`
      WITH target AS MATERIALIZED (
        SELECT request.id AS service_request_id,
               request.assigned_creative_profile_id,
               mission.id AS mission_id,
               mission.status AS mission_status,
               response.status AS response_status,
               response.creative_profile_id AS response_creative_profile_id,
               execution.status AS execution_status,
               execution.creative_profile_id AS execution_creative_profile_id,
               execution.delivery_links,
               execution.delivery_note,
               execution.change_request_note
        FROM athlete_service_requests request
        JOIN athlete_service_request_missions mission
          ON mission.workspace_id = request.workspace_id
         AND mission.service_request_id = request.id
        LEFT JOIN creative_mission_responses response
          ON response.workspace_id = request.workspace_id
         AND response.service_request_id = request.id
         AND response.creative_profile_id = request.assigned_creative_profile_id
        LEFT JOIN creative_mission_executions execution
          ON execution.workspace_id = request.workspace_id
         AND execution.service_request_id = request.id
        WHERE request.workspace_id = ${input.workspaceId}
          AND request.id = ${input.requestId}::uuid
      ),
      existing AS MATERIALIZED (
        SELECT event.request_fingerprint
        FROM creative_mission_execution_events event
        WHERE event.workspace_id = ${input.workspaceId}
          AND event.service_request_id = ${input.requestId}::uuid
          AND event.idempotency_key = ${input.idempotencyKey}::uuid
      ),
      inserted AS (
        INSERT INTO creative_mission_execution_events (
          id, workspace_id, service_request_id, mission_id, creative_profile_id,
          action, note, delivery_links_snapshot, authored_by_clerk_user_id,
          request_fingerprint, idempotency_key
        )
        SELECT ${eventId}::uuid, ${input.workspaceId}, target.service_request_id,
               target.mission_id, target.execution_creative_profile_id,
               'changes_requested', ${input.note}, target.delivery_links,
               ${input.clerkUserId}, ${input.requestFingerprint},
               ${input.idempotencyKey}::uuid
        FROM target
        WHERE NOT EXISTS (SELECT 1 FROM existing)
          AND target.mission_status = 'ready'
          AND target.assigned_creative_profile_id = target.execution_creative_profile_id
          AND target.response_creative_profile_id = target.execution_creative_profile_id
          AND target.response_status = 'accepted'
          AND target.execution_status = 'delivered'
        RETURNING service_request_id
      ),
      projected AS (
        UPDATE creative_mission_executions execution
        SET status = 'changes_requested',
            change_request_note = ${input.note},
            last_idempotency_key = ${input.idempotencyKey}::uuid,
            updated_by_clerk_user_id = ${input.clerkUserId},
            updated_at = NOW()
        FROM inserted
        WHERE execution.workspace_id = ${input.workspaceId}
          AND execution.service_request_id = inserted.service_request_id
        RETURNING execution.service_request_id
      )
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM existing
          WHERE request_fingerprint = ${input.requestFingerprint}
        ) AND EXISTS (
          SELECT 1 FROM target
          WHERE execution_status = 'changes_requested'
            AND change_request_note = ${input.note}
        ) THEN 'unchanged'
        WHEN EXISTS (SELECT 1 FROM existing) THEN 'idempotency_conflict'
        WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'mission_not_found'
        WHEN EXISTS (SELECT 1 FROM target WHERE mission_status <> 'ready')
          THEN 'mission_not_ready'
        WHEN EXISTS (
          SELECT 1 FROM target
          WHERE assigned_creative_profile_id IS DISTINCT FROM execution_creative_profile_id
        ) THEN 'assignment_changed'
        WHEN EXISTS (
          SELECT 1 FROM target
          WHERE response_status IS DISTINCT FROM 'accepted'
             OR response_creative_profile_id IS DISTINCT FROM execution_creative_profile_id
        ) THEN 'response_not_accepted'
        WHEN EXISTS (SELECT 1 FROM target WHERE execution_status <> 'delivered')
          THEN 'execution_not_delivered'
        WHEN EXISTS (SELECT 1 FROM projected) THEN 'changed'
        ELSE 'invalid_transition'
      END AS outcome
    `;
    resultIndex = 4;
    return [lockRequest, lockMission, lockResponse, lockExecution, review];
  }, { isolationLevel: "Serializable" });
  return {
    outcome: (
      (results[resultIndex] as ReviewRow[])[0]?.outcome ?? "mission_not_found"
    ) as AdminCreativeMissionReviewOutcome,
  };
};

const completeMission = async (input: {
  workspaceId: string;
  requestId: string;
  idempotencyKey: string;
  clerkUserId: string;
  requestFingerprint: string;
}): Promise<AdminCreativeMissionReviewResult> => {
  const sql = createContentStorageClient();
  const eventId = randomUUID();
  const movementId = randomUUID();
  const executionId = randomUUID();
  let commercialResultIndex = 0;
  let reviewResultIndex = 0;

  const results = await sql.transaction((transactionSql) => {
    const completionGuard = transactionSql`
      request.status = 'in_progress'
      AND (
        request.fulfillment_mode NOT IN ('paid_extra', 'paid_with_right')
        OR purchase.quantity = 1
      )
      AND NOT EXISTS (
        SELECT 1
        FROM creative_mission_execution_events event
        WHERE event.workspace_id = request.workspace_id
          AND event.service_request_id = request.id
          AND event.idempotency_key = ${input.idempotencyKey}::uuid
      )
      AND EXISTS (
        SELECT 1
        FROM athlete_service_request_missions mission
        JOIN creative_mission_responses response
          ON response.workspace_id = mission.workspace_id
         AND response.service_request_id = mission.service_request_id
        JOIN creative_mission_executions execution
          ON execution.workspace_id = mission.workspace_id
         AND execution.service_request_id = mission.service_request_id
        WHERE mission.workspace_id = request.workspace_id
          AND mission.service_request_id = request.id
          AND mission.status = 'ready'
          AND request.assigned_creative_profile_id = execution.creative_profile_id
          AND response.creative_profile_id = execution.creative_profile_id
          AND response.status = 'accepted'
          AND execution.status = 'delivered'
      )
    `;
    const commercialPlan = buildAthleteServiceRequestCommercialCompletionTransaction(
      transactionSql,
      {
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        deliveryKey: input.idempotencyKey,
        movementId,
        executionId,
        completionGuard,
      },
    );
    const lockMission = transactionSql`
      SELECT mission.id
      FROM athlete_service_request_missions mission
      WHERE mission.workspace_id = ${input.workspaceId}
        AND mission.service_request_id = ${input.requestId}::uuid
      FOR UPDATE OF mission
    `;
    const lockResponse = transactionSql`
      SELECT response.id
      FROM creative_mission_responses response
      WHERE response.workspace_id = ${input.workspaceId}
        AND response.service_request_id = ${input.requestId}::uuid
      FOR UPDATE OF response
    `;
    const lockExecution = transactionSql`
      SELECT execution.id
      FROM creative_mission_executions execution
      WHERE execution.workspace_id = ${input.workspaceId}
        AND execution.service_request_id = ${input.requestId}::uuid
      FOR UPDATE OF execution
    `;
    const review = transactionSql`
      WITH target AS MATERIALIZED (
        SELECT request.id AS service_request_id, request.status AS request_status,
               request.completed_at, request.updated_at, request.fulfillment_mode,
               purchase.quantity AS purchase_quantity,
               request.assigned_creative_profile_id,
               mission.id AS mission_id, mission.status AS mission_status,
               response.status AS response_status,
               response.creative_profile_id AS response_creative_profile_id,
               execution.status AS execution_status,
               execution.creative_profile_id AS execution_creative_profile_id,
               execution.delivery_links
        FROM athlete_service_requests request
        JOIN athlete_service_request_missions mission
          ON mission.workspace_id = request.workspace_id
         AND mission.service_request_id = request.id
        LEFT JOIN athlete_credit_purchases purchase
          ON purchase.id = request.purchase_id
         AND purchase.workspace_id = request.workspace_id
         AND purchase.athlete_id = request.athlete_id
        LEFT JOIN creative_mission_responses response
          ON response.workspace_id = request.workspace_id
         AND response.service_request_id = request.id
         AND response.creative_profile_id = request.assigned_creative_profile_id
        LEFT JOIN creative_mission_executions execution
          ON execution.workspace_id = request.workspace_id
         AND execution.service_request_id = request.id
        WHERE request.workspace_id = ${input.workspaceId}
          AND request.id = ${input.requestId}::uuid
      ),
      existing AS MATERIALIZED (
        SELECT event.request_fingerprint
        FROM creative_mission_execution_events event
        WHERE event.workspace_id = ${input.workspaceId}
          AND event.service_request_id = ${input.requestId}::uuid
          AND event.idempotency_key = ${input.idempotencyKey}::uuid
      ),
      inserted AS (
        INSERT INTO creative_mission_execution_events (
          id, workspace_id, service_request_id, mission_id, creative_profile_id,
          action, note, delivery_links_snapshot, authored_by_clerk_user_id,
          request_fingerprint, idempotency_key
        )
        SELECT ${eventId}::uuid, ${input.workspaceId}, target.service_request_id,
               target.mission_id, target.execution_creative_profile_id,
               'completed', NULL, target.delivery_links, ${input.clerkUserId},
               ${input.requestFingerprint}, ${input.idempotencyKey}::uuid
        FROM target
        WHERE NOT EXISTS (SELECT 1 FROM existing)
          AND target.request_status = 'completed'
          AND target.completed_at = CURRENT_TIMESTAMP
          AND target.updated_at = CURRENT_TIMESTAMP
          AND target.mission_status = 'ready'
          AND target.assigned_creative_profile_id = target.execution_creative_profile_id
          AND target.response_creative_profile_id = target.execution_creative_profile_id
          AND target.response_status = 'accepted'
          AND target.execution_status = 'delivered'
          AND (
            target.fulfillment_mode NOT IN ('paid_extra', 'paid_with_right')
            OR target.purchase_quantity = 1
          )
        RETURNING service_request_id
      ),
      projected AS (
        UPDATE creative_mission_executions execution
        SET status = 'completed',
            change_request_note = NULL,
            last_idempotency_key = ${input.idempotencyKey}::uuid,
            updated_by_clerk_user_id = ${input.clerkUserId},
            completed_at = NOW(),
            updated_at = NOW()
        FROM inserted
        WHERE execution.workspace_id = ${input.workspaceId}
          AND execution.service_request_id = inserted.service_request_id
        RETURNING execution.service_request_id
      )
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM existing
          WHERE request_fingerprint = ${input.requestFingerprint}
        ) AND EXISTS (
          SELECT 1 FROM target
          WHERE request_status = 'completed' AND execution_status = 'completed'
        ) THEN 'unchanged'
        WHEN EXISTS (SELECT 1 FROM existing) THEN 'idempotency_conflict'
        WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'mission_not_found'
        WHEN EXISTS (
          SELECT 1 FROM target
          WHERE fulfillment_mode IN ('paid_extra', 'paid_with_right')
            AND purchase_quantity > 1
        ) THEN 'pack_not_supported'
        WHEN EXISTS (
          SELECT 1 FROM target
          WHERE request_status NOT IN ('in_progress', 'completed')
        ) THEN 'request_not_in_progress'
        WHEN EXISTS (SELECT 1 FROM target WHERE mission_status <> 'ready')
          THEN 'mission_not_ready'
        WHEN EXISTS (
          SELECT 1 FROM target
          WHERE assigned_creative_profile_id IS DISTINCT FROM execution_creative_profile_id
        ) THEN 'assignment_changed'
        WHEN EXISTS (
          SELECT 1 FROM target
          WHERE response_status IS DISTINCT FROM 'accepted'
             OR response_creative_profile_id IS DISTINCT FROM execution_creative_profile_id
        ) THEN 'response_not_accepted'
        WHEN EXISTS (SELECT 1 FROM target WHERE execution_status <> 'delivered')
          THEN 'execution_not_delivered'
        WHEN EXISTS (SELECT 1 FROM projected) THEN 'changed'
        ELSE 'commercial_not_completed'
      END AS outcome
    `;
    const assertAtomicCompletion = transactionSql`
      SELECT 1 / CASE WHEN (
        NOT EXISTS (
          SELECT 1
          FROM athlete_service_requests request
          WHERE request.workspace_id = ${input.workspaceId}
            AND request.id = ${input.requestId}::uuid
            AND request.status = 'completed'
            AND request.completed_at = CURRENT_TIMESTAMP
            AND request.updated_at = CURRENT_TIMESTAMP
        ) OR EXISTS (
          SELECT 1
          FROM athlete_service_requests request
          JOIN creative_mission_executions execution
            ON execution.workspace_id = request.workspace_id
           AND execution.service_request_id = request.id
          JOIN creative_mission_execution_events event
            ON event.workspace_id = request.workspace_id
           AND event.service_request_id = request.id
           AND event.creative_profile_id = execution.creative_profile_id
          WHERE request.workspace_id = ${input.workspaceId}
            AND request.id = ${input.requestId}::uuid
            AND request.status = 'completed'
            AND execution.status = 'completed'
            AND event.id = ${eventId}::uuid
            AND event.action = 'completed'
            AND event.request_fingerprint = ${input.requestFingerprint}
            AND event.idempotency_key = ${input.idempotencyKey}::uuid
        )
      ) THEN 1 ELSE 0 END AS atomic_completion_consistent
    `;
    const queries = [
      ...commercialPlan.queries.slice(0, 3),
      lockMission,
      lockResponse,
      lockExecution,
      ...commercialPlan.queries.slice(3),
      review,
      assertAtomicCompletion,
    ];
    commercialResultIndex = commercialPlan.resultIndex + 3;
    reviewResultIndex = commercialPlan.queries.length + 3;
    return queries;
  }, { isolationLevel: "Serializable" });

  const review = (results[reviewResultIndex] as ReviewRow[])[0];
  if (review?.outcome === "changed" || review?.outcome === "unchanged") {
    return { outcome: review.outcome };
  }
  if (review?.outcome && review.outcome !== "commercial_not_completed") {
    return { outcome: review.outcome };
  }
  const commercial = readAthleteServiceRequestCommercialCompletionResult(
    results,
    commercialResultIndex,
  );
  return { outcome: mapCommercialFailure(commercial.outcome) };
};

export const reviewAdminCreativeMissionDelivery = async (input: {
  workspaceId: string;
  requestId: string;
  action: AdminCreativeMissionReviewAction;
  note: string | null;
  idempotencyKey: string;
  clerkUserId: string;
}): Promise<AdminCreativeMissionReviewResult> => {
  const workspaceId = input.workspaceId.trim();
  const requestId = normalizeUuid(input.requestId, "requestId");
  const idempotencyKey = normalizeUuid(input.idempotencyKey, "idempotencyKey");
  const clerkUserId = input.clerkUserId.trim();
  if (!workspaceId || !clerkUserId) throw new Error("Contexte Admin invalide.");
  const note = normalizeNote(input.note, input.action === "changes_requested");
  const requestFingerprint = fingerprint({ requestId, action: input.action, note });

  return input.action === "changes_requested"
    ? requestChanges({
        workspaceId,
        requestId,
        note: note!,
        idempotencyKey,
        clerkUserId,
        requestFingerprint,
      })
    : completeMission({
        workspaceId,
        requestId,
        idempotencyKey,
        clerkUserId,
        requestFingerprint,
      });
};
