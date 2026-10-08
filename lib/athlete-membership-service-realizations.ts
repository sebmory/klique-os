import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type { AthleteCreditType } from "@/lib/athlete-credits";

export type RecordAthleteIncludedServiceRealizationInput = {
  realizationId: string;
  workspaceId: string;
  athleteId: string;
  membershipId: string;
  creditType: AthleteCreditType;
  occurredAt: string;
  note?: string | null;
  adminClerkUserId: string;
};

export type RecordAthleteIncludedServiceRealizationResult = {
  outcome: "created" | "unchanged";
  requestId: string;
};

type RecordOutcome =
  | "created"
  | "unchanged"
  | "membership_not_found"
  | "membership_inactive"
  | "invalid_date"
  | "insufficient_rights";

export type AthleteIncludedServiceRealizationRepository = {
  record: (input: {
    requestId: string;
    movementId: string;
    workspaceId: string;
    athleteId: string;
    membershipId: string;
    creditType: AthleteCreditType;
    productCode: "photo_session_standard" | "custom_content_single";
    occurredAt: string;
    note: string | null;
    adminClerkUserId: string;
    now: string;
  }) => Promise<{ outcome: RecordOutcome; requestId: string | null }>;
};

export class AthleteIncludedServiceRealizationError extends Error {
  constructor(
    public readonly code: "validation" | "not_found" | "inactive" | "insufficient_rights" | "transaction",
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

const normalizeOccurredAt = (value: string, now: Date): string => {
  const normalized = normalizeRequired(value, "occurredAt");
  const parsed = new Date(normalized);
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

const createRepository = (): AthleteIncludedServiceRealizationRepository => {
  const sql = createContentStorageClient();
  return {
    async record(input) {
      let rows;
      try {
        rows = await sql`
        WITH locked_membership AS MATERIALIZED (
          SELECT membership.*
          FROM athlete_memberships membership
          WHERE membership.id = ${input.membershipId}
            AND membership.workspace_id = ${input.workspaceId}
            AND membership.athlete_id = ${input.athleteId}
          FOR UPDATE
        ),
        existing_request AS (
          SELECT request.id
          FROM athlete_service_requests request
          WHERE request.id = ${input.requestId}::uuid
            AND request.workspace_id = ${input.workspaceId}
            AND request.athlete_id = ${input.athleteId}
        ),
        selected_subscription AS (
          SELECT subscription.id, subscription.custom_contents_included
          FROM athlete_subscriptions subscription
          JOIN locked_membership membership
            ON subscription.workspace_id = membership.workspace_id
           AND subscription.athlete_id = membership.athlete_id
          WHERE subscription.membership_id = membership.id
             OR (
               subscription.membership_id IS NULL
               AND subscription.starts_on <= COALESCE(membership.ends_at, ${input.now}::timestamptz)
               AND subscription.ends_on >= membership.starts_at
             )
          ORDER BY
            CASE WHEN subscription.membership_id = membership.id THEN 0 ELSE 1 END,
            subscription.starts_on DESC,
            subscription.created_at DESC
          LIMIT 1
        ),
        legacy_content_counts AS (
          SELECT
            COUNT(*) FILTER (WHERE request.status = 'completed') AS used,
            COUNT(*) FILTER (WHERE request.status IN ('requested', 'accepted', 'in_progress')) AS reserved
          FROM selected_subscription subscription
          JOIN athlete_subscription_content_requests request
            ON request.subscription_id = subscription.id
           AND request.workspace_id = ${input.workspaceId}
           AND request.athlete_id = ${input.athleteId}
          WHERE NOT EXISTS (
            SELECT 1
            FROM athlete_credit_movements movement
            WHERE movement.workspace_id = ${input.workspaceId}
              AND movement.athlete_id = ${input.athleteId}
              AND movement.source = 'usage'
              AND movement.reference_id = 'athlete_subscription_content_request:' || request.id::text
          )
        ),
        right_state AS (
          SELECT membership.*,
                 COALESCE(ledger.entitlement, 0)
                   + CASE
                       WHEN membership.membership_kind = 'founder'
                         AND COALESCE(ledger.has_plan_grant, FALSE) = FALSE
                       THEN 1
                       WHEN ${input.creditType} = 'custom_content'
                         AND membership.membership_kind <> 'founder'
                         AND COALESCE(ledger.has_plan_grant, FALSE) = FALSE
                       THEN COALESCE(subscription.custom_contents_included, 0)
                       ELSE 0
                     END AS quota,
                 COALESCE(ledger.used, 0)
                   + CASE WHEN ${input.creditType} = 'custom_content'
                       THEN COALESCE(legacy.used, 0) ELSE 0 END AS used,
                 COALESCE(reservations.quantity, 0)
                   + CASE WHEN ${input.creditType} = 'custom_content'
                       THEN COALESCE(legacy.reserved, 0) ELSE 0 END AS reserved
          FROM locked_membership membership
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(SUM(movement.quantity) FILTER (
                WHERE movement.source NOT IN ('usage', 'purchase')
                  AND (movement.expires_at IS NULL OR movement.expires_at > ${input.now}::timestamptz)
              ), 0) AS entitlement,
              COALESCE(-SUM(movement.quantity) FILTER (
                WHERE movement.source = 'usage' AND movement.quantity < 0
              ), 0) AS used,
              BOOL_OR(movement.source = 'plan_grant' AND movement.quantity > 0) AS has_plan_grant
            FROM athlete_credit_movements movement
            WHERE movement.workspace_id = membership.workspace_id
              AND movement.athlete_id = membership.athlete_id
              AND movement.membership_id = membership.id
              AND movement.credit_type = ${input.creditType}
          ) ledger ON TRUE
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(request.snapshot_credit_quantity), 0) AS quantity
            FROM athlete_service_requests request
            WHERE request.workspace_id = membership.workspace_id
              AND request.athlete_id = membership.athlete_id
              AND request.snapshot_credit_type = ${input.creditType}
              AND request.status IN ('scheduled', 'in_progress')
              AND request.fulfillment_mode IN ('included_right', 'paid_with_right')
          ) reservations ON TRUE
          LEFT JOIN selected_subscription subscription ON TRUE
          LEFT JOIN legacy_content_counts legacy ON TRUE
        ),
        eligible AS (
          SELECT state.*
          FROM right_state state
          WHERE state.status = 'active'
            AND state.starts_at <= ${input.now}::timestamptz
            AND (state.ends_at IS NULL OR state.ends_at > ${input.now}::timestamptz)
            AND ${input.occurredAt}::timestamptz >= state.starts_at
            AND (state.ends_at IS NULL OR ${input.occurredAt}::timestamptz <= state.ends_at)
            AND state.quota - state.used - state.reserved >= 1
            AND NOT EXISTS (SELECT 1 FROM existing_request)
        ),
        inserted_movement AS (
          INSERT INTO athlete_credit_movements (
            id, workspace_id, athlete_id, membership_id, credit_type, quantity,
            source, reference_id, expires_at, created_at
          )
          SELECT ${input.movementId}::uuid, eligible.workspace_id, eligible.athlete_id,
                 eligible.id, ${input.creditType}, -1, 'usage',
                 'athlete_service_request:' || ${input.requestId}, NULL, ${input.now}::timestamptz
          FROM eligible
          RETURNING id
        ),
        inserted_request AS (
          INSERT INTO athlete_service_requests (
            id, workspace_id, athlete_id, product_code, fulfillment_mode, status,
            requested_details, requested_at, scheduled_at, started_at, completed_at,
            snapshot_credit_type, snapshot_credit_quantity, usage_movement_id,
            created_at, updated_at
          )
          SELECT ${input.requestId}::uuid, eligible.workspace_id, eligible.athlete_id,
                 ${input.productCode}, 'included_right', 'completed',
                 jsonb_strip_nulls(jsonb_build_object(
                   'message', ${input.note}::text,
                   'historicalRealizationAt', ${input.occurredAt}::text,
                   'recordedByClerkUserId', ${input.adminClerkUserId}::text
                 )),
                 ${input.occurredAt}::timestamptz, ${input.occurredAt}::timestamptz,
                 ${input.occurredAt}::timestamptz, ${input.occurredAt}::timestamptz,
                 ${input.creditType}, 1, movement.id,
                 ${input.now}::timestamptz, ${input.now}::timestamptz
          FROM eligible
          JOIN inserted_movement movement ON TRUE
          RETURNING id
        )
        SELECT 'created'::text AS outcome, request.id::text AS request_id
        FROM inserted_request request
        UNION ALL
        SELECT 'unchanged', request.id::text
        FROM existing_request request
        WHERE NOT EXISTS (SELECT 1 FROM inserted_request)
        UNION ALL
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM locked_membership) THEN 'membership_not_found'
          WHEN EXISTS (
            SELECT 1 FROM locked_membership membership
            WHERE membership.status <> 'active'
               OR membership.starts_at > ${input.now}::timestamptz
               OR (membership.ends_at IS NOT NULL AND membership.ends_at <= ${input.now}::timestamptz)
          ) THEN 'membership_inactive'
          WHEN EXISTS (
            SELECT 1 FROM locked_membership membership
            WHERE ${input.occurredAt}::timestamptz < membership.starts_at
               OR (membership.ends_at IS NOT NULL AND ${input.occurredAt}::timestamptz > membership.ends_at)
          ) THEN 'invalid_date'
          ELSE 'insufficient_rights'
        END,
        NULL::text
        WHERE NOT EXISTS (SELECT 1 FROM inserted_request)
          AND NOT EXISTS (SELECT 1 FROM existing_request)
        LIMIT 1
        `;
      } catch (error) {
        const databaseError = error as { code?: unknown; constraint?: unknown };
        console.error("[athlete_service_realization] transaction failed", {
          code: typeof databaseError.code === "string" ? databaseError.code : "unknown",
          constraint: typeof databaseError.constraint === "string"
            ? databaseError.constraint
            : "unknown",
        });
        throw new AthleteIncludedServiceRealizationError(
          "transaction",
          "La transaction d’enregistrement a échoué. Réessayez ou contactez le support avec le code transaction_failed.",
        );
      }
      const row = rows[0] as { outcome: RecordOutcome; request_id: string | null } | undefined;
      if (!row) throw new Error("La transaction de réalisation n’a retourné aucun résultat.");
      return { outcome: row.outcome, requestId: row.request_id };
    },
  };
};

export const recordAthleteIncludedServiceRealization = async (
  input: RecordAthleteIncludedServiceRealizationInput,
  {
    now = new Date(),
    repository = createRepository(),
  }: {
    now?: Date;
    repository?: AthleteIncludedServiceRealizationRepository;
  } = {},
): Promise<RecordAthleteIncludedServiceRealizationResult> => {
  const requestId = normalizeRequired(input.realizationId, "realizationId");
  if (!uuidPattern.test(requestId)) {
    throw new AthleteIncludedServiceRealizationError("validation", "realizationId est invalide.");
  }
  const creditType = input.creditType;
  if (creditType !== "production" && creditType !== "custom_content") {
    throw new AthleteIncludedServiceRealizationError("validation", "Le type de droit est invalide.");
  }

  const result = await repository.record({
    requestId,
    movementId: randomUUID(),
    workspaceId: normalizeRequired(input.workspaceId, "workspaceId"),
    athleteId: normalizeRequired(input.athleteId, "athleteId"),
    membershipId: normalizeRequired(input.membershipId, "membershipId"),
    creditType,
    productCode: creditType === "production" ? "photo_session_standard" : "custom_content_single",
    occurredAt: normalizeOccurredAt(input.occurredAt, now),
    note: normalizeNote(input.note),
    adminClerkUserId: normalizeRequired(input.adminClerkUserId, "adminClerkUserId"),
    now: now.toISOString(),
  });

  if (result.outcome === "membership_not_found") {
    throw new AthleteIncludedServiceRealizationError("not_found", "Adhésion introuvable.");
  }
  if (result.outcome === "membership_inactive") {
    throw new AthleteIncludedServiceRealizationError("inactive", "L’adhésion affichée n’est plus active.");
  }
  if (result.outcome === "invalid_date") {
    throw new AthleteIncludedServiceRealizationError(
      "validation",
      "La date de réalisation doit appartenir à la période de l’adhésion.",
    );
  }
  if (result.outcome === "insufficient_rights") {
    throw new AthleteIncludedServiceRealizationError(
      "insufficient_rights",
      "Aucun droit disponible ne peut être consommé.",
    );
  }
  if (!result.requestId) throw new Error("La réalisation enregistrée est incohérente.");
  return { outcome: result.outcome, requestId: result.requestId };
};
