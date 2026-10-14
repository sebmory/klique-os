import type {
  NeonQueryFunctionInTransaction,
  NeonQueryInTransaction,
} from "@neondatabase/serverless";

export type AthleteServiceRequestCommercialCompletionOutcome =
  | "transitioned"
  | "unchanged"
  | "conflict"
  | "missing"
  | "insufficient_rights"
  | "ineligible";

export type AthleteServiceRequestCommercialCompletionInput = {
  workspaceId: string;
  requestId: string;
  deliveryKey: string;
  movementId: string;
  executionId: string;
  completionGuard?: NeonQueryInTransaction;
};

export type AthleteServiceRequestCommercialCompletionTransactionPlan = {
  queries: NeonQueryInTransaction[];
  resultIndex: number;
};

type CompletionResultRow = {
  transition_outcome: AthleteServiceRequestCommercialCompletionOutcome;
};

export const buildAthleteServiceRequestCommercialCompletionTransaction = (
  sql: NeonQueryFunctionInTransaction<false, false>,
  input: AthleteServiceRequestCommercialCompletionInput,
): AthleteServiceRequestCommercialCompletionTransactionPlan => {
  const referenceId = `athlete_service_request:${input.requestId}`;
  const deliveryReferenceId = `${referenceId}:delivery:${input.deliveryKey}`;

  const lockAthleteBalance = sql`
    SELECT membership.id
    FROM athlete_service_requests request
    JOIN athlete_memberships membership
      ON membership.workspace_id = request.workspace_id
      AND membership.athlete_id = request.athlete_id
      AND membership.status = 'active'
    WHERE request.workspace_id = ${input.workspaceId}
      AND request.id = ${input.requestId}::uuid
      AND request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right')
    FOR UPDATE OF membership
  `;
  const lockRequest = sql`
    SELECT request.id
    FROM athlete_service_requests request
    WHERE request.workspace_id = ${input.workspaceId}
      AND request.id = ${input.requestId}::uuid
    FOR UPDATE OF request
  `;
  const lockPurchase = sql`
    SELECT purchase.id
    FROM athlete_service_requests request
    JOIN athlete_credit_purchases purchase
      ON purchase.id = request.purchase_id
      AND purchase.workspace_id = request.workspace_id
      AND purchase.athlete_id = request.athlete_id
    WHERE request.workspace_id = ${input.workspaceId}
      AND request.id = ${input.requestId}::uuid
      AND request.fulfillment_mode IN ('paid_extra', 'paid_with_right')
    FOR UPDATE OF purchase
  `;
  const completeRequest = sql`
    WITH candidate AS (
      SELECT request.*, product.name AS product_name, membership.id AS membership_id,
             purchase.status AS purchase_status, purchase.quantity AS purchase_quantity,
             COALESCE(delivered.quantity, 0) AS delivered_quantity,
             COALESCE(delivery_matches.match_count, 0) AS delivery_match_count,
             COALESCE(delivery_matches.coherent_count, 0) AS coherent_delivery_count,
             COALESCE(balance.quantity, 0) AS credit_balance
      FROM athlete_service_requests request
      JOIN athlete_service_products product ON product.code = request.product_code
      LEFT JOIN athlete_memberships membership
        ON membership.workspace_id = request.workspace_id
        AND membership.athlete_id = request.athlete_id
        AND membership.status = 'active'
      LEFT JOIN athlete_credit_purchases purchase
        ON purchase.id = request.purchase_id
        AND purchase.workspace_id = request.workspace_id
        AND purchase.athlete_id = request.athlete_id
      LEFT JOIN LATERAL (
        SELECT SUM(execution.quantity) AS quantity
        FROM athlete_credit_purchase_executions execution
        WHERE execution.purchase_id = request.purchase_id
      ) delivered ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS match_count,
          COUNT(*) FILTER (
            WHERE execution.purchase_id = request.purchase_id
              AND execution.quantity = 1
          ) AS coherent_count
        FROM athlete_credit_purchase_executions execution
        WHERE execution.reference_id = ${deliveryReferenceId}
      ) delivery_matches ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(movement.quantity) AS quantity
        FROM athlete_credit_movements movement
        WHERE movement.workspace_id = request.workspace_id
          AND movement.athlete_id = request.athlete_id
          AND movement.credit_type = request.snapshot_credit_type
          AND (movement.expires_at IS NULL OR movement.expires_at > NOW())
      ) balance ON TRUE
      WHERE request.workspace_id = ${input.workspaceId}
        AND request.id = ${input.requestId}::uuid
        AND request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right', 'no_charge')
        AND (${input.completionGuard ?? true})
      LIMIT 1
    ),
    referenced_movement AS (
      SELECT movement.*
      FROM athlete_credit_movements movement
      JOIN candidate
        ON movement.source = 'usage'
        AND movement.reference_id = ${referenceId}
    ),
    existing_movement AS (
      SELECT movement.*
      FROM referenced_movement movement
      JOIN candidate
        ON movement.workspace_id = candidate.workspace_id
        AND movement.athlete_id = candidate.athlete_id
        AND movement.credit_type = candidate.snapshot_credit_type
        AND movement.quantity = -candidate.snapshot_credit_quantity
        AND (
          candidate.status = 'completed'
          OR movement.membership_id = candidate.membership_id
        )
    ),
    incompatible_movement AS (
      SELECT 1
      FROM referenced_movement movement
      JOIN candidate ON TRUE
      WHERE movement.workspace_id IS DISTINCT FROM candidate.workspace_id
        OR movement.athlete_id IS DISTINCT FROM candidate.athlete_id
        OR movement.credit_type IS DISTINCT FROM candidate.snapshot_credit_type
        OR movement.quantity IS DISTINCT FROM -candidate.snapshot_credit_quantity
        OR (
          candidate.status <> 'completed'
          AND movement.membership_id IS DISTINCT FROM candidate.membership_id
        )
    ),
    inserted_movement AS (
      INSERT INTO athlete_credit_movements (
        id, workspace_id, athlete_id, membership_id, credit_type, quantity,
        source, reference_id, expires_at, created_at
      )
      SELECT ${input.movementId}::uuid, candidate.workspace_id, candidate.athlete_id,
             candidate.membership_id, candidate.snapshot_credit_type,
             -candidate.snapshot_credit_quantity, 'usage', ${referenceId}, NULL, NOW()
      FROM candidate
      WHERE candidate.status = 'in_progress'
        AND candidate.fulfillment_mode IN ('included_right', 'paid_with_right')
        AND candidate.membership_id IS NOT NULL
        AND candidate.snapshot_credit_type IS NOT NULL
        AND candidate.snapshot_credit_quantity IS NOT NULL
        AND candidate.credit_balance >= candidate.snapshot_credit_quantity
        AND (candidate.fulfillment_mode <> 'paid_with_right' OR candidate.purchase_status = 'paid')
        AND NOT EXISTS (SELECT 1 FROM referenced_movement)
      ON CONFLICT DO NOTHING
      RETURNING *
    ),
    coherent_movement AS (
      SELECT * FROM existing_movement
      UNION ALL
      SELECT * FROM inserted_movement
    ),
    inserted_execution AS (
      INSERT INTO athlete_credit_purchase_executions (
        id, purchase_id, quantity, executed_at, reference_id, created_at
      )
      SELECT ${input.executionId}::uuid, candidate.purchase_id, 1, NOW(),
             ${deliveryReferenceId}, NOW()
      FROM candidate
      WHERE candidate.status = 'in_progress'
        AND candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
        AND candidate.purchase_id IS NOT NULL
        AND candidate.purchase_status = 'paid'
        AND candidate.purchase_quantity IS NOT NULL
        AND candidate.delivered_quantity < candidate.purchase_quantity
        AND candidate.delivery_match_count = 0
        AND (candidate.fulfillment_mode <> 'paid_with_right' OR EXISTS (SELECT 1 FROM coherent_movement))
      ON CONFLICT DO NOTHING
      RETURNING *
    ),
    transitioned AS (
      UPDATE athlete_service_requests request
      SET status = CASE
            WHEN candidate.fulfillment_mode = 'paid_extra'
              AND candidate.delivered_quantity + 1 < candidate.purchase_quantity
              THEN request.status
            ELSE 'completed'
          END,
          completed_at = CASE
            WHEN candidate.fulfillment_mode = 'paid_extra'
              AND candidate.delivered_quantity + 1 < candidate.purchase_quantity
              THEN request.completed_at
            ELSE NOW()
          END,
          usage_movement_id = COALESCE(movement.id, request.usage_movement_id),
          updated_at = NOW()
      FROM candidate
      LEFT JOIN coherent_movement movement ON TRUE
      WHERE request.id = candidate.id
        AND request.workspace_id = candidate.workspace_id
        AND request.status = 'in_progress'
        AND NOT EXISTS (SELECT 1 FROM incompatible_movement)
        AND (
          (candidate.fulfillment_mode = 'included_right' AND EXISTS (SELECT 1 FROM coherent_movement))
          OR (
            candidate.fulfillment_mode = 'paid_with_right'
            AND EXISTS (SELECT 1 FROM coherent_movement)
            AND EXISTS (SELECT 1 FROM inserted_execution)
          )
          OR (candidate.fulfillment_mode = 'paid_extra' AND EXISTS (SELECT 1 FROM inserted_execution))
          OR candidate.fulfillment_mode = 'no_charge'
        )
      RETURNING request.*
    )
    SELECT transitioned.id, transitioned.athlete_id, transitioned.product_code,
           candidate.product_name, transitioned.fulfillment_mode, transitioned.status,
           transitioned.requested_details, transitioned.requested_at, transitioned.scheduled_at,
           transitioned.started_at, transitioned.completed_at, transitioned.refused_at,
           transitioned.refusal_reason, transitioned.snapshot_credit_type,
           transitioned.snapshot_credit_quantity, transitioned.snapshot_price_chf,
           transitioned.purchase_id, candidate.purchase_status, candidate.purchase_quantity,
           (candidate.delivered_quantity + CASE WHEN EXISTS (SELECT 1 FROM inserted_execution) THEN 1 ELSE 0 END) AS delivered_quantity,
           candidate.no_charge_reason,
           'transitioned' AS transition_outcome
    FROM transitioned
    JOIN candidate ON candidate.id = transitioned.id
    UNION ALL
    SELECT candidate.id, candidate.athlete_id, candidate.product_code, candidate.product_name,
           candidate.fulfillment_mode, candidate.status, candidate.requested_details,
           candidate.requested_at, candidate.scheduled_at, candidate.started_at,
           candidate.completed_at, candidate.refused_at, candidate.refusal_reason,
           candidate.snapshot_credit_type, candidate.snapshot_credit_quantity,
           candidate.snapshot_price_chf, candidate.purchase_id, candidate.purchase_status,
           candidate.purchase_quantity, candidate.delivered_quantity,
           candidate.no_charge_reason,
           CASE
             WHEN EXISTS (SELECT 1 FROM incompatible_movement) THEN 'conflict'
             WHEN candidate.delivery_match_count > 0
               AND candidate.coherent_delivery_count <> candidate.delivery_match_count
               THEN 'conflict'
             WHEN candidate.status = 'completed'
               AND candidate.fulfillment_mode = 'included_right'
               AND EXISTS (
                 SELECT 1 FROM coherent_movement movement
                 WHERE movement.id = candidate.usage_movement_id
               ) THEN 'unchanged'
             WHEN candidate.status = 'completed'
               AND candidate.fulfillment_mode = 'paid_with_right'
               AND candidate.purchase_quantity IS NOT NULL
               AND candidate.delivered_quantity = candidate.purchase_quantity
               AND EXISTS (
                 SELECT 1 FROM coherent_movement movement
                 WHERE movement.id = candidate.usage_movement_id
               ) THEN 'unchanged'
             WHEN candidate.status = 'completed'
               AND candidate.fulfillment_mode = 'paid_extra'
               AND candidate.purchase_quantity IS NOT NULL
               AND candidate.delivered_quantity = candidate.purchase_quantity
               THEN 'unchanged'
             WHEN candidate.status = 'completed'
               AND candidate.fulfillment_mode = 'no_charge'
               THEN 'unchanged'
             WHEN candidate.fulfillment_mode = 'paid_extra'
               AND candidate.delivery_match_count = 1
               AND candidate.coherent_delivery_count = 1
               THEN 'unchanged'
             WHEN candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
               AND candidate.purchase_status IS DISTINCT FROM 'paid' THEN 'conflict'
             WHEN candidate.status = 'in_progress'
               AND candidate.fulfillment_mode IN ('included_right', 'paid_with_right')
               AND candidate.membership_id IS NOT NULL
               AND candidate.snapshot_credit_quantity IS NOT NULL
               AND candidate.credit_balance < candidate.snapshot_credit_quantity
               AND NOT EXISTS (SELECT 1 FROM coherent_movement)
               THEN 'insufficient_rights'
             WHEN candidate.membership_id IS NULL
               AND candidate.fulfillment_mode IN ('included_right', 'paid_with_right') THEN 'ineligible'
             ELSE 'conflict'
           END AS transition_outcome
    FROM candidate
    WHERE NOT EXISTS (SELECT 1 FROM transitioned)
    LIMIT 1
  `;
  const assertCompletionConsistency = sql`
    SELECT 1 / CASE
      WHEN (
        NOT EXISTS (
          SELECT 1
          FROM athlete_credit_movements movement
          WHERE movement.id = ${input.movementId}::uuid
        ) OR EXISTS (
          SELECT 1
          FROM athlete_service_requests request
          JOIN athlete_credit_movements movement ON movement.id = request.usage_movement_id
          WHERE request.workspace_id = ${input.workspaceId}
            AND request.id = ${input.requestId}::uuid
            AND request.status = 'completed'
            AND request.fulfillment_mode IN ('included_right', 'paid_with_right')
            AND movement.id = ${input.movementId}::uuid
            AND movement.source = 'usage'
            AND movement.reference_id = ${referenceId}
            AND movement.workspace_id = request.workspace_id
            AND movement.athlete_id = request.athlete_id
            AND movement.credit_type = request.snapshot_credit_type
            AND movement.quantity = -request.snapshot_credit_quantity
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM athlete_credit_purchase_executions execution
          WHERE execution.id = ${input.executionId}::uuid
        ) OR EXISTS (
          SELECT 1
          FROM athlete_service_requests request
          JOIN athlete_credit_purchases purchase
            ON purchase.id = request.purchase_id
            AND purchase.workspace_id = request.workspace_id
            AND purchase.athlete_id = request.athlete_id
          JOIN athlete_credit_purchase_executions inserted
            ON inserted.id = ${input.executionId}::uuid
            AND inserted.purchase_id = purchase.id
            AND inserted.quantity = 1
            AND inserted.reference_id = ${deliveryReferenceId}
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(execution.quantity), 0) AS quantity
            FROM athlete_credit_purchase_executions execution
            WHERE execution.purchase_id = purchase.id
          ) delivered ON TRUE
          WHERE request.workspace_id = ${input.workspaceId}
            AND request.id = ${input.requestId}::uuid
            AND request.fulfillment_mode IN ('paid_extra', 'paid_with_right')
            AND delivered.quantity <= purchase.quantity
            AND (request.status <> 'completed' OR delivered.quantity = purchase.quantity)
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM athlete_service_requests request
        WHERE request.workspace_id = ${input.workspaceId}
          AND request.id = ${input.requestId}::uuid
          AND request.status = 'completed'
          AND (
            (
              request.fulfillment_mode IN ('included_right', 'paid_with_right')
              AND NOT EXISTS (
                SELECT 1
                FROM athlete_credit_movements movement
                WHERE movement.id = request.usage_movement_id
                  AND movement.source = 'usage'
                  AND movement.reference_id = ${referenceId}
                  AND movement.workspace_id = request.workspace_id
                  AND movement.athlete_id = request.athlete_id
                  AND movement.credit_type = request.snapshot_credit_type
                  AND movement.quantity = -request.snapshot_credit_quantity
              )
            )
            OR (
              request.fulfillment_mode IN ('paid_extra', 'paid_with_right')
              AND NOT EXISTS (
                SELECT 1
                FROM athlete_credit_purchases purchase
                LEFT JOIN LATERAL (
                  SELECT COALESCE(SUM(execution.quantity), 0) AS quantity
                  FROM athlete_credit_purchase_executions execution
                  WHERE execution.purchase_id = purchase.id
                ) delivered ON TRUE
                WHERE purchase.id = request.purchase_id
                  AND purchase.workspace_id = request.workspace_id
                  AND purchase.athlete_id = request.athlete_id
                  AND delivered.quantity = purchase.quantity
              )
            )
          )
      ) THEN 1 ELSE 0
    END AS completion_consistent
  `;

  return {
    queries: [
      lockAthleteBalance,
      lockRequest,
      lockPurchase,
      completeRequest,
      assertCompletionConsistency,
    ],
    resultIndex: 3,
  };
};

export const readAthleteServiceRequestCommercialCompletionResult = <
  Row extends CompletionResultRow,
>(
  results: unknown[][],
  resultIndex: number,
): { outcome: AthleteServiceRequestCommercialCompletionOutcome; row: Row | null } => {
  const row = (results[resultIndex] as Row[] | undefined)?.[0] ?? null;
  return {
    outcome: row?.transition_outcome ?? "missing",
    row,
  };
};
