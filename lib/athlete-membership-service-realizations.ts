import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type { AthleteCreditType } from "@/lib/athlete-credits";

type RealizationScope = {
  workspaceId: string;
  athleteId: string;
  membershipId: string;
};

export type RecordAthleteIncludedServiceRealizationInput = RealizationScope & {
  realizationId: string;
  creditType: AthleteCreditType;
  occurredAt: string;
  note?: string | null;
  adminClerkUserId: string;
};

export type RecordAthleteIncludedServiceRealizationResult = {
  outcome: "created" | "unchanged";
  requestId: string;
};

export type AthleteRealizationCancellation = {
  movementId: string;
  reason: string;
  cancelledAt: string;
  adminClerkUserId: string;
};

export type AthleteAdminServiceRealization = {
  realizationId: string;
  membershipId: string;
  creditType: AthleteCreditType;
  occurredAt: string;
  note: string | null;
  recordedAt: string;
  adminClerkUserId: string;
  cancellation: AthleteRealizationCancellation | null;
};

export type CancelAthleteIncludedServiceRealizationInput = RealizationScope & {
  realizationId: string;
  reason: string;
  adminClerkUserId: string;
};

export type CancelAthleteIncludedServiceRealizationResult = {
  outcome: "cancelled" | "unchanged";
  requestId: string;
  cancellation: AthleteRealizationCancellation;
};

type RecordOutcome = "created" | "unchanged" | "membership_not_found"
  | "membership_inactive" | "invalid_date" | "insufficient_rights" | "conflict";
type CancellationOutcome = "cancelled" | "unchanged" | "not_found"
  | "membership_inactive" | "conflict" | "inconsistent_balance";

export type AthleteIncludedServiceRealizationRepository = {
  record: (input: RealizationScope & {
    requestId: string;
    movementId: string;
    creditType: AthleteCreditType;
    productCode: "photo_session_standard" | "custom_content_single";
    occurredAt: string;
    note: string | null;
    adminClerkUserId: string;
  }) => Promise<{ outcome: RecordOutcome; requestId: string | null }>;
};

export type AthleteRealizationCancellationRepository = {
  cancel: (input: CancelAthleteIncludedServiceRealizationInput & {
    movementId: string;
  }) => Promise<{
    outcome: CancellationOutcome;
    cancellation: AthleteRealizationCancellation | null;
  }>;
};

export type AthleteRealizationHistoryRepository = {
  list: (input: RealizationScope) => Promise<AthleteAdminServiceRealization[]>;
};

export class AthleteIncludedServiceRealizationError extends Error {
  constructor(
    public readonly code: "validation" | "not_found" | "inactive" | "insufficient_rights"
      | "conflict" | "inconsistent_balance" | "transaction",
    message: string,
  ) {
    super(message);
    this.name = "AthleteIncludedServiceRealizationError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new AthleteIncludedServiceRealizationError("validation", `${field} est requis.`);
  return normalized;
};

const normalizeRealizationId = (value: string): string => {
  const id = normalizeRequired(value, "realizationId");
  if (!uuidPattern.test(id)) {
    throw new AthleteIncludedServiceRealizationError("validation", "realizationId est invalide.");
  }
  return id.toLowerCase();
};

const normalizeScope = (input: RealizationScope): RealizationScope => ({
  workspaceId: normalizeRequired(input.workspaceId, "workspaceId"),
  athleteId: normalizeRequired(input.athleteId, "athleteId"),
  membershipId: normalizeRequired(input.membershipId, "membershipId"),
});

const normalizeOccurredAt = (value: string, now: Date): string => {
  const parsed = new Date(normalizeRequired(value, "occurredAt"));
  if (Number.isNaN(parsed.getTime())) {
    throw new AthleteIncludedServiceRealizationError("validation", "La date de réalisation est invalide.");
  }
  if (parsed.getTime() > now.getTime()) {
    throw new AthleteIncludedServiceRealizationError("validation", "La date de réalisation ne peut pas être future.");
  }
  return parsed.toISOString();
};

const normalizeNote = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 2_000) {
    throw new AthleteIncludedServiceRealizationError("validation", "La note ne peut pas dépasser 2000 caractères.");
  }
  return normalized;
};

const transactionError = (error: unknown): never => {
  const databaseError = error as { code?: unknown; constraint?: unknown };
  console.error("[athlete_service_realization] transaction failed", {
    code: typeof databaseError?.code === "string" ? databaseError.code : "unknown",
    constraint: typeof databaseError?.constraint === "string" ? databaseError.constraint : "unknown",
  });
  throw new AthleteIncludedServiceRealizationError(
    "transaction",
    "La transaction a échoué. Réessayez ou contactez le support avec le code transaction_failed.",
  );
};

// Read after the membership lock, with a fresh snapshot and database timestamp.
const rightStateCtes = `
  operation_time AS MATERIALIZED (SELECT statement_timestamp() AS now),
  selected_membership AS (
    SELECT membership.* FROM athlete_memberships membership
    WHERE membership.workspace_id = $1 AND membership.athlete_id = $2 AND membership.id = $3
  ),
  selected_subscription AS (
    SELECT subscription.id, subscription.custom_contents_included
    FROM athlete_subscriptions subscription
    JOIN selected_membership membership
      ON subscription.workspace_id = membership.workspace_id
     AND subscription.athlete_id = membership.athlete_id
    WHERE subscription.membership_id = membership.id
       OR (subscription.membership_id IS NULL
         AND subscription.starts_on <= COALESCE(membership.ends_at, (SELECT now FROM operation_time))
         AND subscription.ends_on >= membership.starts_at)
    ORDER BY CASE WHEN subscription.membership_id = membership.id THEN 0 ELSE 1 END,
             subscription.starts_on DESC, subscription.created_at DESC
    LIMIT 1
  ),
  legacy_content_counts AS (
    SELECT COUNT(*) FILTER (WHERE request.status = 'completed') AS used,
           COUNT(*) FILTER (WHERE request.status IN ('requested', 'accepted', 'in_progress')) AS reserved
    FROM selected_subscription subscription
    JOIN athlete_subscription_content_requests request
      ON request.subscription_id = subscription.id
     AND request.workspace_id = $1 AND request.athlete_id = $2
    WHERE NOT EXISTS (
      SELECT 1 FROM athlete_credit_movements movement
      WHERE movement.workspace_id = $1 AND movement.athlete_id = $2
        AND movement.source = 'usage'
        AND movement.reference_id = 'athlete_subscription_content_request:' || request.id::text
    )
  ),
  right_state AS (
    SELECT membership.*,
           GREATEST(0, COALESCE(ledger.entitlement, 0)
             + CASE
               WHEN membership.membership_kind = 'founder'
                 AND COALESCE(ledger.has_plan_grant, FALSE) = FALSE THEN 1
               WHEN target.credit_type = 'custom_content' AND membership.membership_kind <> 'founder'
                 AND COALESCE(ledger.has_plan_grant, FALSE) = FALSE
                 THEN COALESCE(subscription.custom_contents_included, 0)
               ELSE 0 END) AS quota,
           COALESCE(ledger.used, 0)
             + CASE WHEN target.credit_type = 'custom_content'
               THEN COALESCE(legacy.used, 0) ELSE 0 END AS used,
           COALESCE(reservations.quantity, 0)
             + CASE WHEN target.credit_type = 'custom_content'
               THEN COALESCE(legacy.reserved, 0) ELSE 0 END AS reserved
    FROM selected_membership membership
    CROSS JOIN target_credit target
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(movement.quantity) FILTER (
               WHERE movement.source NOT IN ('usage', 'usage_reversal', 'purchase')
                 AND (movement.expires_at IS NULL OR movement.expires_at > (SELECT now FROM operation_time))
             ), 0) AS entitlement,
             COALESCE(-SUM(movement.quantity) FILTER (
               WHERE (movement.source = 'usage' AND movement.quantity < 0)
                  OR movement.source = 'usage_reversal'
             ), 0) AS used,
             BOOL_OR(movement.source = 'plan_grant' AND movement.quantity > 0) AS has_plan_grant
      FROM athlete_credit_movements movement
      WHERE movement.workspace_id = membership.workspace_id
        AND movement.athlete_id = membership.athlete_id
        AND movement.membership_id = membership.id AND movement.credit_type = target.credit_type
    ) ledger ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(request.snapshot_credit_quantity), 0) AS quantity
      FROM athlete_service_requests request
      WHERE request.workspace_id = membership.workspace_id AND request.athlete_id = membership.athlete_id
        AND request.snapshot_credit_type = target.credit_type
        AND request.status IN ('scheduled', 'in_progress')
        AND request.fulfillment_mode IN ('included_right', 'paid_with_right')
    ) reservations ON TRUE
    LEFT JOIN selected_subscription subscription ON TRUE
    LEFT JOIN legacy_content_counts legacy ON TRUE
  )
`;

const scopedRealizationCte = `
  scoped_realization AS (
    SELECT request.*, usage.membership_id
    FROM athlete_service_requests request
    JOIN athlete_credit_movements usage ON usage.id = request.usage_movement_id
    JOIN athlete_memberships membership
      ON membership.id = usage.membership_id
     AND membership.workspace_id = usage.workspace_id AND membership.athlete_id = usage.athlete_id
    WHERE request.id = $4::uuid
      AND request.workspace_id = $1 AND request.athlete_id = $2
      AND request.is_admin_membership_realization
      AND request.status = 'completed' AND request.fulfillment_mode = 'included_right'
      AND request.snapshot_credit_quantity = 1
      AND usage.workspace_id = $1 AND usage.athlete_id = $2 AND usage.membership_id = $3
      AND usage.source = 'usage' AND usage.quantity = -1
      AND usage.credit_type = request.snapshot_credit_type
      AND usage.reference_id = 'athlete_service_request:' || request.id::text
  )
`;

type CancellationRow = {
  id: string;
  cancellation_reason: string;
  created_at: string | Date;
  cancelled_by_clerk_user_id: string;
};

const mapCancellation = (row: CancellationRow): AthleteRealizationCancellation => ({
  movementId: row.id,
  reason: row.cancellation_reason,
  cancelledAt: new Date(row.created_at).toISOString(),
  adminClerkUserId: row.cancelled_by_clerk_user_id,
});

export const createAthleteRealizationRepository = (): AthleteIncludedServiceRealizationRepository
  & AthleteRealizationCancellationRepository & AthleteRealizationHistoryRepository => {
  const sql = createContentStorageClient();
  const lockMembership = (scope: RealizationScope) => sql`
    SELECT id FROM athlete_memberships
    WHERE workspace_id = ${scope.workspaceId} AND athlete_id = ${scope.athleteId}
      AND id = ${scope.membershipId}
    FOR UPDATE
  `;
  return {
    async record(input) {
      try {
        const query = sql.query(`
          WITH target_credit AS (SELECT $5::text AS credit_type),
          ${scopedRealizationCte}, ${rightStateCtes},
          existing_request AS (
            SELECT request.id FROM scoped_realization request
            WHERE request.snapshot_credit_type = $5 AND request.product_code = $7
              AND request.completed_at = $8::timestamptz
              AND request.requested_details->>'message' IS NOT DISTINCT FROM $9::text
              AND request.requested_details->>'recordedByClerkUserId' = $10
              AND NOT EXISTS (
                SELECT 1 FROM athlete_credit_movements reversal
                WHERE reversal.reversal_realization_id = request.id
              )
          ),
          eligible AS (
            SELECT state.* FROM right_state state
            WHERE state.status = 'active' AND state.starts_at <= (SELECT now FROM operation_time)
              AND (state.ends_at IS NULL OR state.ends_at > (SELECT now FROM operation_time))
              AND $8::timestamptz >= state.starts_at
              AND $8::timestamptz <= (SELECT now FROM operation_time)
              AND (state.ends_at IS NULL OR $8::timestamptz <= state.ends_at)
              AND state.quota - state.used - state.reserved >= 1
              AND NOT EXISTS (SELECT 1 FROM athlete_service_requests WHERE id = $4::uuid)
          ),
          inserted_movement AS (
            INSERT INTO athlete_credit_movements (
              id, workspace_id, athlete_id, membership_id, credit_type, quantity,
              source, reference_id, expires_at, created_at
            )
            SELECT $6::uuid, workspace_id, athlete_id, id, $5, -1, 'usage',
                   'athlete_service_request:' || $4::text, NULL, (SELECT now FROM operation_time)
            FROM eligible RETURNING id
          ),
          inserted_request AS (
            INSERT INTO athlete_service_requests (
              id, workspace_id, athlete_id, product_code, fulfillment_mode, status,
              requested_details, requested_at, scheduled_at, started_at, completed_at,
              snapshot_credit_type, snapshot_credit_quantity, usage_movement_id,
              created_at, updated_at, is_admin_membership_realization
            )
            SELECT $4::uuid, eligible.workspace_id, eligible.athlete_id,
                   $7, 'included_right', 'completed',
                   jsonb_strip_nulls(jsonb_build_object(
                     'message', $9::text,
                     'historicalRealizationAt', to_char($8::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                     'recordedByClerkUserId', $10::text
                   )),
                   $8::timestamptz, $8::timestamptz, $8::timestamptz, $8::timestamptz,
                   $5, 1, movement.id, (SELECT now FROM operation_time), (SELECT now FROM operation_time), TRUE
            FROM eligible JOIN inserted_movement movement ON TRUE RETURNING id
          )
          SELECT 'created'::text AS outcome, id::text AS request_id FROM inserted_request
          UNION ALL
          SELECT 'unchanged', id::text FROM existing_request
          UNION ALL
          SELECT CASE
            WHEN NOT EXISTS (SELECT 1 FROM selected_membership) THEN 'membership_not_found'
            WHEN EXISTS (SELECT 1 FROM athlete_service_requests WHERE id = $4::uuid) THEN 'conflict'
            WHEN EXISTS (
              SELECT 1 FROM selected_membership WHERE status <> 'active' OR starts_at > (SELECT now FROM operation_time)
                OR (ends_at IS NOT NULL AND ends_at <= (SELECT now FROM operation_time))
            ) THEN 'membership_inactive'
            WHEN EXISTS (
              SELECT 1 FROM selected_membership WHERE $8::timestamptz < starts_at
                OR $8::timestamptz > (SELECT now FROM operation_time)
                OR (ends_at IS NOT NULL AND $8::timestamptz > ends_at)
            ) THEN 'invalid_date'
            ELSE 'insufficient_rights' END, NULL::text
          WHERE NOT EXISTS (SELECT 1 FROM inserted_request)
            AND NOT EXISTS (SELECT 1 FROM existing_request)
          LIMIT 1
        `, [
          input.workspaceId, input.athleteId, input.membershipId, input.requestId,
          input.creditType, input.movementId, input.productCode, input.occurredAt,
          input.note, input.adminClerkUserId,
        ]);
        const results = await sql.transaction([lockMembership(input), query], { isolationLevel: "ReadCommitted" });
        const row = results[1][0] as { outcome: RecordOutcome; request_id: string | null } | undefined;
        if (!row) throw new Error("La transaction de réalisation n’a retourné aucun résultat.");
        return { outcome: row.outcome, requestId: row.request_id };
      } catch (error) {
        return transactionError(error);
      }
    },
    async cancel(input) {
      try {
        const query = sql.query(`
          WITH ${scopedRealizationCte},
          target_credit AS (SELECT snapshot_credit_type AS credit_type FROM scoped_realization),
          ${rightStateCtes},
          existing_reversal AS (
            SELECT reversal.* FROM athlete_credit_movements reversal
            JOIN scoped_realization request ON request.id = reversal.reversal_realization_id
            WHERE reversal.workspace_id = $1 AND reversal.athlete_id = $2
              AND reversal.membership_id = $3 AND reversal.source = 'usage_reversal'
          ),
          inserted_reversal AS (
            INSERT INTO athlete_credit_movements (
              id, workspace_id, athlete_id, membership_id, credit_type, quantity, source,
              reference_id, expires_at, created_at, reversal_realization_id,
              cancellation_reason, cancelled_by_clerk_user_id
            )
            SELECT $7::uuid, state.workspace_id, state.athlete_id, state.id,
                   request.snapshot_credit_type, 1, 'usage_reversal',
                   'athlete_service_request_reversal:' || request.id::text, NULL, (SELECT now FROM operation_time),
                   request.id, $5, $6
            FROM right_state state CROSS JOIN scoped_realization request
            WHERE state.status = 'active' AND state.starts_at <= (SELECT now FROM operation_time)
              AND (state.ends_at IS NULL OR state.ends_at > (SELECT now FROM operation_time))
              AND state.quota - state.used - state.reserved >= 0
              AND NOT EXISTS (SELECT 1 FROM existing_reversal)
            RETURNING *
          )
          SELECT 'cancelled'::text AS outcome, id, cancellation_reason, created_at,
                 cancelled_by_clerk_user_id FROM inserted_reversal
          UNION ALL
          SELECT CASE WHEN cancellation_reason = $5 THEN 'unchanged' ELSE 'conflict' END,
                 id, cancellation_reason, created_at, cancelled_by_clerk_user_id FROM existing_reversal
          UNION ALL
          SELECT CASE
            WHEN NOT EXISTS (SELECT 1 FROM scoped_realization) THEN 'not_found'
            WHEN EXISTS (
              SELECT 1 FROM selected_membership WHERE status <> 'active' OR starts_at > (SELECT now FROM operation_time)
                OR (ends_at IS NOT NULL AND ends_at <= (SELECT now FROM operation_time))
            ) THEN 'membership_inactive'
            ELSE 'inconsistent_balance' END,
            NULL::uuid, NULL::text, NULL::timestamptz, NULL::text
          WHERE NOT EXISTS (SELECT 1 FROM inserted_reversal)
            AND NOT EXISTS (SELECT 1 FROM existing_reversal)
          LIMIT 1
        `, [
          input.workspaceId, input.athleteId, input.membershipId, input.realizationId,
          input.reason, input.adminClerkUserId, input.movementId,
        ]);
        const results = await sql.transaction([lockMembership(input), query], { isolationLevel: "ReadCommitted" });
        const row = results[1][0] as (CancellationRow & { outcome: CancellationOutcome }) | undefined;
        if (!row) throw new Error("La transaction d’annulation n’a retourné aucun résultat.");
        return {
          outcome: row.outcome,
          cancellation: row.outcome === "cancelled" || row.outcome === "unchanged" ? mapCancellation(row) : null,
        };
      } catch (error) {
        return transactionError(error);
      }
    },
    async list(input) {
      const rows = await sql`
        SELECT request.id, usage.membership_id, request.snapshot_credit_type,
               request.completed_at, request.requested_details->>'message' AS note,
               request.created_at AS recorded_at,
               request.requested_details->>'recordedByClerkUserId' AS recorded_by,
               reversal.id AS reversal_id, reversal.cancellation_reason,
               reversal.created_at AS cancelled_at, reversal.cancelled_by_clerk_user_id
        FROM athlete_service_requests request
        JOIN athlete_credit_movements usage
          ON usage.id = request.usage_movement_id
         AND usage.workspace_id = request.workspace_id AND usage.athlete_id = request.athlete_id
        JOIN athlete_memberships membership
          ON membership.id = usage.membership_id AND membership.workspace_id = usage.workspace_id
         AND membership.athlete_id = usage.athlete_id
        LEFT JOIN athlete_credit_movements reversal
          ON reversal.reversal_realization_id = request.id AND reversal.source = 'usage_reversal'
         AND reversal.workspace_id = usage.workspace_id AND reversal.athlete_id = usage.athlete_id
         AND reversal.membership_id = usage.membership_id AND reversal.credit_type = usage.credit_type
        WHERE request.is_admin_membership_realization
          AND request.workspace_id = ${input.workspaceId} AND request.athlete_id = ${input.athleteId}
          AND usage.membership_id = ${input.membershipId}
          AND usage.source = 'usage' AND usage.quantity = -1
          AND usage.credit_type = request.snapshot_credit_type
        ORDER BY request.created_at DESC, request.id DESC
      `;
      type HistoryRow = {
        id: string; membership_id: string; snapshot_credit_type: AthleteCreditType;
        completed_at: string | Date; note: string | null; recorded_at: string | Date;
        recorded_by: string; reversal_id: string | null; cancellation_reason: string;
        cancelled_at: string | Date; cancelled_by_clerk_user_id: string;
      };
      return (rows as HistoryRow[]).map((row) => ({
        realizationId: row.id,
        membershipId: row.membership_id,
        creditType: row.snapshot_credit_type,
        occurredAt: new Date(row.completed_at).toISOString(),
        note: row.note,
        recordedAt: new Date(row.recorded_at).toISOString(),
        adminClerkUserId: row.recorded_by,
        cancellation: row.reversal_id ? mapCancellation({
          id: row.reversal_id,
          cancellation_reason: row.cancellation_reason,
          created_at: row.cancelled_at,
          cancelled_by_clerk_user_id: row.cancelled_by_clerk_user_id,
        }) : null,
      }));
    },
  };
};

export const recordAthleteIncludedServiceRealization = async (
  input: RecordAthleteIncludedServiceRealizationInput,
  { now = new Date(), repository }: {
    now?: Date;
    repository?: AthleteIncludedServiceRealizationRepository;
  } = {},
): Promise<RecordAthleteIncludedServiceRealizationResult> => {
  const requestId = normalizeRealizationId(input.realizationId);
  const creditType = input.creditType;
  if (creditType !== "production" && creditType !== "custom_content") {
    throw new AthleteIncludedServiceRealizationError("validation", "Le type de droit est invalide.");
  }
  const normalized = {
    ...normalizeScope(input), requestId, movementId: randomUUID(), creditType,
    productCode: creditType === "production" ? "photo_session_standard" as const : "custom_content_single" as const,
    occurredAt: normalizeOccurredAt(input.occurredAt, now),
    note: normalizeNote(input.note),
    adminClerkUserId: normalizeRequired(input.adminClerkUserId, "adminClerkUserId"),
  };
  const result = await (repository ?? createAthleteRealizationRepository()).record(normalized);
  if (result.outcome === "membership_not_found") {
    throw new AthleteIncludedServiceRealizationError("not_found", "Adhésion introuvable.");
  }
  if (result.outcome === "membership_inactive") {
    throw new AthleteIncludedServiceRealizationError("inactive", "L’adhésion affichée n’est plus active.");
  }
  if (result.outcome === "invalid_date") {
    throw new AthleteIncludedServiceRealizationError("validation", "La date de réalisation doit appartenir à la période de l’adhésion.");
  }
  if (result.outcome === "insufficient_rights") {
    throw new AthleteIncludedServiceRealizationError("insufficient_rights", "Aucun droit disponible ne peut être consommé.");
  }
  if (result.outcome === "conflict") {
    throw new AthleteIncludedServiceRealizationError("conflict", "Cet identifiant ne correspond pas à cette réalisation, ou elle est déjà annulée.");
  }
  if (!result.requestId) throw new Error("La réalisation enregistrée est incohérente.");
  return { outcome: result.outcome, requestId: result.requestId };
};

export const cancelAthleteIncludedServiceRealization = async (
  input: CancelAthleteIncludedServiceRealizationInput,
  { repository }: {
    repository?: AthleteRealizationCancellationRepository;
  } = {},
): Promise<CancelAthleteIncludedServiceRealizationResult> => {
  const realizationId = normalizeRealizationId(input.realizationId);
  const reason = normalizeRequired(input.reason, "Le motif");
  if (reason.length > 2_000) {
    throw new AthleteIncludedServiceRealizationError("validation", "Le motif ne peut pas dépasser 2000 caractères.");
  }
  const normalized = {
    ...normalizeScope(input), realizationId, reason, movementId: randomUUID(),
    adminClerkUserId: normalizeRequired(input.adminClerkUserId, "adminClerkUserId"),
  };
  const result = await (repository ?? createAthleteRealizationRepository()).cancel(normalized);
  if (result.outcome === "not_found") {
    throw new AthleteIncludedServiceRealizationError("not_found", "Réalisation Admin introuvable pour cette adhésion.");
  }
  if (result.outcome === "membership_inactive") {
    throw new AthleteIncludedServiceRealizationError("inactive", "L’adhésion affichée n’est plus active.");
  }
  if (result.outcome === "conflict") {
    throw new AthleteIncludedServiceRealizationError("conflict", "Cette réalisation est déjà annulée avec un autre motif.");
  }
  if (result.outcome === "inconsistent_balance") {
    throw new AthleteIncludedServiceRealizationError("inconsistent_balance", "Le solde est incohérent : l’annulation ne peut pas restituer un droit disponible.");
  }
  if (!result.cancellation) throw new Error("La compensation enregistrée est incohérente.");
  return { outcome: result.outcome, requestId: realizationId, cancellation: result.cancellation };
};

export const listAthleteAdminServiceRealizations = async (
  input: RealizationScope,
  { repository }: { repository?: AthleteRealizationHistoryRepository } = {},
): Promise<AthleteAdminServiceRealization[]> =>
  (repository ?? createAthleteRealizationRepository()).list(normalizeScope(input));
