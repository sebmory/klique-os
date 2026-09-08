import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  AthleteCreditBalance,
  AthleteCreditType,
  AthleteMembershipPlan,
} from "@/lib/athlete-credits";
import type {
  AthleteServiceFulfillmentKind,
  AthleteServiceProduct,
  AthleteServiceProductCode,
} from "@/lib/athlete-service-catalog";

export type AthleteServiceRequestFulfillmentMode =
  | "included_right"
  | "paid_extra"
  | "paid_with_right"
  | "no_charge";

export type AthleteServiceRequestClientFulfillmentMode = Exclude<
  AthleteServiceRequestFulfillmentMode,
  "no_charge"
>;

export type AthleteServiceRequestStatus =
  | "received"
  | "to_confirm"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "refused";

export type AthleteServiceRequestPurchaseStatus = "pending" | "paid" | "cancelled" | "refunded";

export type AthleteServiceRequestInput = {
  productCode: AthleteServiceProductCode;
  fulfillmentMode: AthleteServiceRequestClientFulfillmentMode;
  message?: string;
  preferredDate?: string;
};

export type PublicAthleteServiceRequest = {
  id: string;
  productCode: AthleteServiceProductCode;
  fulfillmentMode: AthleteServiceRequestFulfillmentMode;
  status: AthleteServiceRequestStatus;
  message: string | null;
  preferredDate: string | null;
  requestedAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  refusedAt: string | null;
  refusalReason: string | null;
  snapshotPriceChf: number | null;
  memberConfirmed: boolean;
  purchaseStatus: AthleteServiceRequestPurchaseStatus | null;
  purchasedQuantity: number | null;
  deliveredQuantity: number;
};

export type AdminAthleteServiceRequest = PublicAthleteServiceRequest & {
  athleteId: string;
  productName: string;
  snapshotCreditType: AthleteCreditType | null;
  snapshotCreditQuantity: number | null;
  snapshotPriceChf: number | null;
  paymentReference: string | null;
  paymentUpdatedAt: string | null;
  noChargeReason: string | null;
};

export type AdminAthleteServiceRequestTransition =
  | { outcome: "transitioned" | "unchanged"; request: AdminAthleteServiceRequest }
  | { outcome: "conflict" | "missing" | "insufficient_rights" | "ineligible" | "paid_purchase"; request: null };

export type AthleteServiceRequestMemberConfirmationResult =
  | { outcome: "confirmed" | "unchanged"; request: PublicAthleteServiceRequest }
  | { outcome: "conflict" | "missing" | "insufficient_rights" | "ineligible"; request: null };

type RequestedDetails = {
  message?: string;
  preferredDate?: string;
};

type AthleteServiceRequestRow = {
  id?: string;
  athlete_id?: string;
  product_code: AthleteServiceProductCode;
  product_name?: string;
  fulfillment_mode: AthleteServiceRequestFulfillmentMode;
  status: AthleteServiceRequestStatus;
  requested_details: unknown;
  requested_at: string | Date;
  scheduled_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  refused_at: string | Date | null;
  refusal_reason: string | null;
  snapshot_credit_type?: AthleteCreditType | null;
  snapshot_credit_quantity?: number | string | null;
  snapshot_price_chf?: number | string | null;
  purchase_id?: string | null;
  purchase_status?: AthleteServiceRequestPurchaseStatus | null;
  payment_reference?: string | null;
  purchase_updated_at?: string | Date | null;
  purchase_quantity?: number | string | null;
  delivered_quantity?: number | string | null;
  no_charge_reason?: string | null;
};

export type AthleteServiceRequestCreationContext = {
  product: AthleteServiceProduct | null;
  membershipActive: boolean;
  plan: AthleteMembershipPlan | null;
  balance: AthleteCreditBalance;
  reserved: AthleteCreditBalance;
};

export type AthleteServiceRequestCreateRecord = {
  id: string;
  workspaceId: string;
  athleteId: string;
  productCode: AthleteServiceProductCode;
  fulfillmentMode: AthleteServiceRequestClientFulfillmentMode;
  requestedDetails: RequestedDetails;
  snapshotCreditType: AthleteCreditType | null;
  snapshotCreditQuantity: number | null;
  snapshotPriceChf: number | null;
};

export type AthleteServiceRequestRepository = {
  list: (workspaceId: string, athleteId: string) => Promise<PublicAthleteServiceRequest[]>;
  loadCreationContext: (
    workspaceId: string,
    athleteId: string,
    productCode: AthleteServiceProductCode,
  ) => Promise<AthleteServiceRequestCreationContext>;
  create: (record: AthleteServiceRequestCreateRecord) => Promise<PublicAthleteServiceRequest>;
};

export type AthleteServiceRequestMemberConfirmationRepository = {
  confirm: (input: {
    workspaceId: string;
    athleteId: string;
    requestId: string;
  }) => Promise<AthleteServiceRequestMemberConfirmationResult>;
};

export type AdminAthleteServiceRequestRepository = {
  list: (workspaceId: string) => Promise<AdminAthleteServiceRequest[]>;
  schedule: (input: {
    workspaceId: string;
    requestId: string;
    scheduledAt: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  start: (input: {
    workspaceId: string;
    requestId: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  complete: (input: {
    workspaceId: string;
    requestId: string;
    deliveryKey: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  assumeNoCharge: (input: {
    workspaceId: string;
    requestId: string;
    reason: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  confirmPayment: (input: {
    workspaceId: string;
    requestId: string;
    paymentReference: string;
  }) => Promise<AdminAthleteServiceRequestTransition>;
  transition: (input: {
    workspaceId: string;
    requestId: string;
    nextStatus: "to_confirm" | "refused";
    refusalReason: string | null;
  }) => Promise<AdminAthleteServiceRequestTransition>;
};

export type AthleteServiceRequestErrorCode =
  | "invalid_input"
  | "inactive_product"
  | "inactive_membership"
  | "plan_not_allowed"
  | "invalid_fulfillment_mode"
  | "insufficient_rights";

export class AthleteServiceRequestError extends Error {
  constructor(
    public readonly code: AthleteServiceRequestErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const productCodes: AthleteServiceProductCode[] = [
  "photo_session_standard",
  "match_coverage_individual",
  "match_coverage_upgrade",
  "editorial_interview",
  "custom_content_single",
  "custom_content_pack_5",
  "simple_video_capsule",
];

const fulfillmentModes: AthleteServiceRequestClientFulfillmentMode[] = [
  "included_right",
  "paid_extra",
  "paid_with_right",
];

const normalize = (value: unknown): string => String(value ?? "").trim();
const toIsoString = (value: string | Date | null): string | null =>
  value === null ? null : new Date(value).toISOString();

const parseRequestedDetails = (value: unknown): RequestedDetails => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const details = value as Record<string, unknown>;
  return {
    ...(typeof details.message === "string" ? { message: details.message } : {}),
    ...(typeof details.preferredDate === "string" ? { preferredDate: details.preferredDate } : {}),
  };
};

const mapPublicRequest = (row: AthleteServiceRequestRow): PublicAthleteServiceRequest => {
  const details = parseRequestedDetails(row.requested_details);
  return {
    id: String(row.id ?? ""),
    productCode: row.product_code,
    fulfillmentMode: row.fulfillment_mode,
    status: row.status,
    message: details.message ?? null,
    preferredDate: details.preferredDate ?? null,
    requestedAt: toIsoString(row.requested_at)!,
    scheduledAt: toIsoString(row.scheduled_at),
    startedAt: toIsoString(row.started_at),
    completedAt: toIsoString(row.completed_at),
    refusedAt: toIsoString(row.refused_at),
    refusalReason: row.refusal_reason,
    snapshotPriceChf: row.snapshot_price_chf === null || row.snapshot_price_chf === undefined
      ? null
      : Number(row.snapshot_price_chf),
    memberConfirmed: Boolean(row.purchase_id),
    purchaseStatus: row.purchase_status ?? (row.purchase_id ? "pending" : null),
    purchasedQuantity: row.purchase_quantity === null || row.purchase_quantity === undefined
      ? null
      : Number(row.purchase_quantity),
    deliveredQuantity: row.delivered_quantity === null || row.delivered_quantity === undefined
      ? 0
      : Number(row.delivered_quantity),
  };
};

const mapAdminRequest = (row: AthleteServiceRequestRow): AdminAthleteServiceRequest => ({
  ...mapPublicRequest(row),
  athleteId: String(row.athlete_id ?? ""),
  productName: String(row.product_name ?? row.product_code),
  snapshotCreditType: row.snapshot_credit_type ?? null,
  snapshotCreditQuantity: row.snapshot_credit_quantity === null || row.snapshot_credit_quantity === undefined
    ? null
    : Number(row.snapshot_credit_quantity),
  snapshotPriceChf: row.snapshot_price_chf === null || row.snapshot_price_chf === undefined
    ? null
    : Number(row.snapshot_price_chf),
  paymentReference: row.payment_reference ?? null,
  paymentUpdatedAt: toIsoString(row.purchase_updated_at ?? null),
  noChargeReason: row.no_charge_reason ?? null,
});

const mapProduct = (row: Record<string, unknown>): AthleteServiceProduct => ({
  code: row.product_code as AthleteServiceProductCode,
  name: String(row.product_name),
  active: row.product_active === true,
  priceChf: Number(row.price_chf),
  fulfillmentKind: row.fulfillment_kind as AthleteServiceFulfillmentKind,
  includedDeliverables: Number(row.included_deliverables),
  commercialScope: String(row.commercial_scope),
  allowedPlanCodes: row.allowed_plan_codes as string[] | null,
  requiredProductionCredits: Number(row.required_production_credits),
  validityMonths: 12,
});

const mapPlan = (row: Record<string, unknown>): AthleteMembershipPlan | null => {
  if (!row.plan_code) return null;
  return {
    code: String(row.plan_code),
    name: String(row.plan_name),
    active: row.plan_active === true,
    durationMonths: row.duration_months === null ? null : Number(row.duration_months),
    annualPriceChf: row.annual_price_chf === null ? null : Number(row.annual_price_chf),
    monthlyInstallmentChf: row.monthly_installment_chf === null ? null : Number(row.monthly_installment_chf),
    productionCredits: row.production_credits === null ? null : Number(row.production_credits),
    customContentCredits: row.custom_content_credits === null ? null : Number(row.custom_content_credits),
    videoAllowed: row.video_allowed === null ? null : row.video_allowed === true,
    metadata: (row.plan_metadata as Record<string, unknown> | null) ?? {},
  };
};

const createRepository = (): AthleteServiceRequestRepository => {
  const sql = createContentStorageClient();
  return {
    async list(workspaceId, athleteId) {
      const rows = await sql`
        SELECT request.id, request.product_code, request.fulfillment_mode, request.status,
               request.requested_details, request.requested_at, request.scheduled_at,
               request.started_at, request.completed_at, request.refused_at,
               request.refusal_reason, request.snapshot_price_chf, request.purchase_id,
               purchase.status AS purchase_status, purchase.quantity AS purchase_quantity,
               COALESCE(delivered.quantity, 0) AS delivered_quantity
        FROM athlete_service_requests request
        LEFT JOIN athlete_credit_purchases purchase ON purchase.id = request.purchase_id
        LEFT JOIN LATERAL (
          SELECT SUM(execution.quantity) AS quantity
          FROM athlete_credit_purchase_executions execution
          WHERE execution.purchase_id = request.purchase_id
        ) delivered ON TRUE
        WHERE request.workspace_id = ${workspaceId}
          AND request.athlete_id = ${athleteId}
        ORDER BY request.requested_at DESC
      `;
      return (rows as AthleteServiceRequestRow[]).map(mapPublicRequest);
    },
    async loadCreationContext(workspaceId, athleteId, productCode) {
      const rows = await sql`
        SELECT
          p.code AS product_code, p.name AS product_name, p.active AS product_active,
          p.price_chf, p.fulfillment_kind, p.included_deliverables, p.commercial_scope,
          p.allowed_plan_codes, p.required_production_credits,
          m.id AS membership_id,
          plan.code AS plan_code, plan.name AS plan_name, plan.active AS plan_active,
          plan.duration_months, plan.annual_price_chf, plan.monthly_installment_chf,
          plan.production_credits, plan.custom_content_credits, plan.video_allowed,
          plan.metadata AS plan_metadata,
          COALESCE((
            SELECT SUM(movement.quantity)
            FROM athlete_credit_movements movement
            WHERE movement.workspace_id = ${workspaceId}
              AND movement.athlete_id = ${athleteId}
              AND movement.credit_type = 'production'
              AND (movement.expires_at IS NULL OR movement.expires_at > NOW())
          ), 0) AS production_balance,
          COALESCE((
            SELECT SUM(movement.quantity)
            FROM athlete_credit_movements movement
            WHERE movement.workspace_id = ${workspaceId}
              AND movement.athlete_id = ${athleteId}
              AND movement.credit_type = 'custom_content'
              AND (movement.expires_at IS NULL OR movement.expires_at > NOW())
          ), 0) AS custom_content_balance,
          COALESCE((
            SELECT SUM(request.snapshot_credit_quantity)
            FROM athlete_service_requests request
            WHERE request.workspace_id = ${workspaceId}
              AND request.athlete_id = ${athleteId}
              AND request.status IN ('scheduled', 'in_progress')
              AND request.snapshot_credit_type = 'production'
          ), 0) AS production_reserved,
          COALESCE((
            SELECT SUM(request.snapshot_credit_quantity)
            FROM athlete_service_requests request
            WHERE request.workspace_id = ${workspaceId}
              AND request.athlete_id = ${athleteId}
              AND request.status IN ('scheduled', 'in_progress')
              AND request.snapshot_credit_type = 'custom_content'
          ), 0) AS custom_content_reserved
        FROM athlete_service_products p
        LEFT JOIN LATERAL (
          SELECT membership.id, membership.plan_code
          FROM athlete_memberships membership
          WHERE membership.workspace_id = ${workspaceId}
            AND membership.athlete_id = ${athleteId}
            AND membership.status = 'active'
            AND membership.starts_at <= NOW()
            AND (membership.ends_at IS NULL OR membership.ends_at > NOW())
          ORDER BY membership.starts_at DESC, membership.created_at DESC
          LIMIT 1
        ) m ON TRUE
        LEFT JOIN membership_plans plan
          ON plan.code = m.plan_code
          AND plan.active = TRUE
        WHERE p.code = ${productCode}
          AND p.active = TRUE
        LIMIT 1
      `;
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return {
          product: null,
          membershipActive: false,
          plan: null,
          balance: { production: 0, custom_content: 0 },
          reserved: { production: 0, custom_content: 0 },
        };
      }
      return {
        product: mapProduct(row),
        membershipActive: Boolean(row.membership_id),
        plan: mapPlan(row),
        balance: {
          production: Number(row.production_balance),
          custom_content: Number(row.custom_content_balance),
        },
        reserved: {
          production: Number(row.production_reserved),
          custom_content: Number(row.custom_content_reserved),
        },
      };
    },
    async create(record) {
      const rows = await sql`
        INSERT INTO athlete_service_requests (
          id, workspace_id, athlete_id, product_code, fulfillment_mode, status,
          requested_details, snapshot_credit_type, snapshot_credit_quantity,
          snapshot_price_chf, requested_at, created_at, updated_at
        ) VALUES (
          ${record.id}::uuid, ${record.workspaceId}, ${record.athleteId}, ${record.productCode},
          ${record.fulfillmentMode}, 'received', ${JSON.stringify(record.requestedDetails)}::jsonb,
          ${record.snapshotCreditType}, ${record.snapshotCreditQuantity}, ${record.snapshotPriceChf},
          NOW(), NOW(), NOW()
        )
        RETURNING id, product_code, fulfillment_mode, status, requested_details, requested_at,
            scheduled_at, started_at, completed_at, refused_at, refusal_reason, purchase_id
      `;
      return mapPublicRequest(rows[0] as AthleteServiceRequestRow);
    },
  };
};

const createAdminRepository = (): AdminAthleteServiceRequestRepository => {
  const sql = createContentStorageClient();
  return {
    async list(workspaceId) {
      const rows = await sql`
         SELECT request.id, request.athlete_id, request.product_code, product.name AS product_name,
               request.fulfillment_mode, request.status, request.requested_details, request.requested_at,
               request.scheduled_at, request.started_at, request.completed_at, request.refused_at,
               request.refusal_reason, request.no_charge_reason, request.snapshot_credit_type,
               request.snapshot_credit_quantity,
           request.snapshot_price_chf, request.purchase_id, purchase.status AS purchase_status,
           purchase.payment_reference, purchase.updated_at AS purchase_updated_at,
           purchase.quantity AS purchase_quantity, COALESCE(delivered.quantity, 0) AS delivered_quantity
        FROM athlete_service_requests request
        JOIN athlete_service_products product ON product.code = request.product_code
         LEFT JOIN athlete_credit_purchases purchase ON purchase.id = request.purchase_id
         LEFT JOIN LATERAL (
           SELECT SUM(execution.quantity) AS quantity
           FROM athlete_credit_purchase_executions execution
           WHERE execution.purchase_id = request.purchase_id
         ) delivered ON TRUE
        WHERE request.workspace_id = ${workspaceId}
        ORDER BY CASE WHEN request.status = 'received' THEN 0 ELSE 1 END, request.requested_at DESC
      `;
      return (rows as AthleteServiceRequestRow[]).map(mapAdminRequest);
    },
    async schedule({ workspaceId, requestId, scheduledAt }) {
      const lockAthleteBalance = sql`
        SELECT membership.id
        FROM athlete_service_requests request
        JOIN athlete_memberships membership
          ON membership.workspace_id = request.workspace_id
          AND membership.athlete_id = request.athlete_id
          AND membership.status = 'active'
          AND membership.starts_at <= NOW()
          AND (membership.ends_at IS NULL OR membership.ends_at > NOW())
        WHERE request.workspace_id = ${workspaceId}
          AND request.id = ${requestId}::uuid
          AND request.fulfillment_mode IN ('included_right', 'paid_with_right')
        FOR UPDATE OF membership
      `;
      const scheduleRequest = sql`
        WITH candidate AS (
          SELECT request.*,
                 product.name AS product_name,
                 membership.id AS active_membership_id,
                 membership.plan_code,
                 plan.active AS plan_active,
                 product.active AS product_active,
                 product.allowed_plan_codes,
                 plan.video_allowed,
                 purchase.status AS purchase_status,
                 purchase.payment_reference,
                 purchase.updated_at AS purchase_updated_at,
                 COALESCE(balance.quantity, 0) AS credit_balance,
                 COALESCE(reserved.quantity, 0) AS reserved_quantity
          FROM athlete_service_requests request
          JOIN athlete_service_products product ON product.code = request.product_code
          LEFT JOIN athlete_memberships membership
            ON membership.workspace_id = request.workspace_id
            AND membership.athlete_id = request.athlete_id
            AND membership.status = 'active'
            AND membership.starts_at <= NOW()
            AND (membership.ends_at IS NULL OR membership.ends_at > NOW())
          LEFT JOIN membership_plans plan ON plan.code = membership.plan_code
          LEFT JOIN athlete_credit_purchases purchase ON purchase.id = request.purchase_id
          LEFT JOIN LATERAL (
            SELECT SUM(movement.quantity) AS quantity
            FROM athlete_credit_movements movement
            WHERE movement.workspace_id = request.workspace_id
              AND movement.athlete_id = request.athlete_id
              AND movement.credit_type = request.snapshot_credit_type
              AND (movement.expires_at IS NULL OR movement.expires_at > NOW())
          ) balance ON TRUE
          LEFT JOIN LATERAL (
            SELECT SUM(reservation.snapshot_credit_quantity) AS quantity
            FROM athlete_service_requests reservation
            WHERE reservation.workspace_id = request.workspace_id
              AND reservation.athlete_id = request.athlete_id
              AND reservation.snapshot_credit_type = request.snapshot_credit_type
              AND reservation.status IN ('scheduled', 'in_progress')
          ) reserved ON TRUE
          WHERE request.workspace_id = ${workspaceId}
            AND request.id = ${requestId}::uuid
        ),
        transitioned AS (
          UPDATE athlete_service_requests request
          SET status = 'scheduled', scheduled_at = ${scheduledAt}::timestamptz, updated_at = NOW()
          FROM candidate
          WHERE request.id = candidate.id
            AND candidate.status = 'to_confirm'
            AND (
              candidate.fulfillment_mode NOT IN ('paid_extra', 'paid_with_right')
              OR candidate.purchase_status IN ('pending', 'paid')
            )
            AND (
              candidate.fulfillment_mode NOT IN ('included_right', 'paid_with_right')
              OR (
                candidate.active_membership_id IS NOT NULL
                AND candidate.plan_active = TRUE
                AND candidate.product_active = TRUE
                AND (candidate.allowed_plan_codes IS NULL OR candidate.plan_code = ANY(candidate.allowed_plan_codes))
                AND (candidate.product_code <> 'simple_video_capsule' OR candidate.video_allowed = TRUE)
                AND candidate.snapshot_credit_type IS NOT NULL
                AND candidate.snapshot_credit_quantity IS NOT NULL
                AND candidate.credit_balance - candidate.reserved_quantity >= candidate.snapshot_credit_quantity
              )
            )
          RETURNING request.*
        )
        SELECT transitioned.id, transitioned.athlete_id, transitioned.product_code,
               candidate.product_name, transitioned.fulfillment_mode, transitioned.status,
               transitioned.requested_details, transitioned.requested_at, transitioned.scheduled_at,
               transitioned.started_at, transitioned.completed_at, transitioned.refused_at,
               transitioned.refusal_reason, transitioned.snapshot_credit_type,
               transitioned.snapshot_credit_quantity, transitioned.snapshot_price_chf,
               transitioned.purchase_id, candidate.purchase_status,
               candidate.payment_reference, candidate.purchase_updated_at,
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
               candidate.payment_reference, candidate.purchase_updated_at,
               candidate.no_charge_reason,
               CASE
                 WHEN candidate.status = 'scheduled'
                   AND candidate.scheduled_at = ${scheduledAt}::timestamptz THEN 'unchanged'
                 WHEN candidate.status <> 'to_confirm' THEN 'conflict'
                 WHEN candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
                   AND candidate.purchase_status NOT IN ('pending', 'paid') THEN 'conflict'
                 WHEN candidate.fulfillment_mode IN ('included_right', 'paid_with_right')
                   AND NOT (
                     candidate.active_membership_id IS NOT NULL
                     AND candidate.plan_active = TRUE
                     AND candidate.product_active = TRUE
                     AND (candidate.allowed_plan_codes IS NULL OR candidate.plan_code = ANY(candidate.allowed_plan_codes))
                     AND (candidate.product_code <> 'simple_video_capsule' OR candidate.video_allowed = TRUE)
                   ) THEN 'ineligible'
                 WHEN candidate.fulfillment_mode IN ('included_right', 'paid_with_right')
                   AND candidate.credit_balance - candidate.reserved_quantity < candidate.snapshot_credit_quantity
                   THEN 'insufficient_rights'
                 ELSE 'conflict'
               END AS transition_outcome
        FROM candidate
        WHERE NOT EXISTS (SELECT 1 FROM transitioned)
        LIMIT 1
      `;
      const results = await sql.transaction([lockAthleteBalance, scheduleRequest]);
      const row = (results[1] as (AthleteServiceRequestRow & { transition_outcome: string })[])[0];
      if (!row) return { outcome: "missing", request: null };
      if (row.transition_outcome === "conflict" || row.transition_outcome === "insufficient_rights" || row.transition_outcome === "ineligible") {
        return { outcome: row.transition_outcome, request: null };
      }
      return {
        outcome: row.transition_outcome === "transitioned" ? "transitioned" : "unchanged",
        request: mapAdminRequest(row),
      };
    },
    async start({ workspaceId, requestId }) {
      const lockAthleteBalance = sql`
        SELECT membership.id
        FROM athlete_service_requests request
        JOIN athlete_memberships membership
          ON membership.workspace_id = request.workspace_id
          AND membership.athlete_id = request.athlete_id
          AND membership.status = 'active'
        WHERE request.workspace_id = ${workspaceId}
          AND request.id = ${requestId}::uuid
          AND request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right')
        FOR UPDATE OF membership
      `;
      const startRequest = sql`
        WITH candidate AS (
          SELECT request.*, product.name AS product_name, purchase.status AS purchase_status
          FROM athlete_service_requests request
          JOIN athlete_service_products product ON product.code = request.product_code
          LEFT JOIN athlete_credit_purchases purchase
            ON purchase.id = request.purchase_id
            AND purchase.workspace_id = request.workspace_id
            AND purchase.athlete_id = request.athlete_id
          WHERE request.workspace_id = ${workspaceId}
            AND request.id = ${requestId}::uuid
          LIMIT 1
        ),
        transitioned AS (
          UPDATE athlete_service_requests request
          SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
          FROM candidate
          WHERE request.id = candidate.id
            AND candidate.status = 'scheduled'
            AND candidate.scheduled_at <= NOW()
            AND (
              candidate.fulfillment_mode IN ('included_right', 'no_charge')
              OR (
                candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
                AND candidate.purchase_status = 'paid'
              )
            )
          RETURNING request.*
        )
        SELECT transitioned.id, transitioned.athlete_id, transitioned.product_code,
               candidate.product_name, transitioned.fulfillment_mode, transitioned.status,
               transitioned.requested_details, transitioned.requested_at, transitioned.scheduled_at,
               transitioned.started_at, transitioned.completed_at, transitioned.refused_at,
               transitioned.refusal_reason, transitioned.snapshot_credit_type,
               transitioned.snapshot_credit_quantity, transitioned.snapshot_price_chf,
               transitioned.purchase_id, candidate.purchase_status, candidate.no_charge_reason,
               'transitioned' AS transition_outcome
        FROM transitioned
        JOIN candidate ON candidate.id = transitioned.id
        UNION ALL
        SELECT candidate.id, candidate.athlete_id, candidate.product_code, candidate.product_name,
               candidate.fulfillment_mode, candidate.status, candidate.requested_details, candidate.requested_at,
               candidate.scheduled_at, candidate.started_at, candidate.completed_at, candidate.refused_at,
               candidate.refusal_reason, candidate.snapshot_credit_type, candidate.snapshot_credit_quantity,
               candidate.snapshot_price_chf, candidate.purchase_id, candidate.purchase_status,
               candidate.no_charge_reason,
               CASE
                 WHEN candidate.status = 'in_progress'
                   AND (
                     candidate.fulfillment_mode IN ('included_right', 'no_charge')
                     OR candidate.purchase_status = 'paid'
                   )
                   THEN 'unchanged'
                 ELSE 'conflict'
               END AS transition_outcome
        FROM candidate
        WHERE NOT EXISTS (SELECT 1 FROM transitioned)
        LIMIT 1
      `;
      const results = await sql.transaction([lockAthleteBalance, startRequest]);
      const row = (results[1] as (AthleteServiceRequestRow & { transition_outcome: string })[])[0];
      if (!row) return { outcome: "missing", request: null };
      if (row.transition_outcome === "conflict") return { outcome: "conflict", request: null };
      return {
        outcome: row.transition_outcome === "transitioned" ? "transitioned" : "unchanged",
        request: mapAdminRequest(row),
      };
    },
    async complete({ workspaceId, requestId, deliveryKey }) {
      const movementId = randomUUID();
      const executionId = randomUUID();
      const referenceId = `athlete_service_request:${requestId}`;
      const deliveryReferenceId = `${referenceId}:delivery:${deliveryKey}`;
      const lockAthleteBalance = sql`
        SELECT membership.id
        FROM athlete_service_requests request
        JOIN athlete_memberships membership
          ON membership.workspace_id = request.workspace_id
          AND membership.athlete_id = request.athlete_id
          AND membership.status = 'active'
        WHERE request.workspace_id = ${workspaceId}
          AND request.id = ${requestId}::uuid
          AND request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right')
        FOR UPDATE OF membership
      `;
      const completeRequest = sql`
        WITH candidate AS (
          SELECT request.*, product.name AS product_name, membership.id AS membership_id,
                 purchase.status AS purchase_status, purchase.quantity AS purchase_quantity,
                 COALESCE(delivered.quantity, 0) AS delivered_quantity,
                 existing_delivery.id AS existing_delivery_id
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
            SELECT execution.id
            FROM athlete_credit_purchase_executions execution
            WHERE execution.purchase_id = request.purchase_id
              AND execution.reference_id = ${deliveryReferenceId}
            LIMIT 1
          ) existing_delivery ON TRUE
          WHERE request.workspace_id = ${workspaceId}
            AND request.id = ${requestId}::uuid
            AND request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right', 'no_charge')
          LIMIT 1
        ),
        existing_movement AS (
          SELECT movement.*
          FROM athlete_credit_movements movement
          JOIN candidate
            ON movement.workspace_id = candidate.workspace_id
            AND movement.athlete_id = candidate.athlete_id
            AND movement.credit_type = candidate.snapshot_credit_type
            AND movement.quantity = -candidate.snapshot_credit_quantity
          WHERE movement.source = 'usage'
            AND movement.reference_id = ${referenceId}
        ),
        inserted_movement AS (
          INSERT INTO athlete_credit_movements (
            id, workspace_id, athlete_id, membership_id, credit_type, quantity,
            source, reference_id, expires_at, created_at
          )
          SELECT ${movementId}::uuid, candidate.workspace_id, candidate.athlete_id,
                 candidate.membership_id, candidate.snapshot_credit_type,
                 -candidate.snapshot_credit_quantity, 'usage', ${referenceId}, NULL, NOW()
          FROM candidate
          WHERE candidate.status = 'in_progress'
            AND candidate.fulfillment_mode IN ('included_right', 'paid_with_right')
            AND candidate.membership_id IS NOT NULL
            AND candidate.snapshot_credit_type IS NOT NULL
            AND candidate.snapshot_credit_quantity IS NOT NULL
            AND (candidate.fulfillment_mode <> 'paid_with_right' OR candidate.purchase_status = 'paid')
            AND NOT EXISTS (SELECT 1 FROM existing_movement)
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
          SELECT ${executionId}::uuid, candidate.purchase_id, 1, NOW(),
                 ${deliveryReferenceId}, NOW()
          FROM candidate
          WHERE candidate.status = 'in_progress'
            AND candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
            AND candidate.purchase_id IS NOT NULL
            AND candidate.purchase_status = 'paid'
            AND candidate.purchase_quantity IS NOT NULL
            AND candidate.delivered_quantity < candidate.purchase_quantity
            AND candidate.existing_delivery_id IS NULL
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
          LEFT JOIN inserted_movement movement ON TRUE
          WHERE request.id = candidate.id
            AND request.status = 'in_progress'
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
                 WHEN candidate.status = 'completed'
                   AND candidate.fulfillment_mode = 'included_right'
                   AND EXISTS (
                     SELECT 1 FROM coherent_movement movement
                     WHERE movement.id = candidate.usage_movement_id
                       AND movement.workspace_id = candidate.workspace_id
                       AND movement.athlete_id = candidate.athlete_id
                       AND movement.credit_type = candidate.snapshot_credit_type
                       AND movement.quantity = -candidate.snapshot_credit_quantity
                   ) THEN 'unchanged'
                 WHEN candidate.status = 'completed'
                   AND candidate.fulfillment_mode = 'paid_with_right'
                   AND candidate.purchase_quantity IS NOT NULL
                   AND candidate.delivered_quantity = candidate.purchase_quantity
                   AND EXISTS (
                     SELECT 1 FROM coherent_movement movement
                     WHERE movement.id = candidate.usage_movement_id
                       AND movement.workspace_id = candidate.workspace_id
                       AND movement.athlete_id = candidate.athlete_id
                       AND movement.credit_type = candidate.snapshot_credit_type
                       AND movement.quantity = -candidate.snapshot_credit_quantity
                   ) THEN 'unchanged'
                 WHEN candidate.status = 'completed'
                   AND candidate.fulfillment_mode = 'paid_extra'
                   AND candidate.purchase_quantity IS NOT NULL
                   AND candidate.delivered_quantity = candidate.purchase_quantity
                   THEN 'unchanged'
                 WHEN candidate.status = 'completed'
                   AND candidate.fulfillment_mode = 'no_charge'
                   THEN 'unchanged'
                 WHEN candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
                   AND candidate.existing_delivery_id IS NOT NULL
                   THEN 'unchanged'
                 WHEN candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
                   AND candidate.purchase_status IS DISTINCT FROM 'paid' THEN 'conflict'
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
              WHERE movement.source = 'usage'
                AND movement.reference_id = ${referenceId}
            ) OR EXISTS (
              SELECT 1
              FROM athlete_service_requests request
              JOIN athlete_credit_movements movement ON movement.id = request.usage_movement_id
              WHERE request.workspace_id = ${workspaceId}
                AND request.id = ${requestId}::uuid
                AND request.status = 'completed'
                AND request.fulfillment_mode IN ('included_right', 'paid_with_right')
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
              FROM athlete_service_requests request
              WHERE request.workspace_id = ${workspaceId}
                AND request.id = ${requestId}::uuid
                AND request.fulfillment_mode IN ('paid_extra', 'paid_with_right')
                AND request.purchase_id IS NOT NULL
            ) OR EXISTS (
              SELECT 1
              FROM athlete_service_requests request
              JOIN athlete_credit_purchases purchase ON purchase.id = request.purchase_id
              LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(execution.quantity), 0) AS quantity
                FROM athlete_credit_purchase_executions execution
                WHERE execution.purchase_id = request.purchase_id
              ) delivered ON TRUE
              WHERE request.workspace_id = ${workspaceId}
                AND request.id = ${requestId}::uuid
                AND delivered.quantity <= purchase.quantity
                AND (request.status <> 'completed' OR delivered.quantity = purchase.quantity)
            )
          ) THEN 1 ELSE 0
        END AS completion_consistent
      `;
      const results = await sql.transaction([
        lockAthleteBalance,
        completeRequest,
        assertCompletionConsistency,
      ]);
      const row = (results[1] as (AthleteServiceRequestRow & { transition_outcome: string })[])[0];
      if (!row) return { outcome: "missing", request: null };
      if (row.transition_outcome === "conflict" || row.transition_outcome === "ineligible") {
        return { outcome: row.transition_outcome, request: null };
      }
      return {
        outcome: row.transition_outcome === "transitioned" ? "transitioned" : "unchanged",
        request: mapAdminRequest(row),
      };
    },
    async confirmPayment({ workspaceId, requestId, paymentReference }) {
      const lockRequest = sql`
        SELECT id
        FROM athlete_service_requests
        WHERE workspace_id = ${workspaceId}
          AND id = ${requestId}::uuid
        FOR UPDATE
      `;
      const confirmPayment = sql`
        WITH candidate AS (
          SELECT request.*, product.name AS product_name,
                 purchase.status AS purchase_status,
                 purchase.payment_reference,
                 purchase.updated_at AS purchase_updated_at
          FROM athlete_service_requests request
          JOIN athlete_service_products product ON product.code = request.product_code
          LEFT JOIN athlete_credit_purchases purchase
            ON purchase.id = request.purchase_id
            AND purchase.workspace_id = request.workspace_id
            AND purchase.athlete_id = request.athlete_id
          WHERE request.workspace_id = ${workspaceId}
            AND request.id = ${requestId}::uuid
          LIMIT 1
        ),
        paid_purchase AS (
          UPDATE athlete_credit_purchases purchase
          SET status = 'paid', payment_reference = ${paymentReference}, updated_at = NOW()
          FROM candidate
          WHERE purchase.id = candidate.purchase_id
            AND purchase.workspace_id = candidate.workspace_id
            AND purchase.athlete_id = candidate.athlete_id
            AND purchase.product_code = candidate.product_code
            AND purchase.amount_chf = candidate.snapshot_price_chf
            AND candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
            AND candidate.status <> 'refused'
            AND candidate.purchase_status = 'pending'
            AND NULLIF(btrim(${paymentReference}), '') IS NOT NULL
            AND char_length(${paymentReference}) <= 200
          RETURNING purchase.status AS purchase_status,
                    purchase.payment_reference,
                    purchase.updated_at AS purchase_updated_at
        )
        SELECT candidate.id, candidate.athlete_id, candidate.product_code, candidate.product_name,
               candidate.fulfillment_mode, candidate.status, candidate.requested_details,
               candidate.requested_at, candidate.scheduled_at, candidate.started_at,
               candidate.completed_at, candidate.refused_at, candidate.refusal_reason,
               candidate.snapshot_credit_type, candidate.snapshot_credit_quantity,
               candidate.snapshot_price_chf, candidate.purchase_id,
               paid_purchase.purchase_status, paid_purchase.payment_reference,
               paid_purchase.purchase_updated_at, 'transitioned' AS transition_outcome
        FROM candidate
        JOIN paid_purchase ON TRUE
        UNION ALL
        SELECT candidate.id, candidate.athlete_id, candidate.product_code, candidate.product_name,
               candidate.fulfillment_mode, candidate.status, candidate.requested_details,
               candidate.requested_at, candidate.scheduled_at, candidate.started_at,
               candidate.completed_at, candidate.refused_at, candidate.refusal_reason,
               candidate.snapshot_credit_type, candidate.snapshot_credit_quantity,
               candidate.snapshot_price_chf, candidate.purchase_id, candidate.purchase_status,
               candidate.payment_reference, candidate.purchase_updated_at,
               CASE
                 WHEN candidate.purchase_status = 'paid'
                   AND candidate.payment_reference = ${paymentReference} THEN 'unchanged'
                 ELSE 'conflict'
               END AS transition_outcome
        FROM candidate
        WHERE NOT EXISTS (SELECT 1 FROM paid_purchase)
        LIMIT 1
      `;
      const results = await sql.transaction([lockRequest, confirmPayment]);
      const row = (results[1] as (AthleteServiceRequestRow & { transition_outcome: string })[])[0];
      if (!row) return { outcome: "missing", request: null };
      if (row.transition_outcome === "conflict") return { outcome: "conflict", request: null };
      return {
        outcome: row.transition_outcome === "transitioned" ? "transitioned" : "unchanged",
        request: mapAdminRequest(row),
      };
    },
    async transition({ workspaceId, requestId, nextStatus, refusalReason }) {
      const rows = await sql`
        WITH candidate AS (
          SELECT request.*, product.name AS product_name, purchase.status AS purchase_status
          FROM athlete_service_requests request
          JOIN athlete_service_products product ON product.code = request.product_code
          LEFT JOIN athlete_credit_purchases purchase ON purchase.id = request.purchase_id
          WHERE request.workspace_id = ${workspaceId}
            AND request.id = ${requestId}::uuid
          LIMIT 1
        ),
        cancelled_purchase AS (
          UPDATE athlete_credit_purchases purchase
          SET status = 'cancelled', updated_at = NOW()
          FROM candidate
          WHERE ${nextStatus} = 'refused'
            AND candidate.status IN ('received', 'to_confirm', 'scheduled')
            AND purchase.id = candidate.purchase_id
            AND purchase.workspace_id = candidate.workspace_id
            AND purchase.athlete_id = candidate.athlete_id
            AND purchase.status = 'pending'
          RETURNING purchase.id
        ),
        transitioned AS (
          UPDATE athlete_service_requests request
          SET status = ${nextStatus},
              refused_at = CASE WHEN ${nextStatus} = 'refused' THEN NOW() ELSE NULL END,
              refusal_reason = CASE WHEN ${nextStatus} = 'refused' THEN ${refusalReason} ELSE NULL END,
              updated_at = NOW()
          FROM candidate
          WHERE request.id = candidate.id
            AND request.workspace_id = candidate.workspace_id
            AND (
              (${nextStatus} = 'to_confirm' AND candidate.status = 'received')
              OR (
                ${nextStatus} = 'refused'
                AND candidate.status IN ('received', 'to_confirm', 'scheduled')
                AND (
                  candidate.purchase_id IS NULL
                  OR EXISTS (SELECT 1 FROM cancelled_purchase WHERE id = candidate.purchase_id)
                )
              )
            )
          RETURNING request.*
        )
        SELECT transitioned.id, transitioned.athlete_id, transitioned.product_code,
               candidate.product_name, transitioned.fulfillment_mode, transitioned.status,
               transitioned.requested_details, transitioned.requested_at, transitioned.scheduled_at,
               transitioned.started_at, transitioned.completed_at, transitioned.refused_at,
               transitioned.refusal_reason, transitioned.snapshot_credit_type,
               transitioned.snapshot_credit_quantity, transitioned.snapshot_price_chf,
               transitioned.purchase_id, candidate.no_charge_reason,
               CASE WHEN transitioned.purchase_id IS NOT NULL AND ${nextStatus} = 'refused'
                 THEN 'cancelled' ELSE candidate.purchase_status END AS purchase_status,
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
               candidate.no_charge_reason,
               CASE
                 WHEN ${nextStatus} = 'refused' AND candidate.purchase_status = 'paid' THEN 'paid_purchase'
                 WHEN candidate.status = ${nextStatus} THEN 'unchanged'
                 ELSE 'conflict'
               END AS transition_outcome
        FROM candidate
        WHERE TRUE
          AND NOT EXISTS (SELECT 1 FROM transitioned)
        LIMIT 1
      `;
      const row = rows[0] as (AthleteServiceRequestRow & { transition_outcome: string }) | undefined;
      if (!row) return { outcome: "missing", request: null };
      if (row.transition_outcome === "conflict" || row.transition_outcome === "paid_purchase") {
        return { outcome: row.transition_outcome, request: null };
      }
      return {
        outcome: row.transition_outcome === "transitioned" ? "transitioned" : "unchanged",
        request: mapAdminRequest(row),
      };
    },
    async assumeNoCharge({ workspaceId, requestId, reason }) {
      const rows = await sql`
        WITH candidate AS (
          SELECT request.*, product.name AS product_name
          FROM athlete_service_requests request
          JOIN athlete_service_products product ON product.code = request.product_code
          WHERE request.workspace_id = ${workspaceId}
            AND request.id = ${requestId}::uuid
          LIMIT 1
        ),
        transitioned AS (
          UPDATE athlete_service_requests request
          SET fulfillment_mode = 'no_charge',
              status = 'to_confirm',
              snapshot_credit_type = NULL,
              snapshot_credit_quantity = NULL,
              snapshot_price_chf = NULL,
              no_charge_reason = ${reason},
              updated_at = NOW()
          FROM candidate
          WHERE request.id = candidate.id
            AND candidate.status IN ('received', 'to_confirm')
            AND candidate.purchase_id IS NULL
            AND candidate.usage_movement_id IS NULL
            AND NOT (candidate.fulfillment_mode = 'no_charge' AND candidate.no_charge_reason = ${reason})
          RETURNING request.*
        )
        SELECT transitioned.id, transitioned.athlete_id, transitioned.product_code,
               candidate.product_name, transitioned.fulfillment_mode, transitioned.status,
               transitioned.requested_details, transitioned.requested_at, transitioned.scheduled_at,
               transitioned.started_at, transitioned.completed_at, transitioned.refused_at,
               transitioned.refusal_reason, transitioned.snapshot_credit_type,
               transitioned.snapshot_credit_quantity, transitioned.snapshot_price_chf,
               transitioned.purchase_id, transitioned.no_charge_reason,
               'transitioned' AS transition_outcome
        FROM transitioned
        JOIN candidate ON candidate.id = transitioned.id
        UNION ALL
        SELECT candidate.id, candidate.athlete_id, candidate.product_code, candidate.product_name,
               candidate.fulfillment_mode, candidate.status, candidate.requested_details,
               candidate.requested_at, candidate.scheduled_at, candidate.started_at,
               candidate.completed_at, candidate.refused_at, candidate.refusal_reason,
               candidate.snapshot_credit_type, candidate.snapshot_credit_quantity,
               candidate.snapshot_price_chf, candidate.purchase_id, candidate.no_charge_reason,
               CASE
                 WHEN candidate.fulfillment_mode = 'no_charge'
                   AND candidate.status = 'to_confirm'
                   AND candidate.no_charge_reason = ${reason}
                   THEN 'unchanged'
                 WHEN candidate.status NOT IN ('received', 'to_confirm') THEN 'conflict'
                 WHEN candidate.purchase_id IS NOT NULL THEN 'conflict'
                 ELSE 'conflict'
               END AS transition_outcome
        FROM candidate
        WHERE NOT EXISTS (SELECT 1 FROM transitioned)
        LIMIT 1
      `;
      const row = rows[0] as (AthleteServiceRequestRow & { transition_outcome: string }) | undefined;
      if (!row) return { outcome: "missing", request: null };
      if (row.transition_outcome === "conflict") return { outcome: "conflict", request: null };
      return {
        outcome: row.transition_outcome === "transitioned" ? "transitioned" : "unchanged",
        request: mapAdminRequest(row),
      };
    },
  };
};

const createMemberConfirmationRepository = (): AthleteServiceRequestMemberConfirmationRepository => {
  const sql = createContentStorageClient();
  return {
    async confirm({ workspaceId, athleteId, requestId }) {
      const purchaseId = randomUUID();
      const lockAthlete = sql`
        SELECT membership.id
        FROM athlete_service_requests request
        JOIN athlete_memberships membership
          ON membership.workspace_id = request.workspace_id
          AND membership.athlete_id = request.athlete_id
          AND membership.status = 'active'
          AND membership.starts_at <= NOW()
          AND (membership.ends_at IS NULL OR membership.ends_at > NOW())
        WHERE request.workspace_id = ${workspaceId}
          AND request.athlete_id = ${athleteId}
          AND request.id = ${requestId}::uuid
          AND request.fulfillment_mode IN ('paid_extra', 'paid_with_right')
        FOR UPDATE OF membership
      `;
      const confirmRequest = sql`
        WITH candidate AS (
          SELECT request.*, product.active AS product_active, product.included_deliverables,
                 product.allowed_plan_codes, membership.id AS membership_id,
                 membership.plan_code, plan.active AS plan_active, plan.video_allowed,
                 purchase.status AS purchase_status,
                 COALESCE(balance.quantity, 0) AS credit_balance,
                 COALESCE(reserved.quantity, 0) AS reserved_quantity
          FROM athlete_service_requests request
          JOIN athlete_service_products product ON product.code = request.product_code
          LEFT JOIN athlete_memberships membership
            ON membership.workspace_id = request.workspace_id
            AND membership.athlete_id = request.athlete_id
            AND membership.status = 'active'
            AND membership.starts_at <= NOW()
            AND (membership.ends_at IS NULL OR membership.ends_at > NOW())
          LEFT JOIN membership_plans plan ON plan.code = membership.plan_code
          LEFT JOIN athlete_credit_purchases purchase ON purchase.id = request.purchase_id
          LEFT JOIN LATERAL (
            SELECT SUM(movement.quantity) AS quantity
            FROM athlete_credit_movements movement
            WHERE movement.workspace_id = request.workspace_id
              AND movement.athlete_id = request.athlete_id
              AND movement.credit_type = request.snapshot_credit_type
              AND (movement.expires_at IS NULL OR movement.expires_at > NOW())
          ) balance ON TRUE
          LEFT JOIN LATERAL (
            SELECT SUM(reservation.snapshot_credit_quantity) AS quantity
            FROM athlete_service_requests reservation
            WHERE reservation.workspace_id = request.workspace_id
              AND reservation.athlete_id = request.athlete_id
              AND reservation.snapshot_credit_type = request.snapshot_credit_type
              AND reservation.status IN ('scheduled', 'in_progress')
          ) reserved ON TRUE
          WHERE request.workspace_id = ${workspaceId}
            AND request.athlete_id = ${athleteId}
            AND request.id = ${requestId}::uuid
          LIMIT 1
        ),
        existing_purchase AS (
          SELECT purchase.*
          FROM athlete_credit_purchases purchase
          JOIN candidate
            ON purchase.id = candidate.purchase_id
            AND purchase.workspace_id = candidate.workspace_id
            AND purchase.athlete_id = candidate.athlete_id
            AND purchase.product_code = candidate.product_code
            AND purchase.quantity = candidate.included_deliverables
            AND purchase.amount_chf = candidate.snapshot_price_chf
          WHERE purchase.status = 'pending'
        ),
        inserted_purchase AS (
          INSERT INTO athlete_credit_purchases (
            id, workspace_id, athlete_id, product_code, quantity, amount_chf,
            status, purchased_at, expires_at, payment_reference, created_at, updated_at
          )
          SELECT ${purchaseId}::uuid, candidate.workspace_id, candidate.athlete_id,
                 candidate.product_code, candidate.included_deliverables,
                 candidate.snapshot_price_chf, 'pending', NOW(), NOW() + INTERVAL '12 months',
                 NULL, NOW(), NOW()
          FROM candidate
          WHERE candidate.status = 'to_confirm'
            AND candidate.purchase_id IS NULL
            AND candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')
            AND candidate.membership_id IS NOT NULL
            AND candidate.plan_active = TRUE
            AND candidate.product_active = TRUE
            AND candidate.snapshot_price_chf IS NOT NULL
            AND candidate.snapshot_price_chf > 0
            AND (candidate.allowed_plan_codes IS NULL OR candidate.plan_code = ANY(candidate.allowed_plan_codes))
            AND (candidate.product_code <> 'simple_video_capsule' OR candidate.video_allowed = TRUE)
            AND (
              candidate.fulfillment_mode = 'paid_extra'
              OR (
                candidate.snapshot_credit_type IS NOT NULL
                AND candidate.snapshot_credit_quantity IS NOT NULL
                AND candidate.credit_balance - candidate.reserved_quantity >= candidate.snapshot_credit_quantity
              )
            )
          RETURNING *
        ),
        linked AS (
          UPDATE athlete_service_requests request
          SET purchase_id = purchase.id, updated_at = NOW()
          FROM candidate, inserted_purchase purchase
          WHERE request.id = candidate.id
            AND request.workspace_id = candidate.workspace_id
            AND request.athlete_id = candidate.athlete_id
            AND request.status = 'to_confirm'
            AND request.fulfillment_mode IN ('paid_extra', 'paid_with_right')
            AND request.purchase_id IS NULL
          RETURNING request.*
        )
         SELECT linked.id, linked.athlete_id, linked.product_code, linked.fulfillment_mode,
           linked.status, linked.requested_details, linked.requested_at, linked.scheduled_at,
           linked.started_at, linked.completed_at, linked.refused_at, linked.refusal_reason,
           linked.snapshot_credit_type, linked.snapshot_credit_quantity, linked.snapshot_price_chf,
           linked.purchase_id, 'pending'::text AS purchase_status, 'confirmed' AS confirmation_outcome
        FROM linked
        UNION ALL
         SELECT candidate.id, candidate.athlete_id, candidate.product_code, candidate.fulfillment_mode,
           candidate.status, candidate.requested_details, candidate.requested_at,
           candidate.scheduled_at, candidate.started_at, candidate.completed_at,
           candidate.refused_at, candidate.refusal_reason, candidate.snapshot_credit_type,
           candidate.snapshot_credit_quantity, candidate.snapshot_price_chf,
           candidate.purchase_id, candidate.purchase_status,
               CASE
                 WHEN EXISTS (SELECT 1 FROM existing_purchase)
                   THEN 'unchanged'
                 WHEN candidate.status <> 'to_confirm' THEN 'conflict'
                 WHEN candidate.membership_id IS NULL OR candidate.plan_active <> TRUE
                   OR candidate.product_active <> TRUE
                   OR NOT (candidate.allowed_plan_codes IS NULL OR candidate.plan_code = ANY(candidate.allowed_plan_codes))
                   OR (candidate.product_code = 'simple_video_capsule' AND candidate.video_allowed <> TRUE)
                   THEN 'ineligible'
                 WHEN candidate.fulfillment_mode = 'paid_with_right'
                   AND candidate.credit_balance - candidate.reserved_quantity < candidate.snapshot_credit_quantity
                   THEN 'insufficient_rights'
                 ELSE 'conflict'
               END AS confirmation_outcome
        FROM candidate
        WHERE NOT EXISTS (SELECT 1 FROM linked)
        LIMIT 1
      `;
      const assertAgreementConsistency = sql`
        SELECT 1 / CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM athlete_credit_purchases purchase WHERE purchase.id = ${purchaseId}::uuid
          ) OR EXISTS (
            SELECT 1
            FROM athlete_service_requests request
            JOIN athlete_credit_purchases purchase ON purchase.id = request.purchase_id
            WHERE request.workspace_id = ${workspaceId}
              AND request.athlete_id = ${athleteId}
              AND request.id = ${requestId}::uuid
              AND request.status = 'to_confirm'
              AND request.fulfillment_mode IN ('paid_extra', 'paid_with_right')
              AND purchase.id = ${purchaseId}::uuid
              AND purchase.status = 'pending'
              AND purchase.workspace_id = request.workspace_id
              AND purchase.athlete_id = request.athlete_id
              AND purchase.product_code = request.product_code
              AND purchase.amount_chf = request.snapshot_price_chf
          ) THEN 1 ELSE 0
        END AS agreement_consistent
      `;
      const results = await sql.transaction([lockAthlete, confirmRequest, assertAgreementConsistency]);
      const row = (results[1] as (AthleteServiceRequestRow & { confirmation_outcome: string })[])[0];
      if (!row) return { outcome: "missing", request: null };
      if (row.confirmation_outcome === "conflict" || row.confirmation_outcome === "insufficient_rights" || row.confirmation_outcome === "ineligible") {
        return { outcome: row.confirmation_outcome, request: null };
      }
      return {
        outcome: row.confirmation_outcome === "confirmed" ? "confirmed" : "unchanged",
        request: mapPublicRequest(row),
      };
    },
  };
};

export const listAdminAthleteServiceRequests = async ({
  workspaceId,
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  repository?: AdminAthleteServiceRequestRepository;
}): Promise<AdminAthleteServiceRequest[]> => repository.list(normalize(workspaceId));

export const confirmAthleteServiceRequestAsMember = async ({
  workspaceId,
  athleteId,
  requestId,
  repository = createMemberConfirmationRepository(),
}: {
  workspaceId: string;
  athleteId: string;
  requestId: string;
  repository?: AthleteServiceRequestMemberConfirmationRepository;
}): Promise<AthleteServiceRequestMemberConfirmationResult> => repository.confirm({
  workspaceId: normalize(workspaceId),
  athleteId: normalize(athleteId),
  requestId: normalize(requestId),
});

export const getAthleteServiceReservedBalance = async (
  workspaceId: string,
  athleteId: string,
): Promise<AthleteCreditBalance> => {
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT snapshot_credit_type, COALESCE(SUM(snapshot_credit_quantity), 0) AS quantity
    FROM athlete_service_requests
    WHERE workspace_id = ${normalize(workspaceId)}
      AND athlete_id = ${normalize(athleteId)}
      AND status IN ('scheduled', 'in_progress')
      AND snapshot_credit_type IS NOT NULL
    GROUP BY snapshot_credit_type
  `;
  return (rows as { snapshot_credit_type: AthleteCreditType; quantity: number | string }[]).reduce<AthleteCreditBalance>(
    (balance, row) => {
      balance[row.snapshot_credit_type] = Number(row.quantity);
      return balance;
    },
    { production: 0, custom_content: 0 },
  );
};

export const calculateAvailableAthleteServiceBalance = (
  balance: AthleteCreditBalance,
  reserved: AthleteCreditBalance,
): AthleteCreditBalance => ({
  production: Math.max(0, balance.production - reserved.production),
  custom_content: Math.max(0, balance.custom_content - reserved.custom_content),
});

export const scheduleAdminAthleteServiceRequest = async ({
  workspaceId,
  requestId,
  scheduledAt,
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  requestId: string;
  scheduledAt: string;
  repository?: AdminAthleteServiceRequestRepository;
}): Promise<AdminAthleteServiceRequestTransition> => repository.schedule({
  workspaceId: normalize(workspaceId),
  requestId: normalize(requestId),
  scheduledAt,
});

export const startAdminAthleteServiceRequest = async ({
  workspaceId,
  requestId,
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  requestId: string;
  repository?: AdminAthleteServiceRequestRepository;
}): Promise<AdminAthleteServiceRequestTransition> => repository.start({
  workspaceId: normalize(workspaceId),
  requestId: normalize(requestId),
});

export const completeAdminAthleteServiceRequest = async ({
  workspaceId,
  requestId,
  deliveryKey,
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  requestId: string;
  deliveryKey: string;
  repository?: AdminAthleteServiceRequestRepository;
}): Promise<AdminAthleteServiceRequestTransition> => repository.complete({
  workspaceId: normalize(workspaceId),
  requestId: normalize(requestId),
  deliveryKey: normalize(deliveryKey),
});

export const confirmAdminAthleteServiceRequestPayment = async ({
  workspaceId,
  requestId,
  paymentReference,
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  requestId: string;
  paymentReference: string;
  repository?: AdminAthleteServiceRequestRepository;
}): Promise<AdminAthleteServiceRequestTransition> => repository.confirmPayment({
  workspaceId: normalize(workspaceId),
  requestId: normalize(requestId),
  paymentReference: normalize(paymentReference),
});

export const assumeNoChargeAdminAthleteServiceRequest = async ({
  workspaceId,
  requestId,
  reason,
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  requestId: string;
  reason: string;
  repository?: AdminAthleteServiceRequestRepository;
}): Promise<AdminAthleteServiceRequestTransition> => repository.assumeNoCharge({
  workspaceId: normalize(workspaceId),
  requestId: normalize(requestId),
  reason: normalize(reason),
});

export const transitionAdminAthleteServiceRequest = async ({
  workspaceId,
  requestId,
  nextStatus,
  refusalReason = null,
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  requestId: string;
  nextStatus: "to_confirm" | "refused";
  refusalReason?: string | null;
  repository?: AdminAthleteServiceRequestRepository;
}): Promise<AdminAthleteServiceRequestTransition> => repository.transition({
  workspaceId: normalize(workspaceId),
  requestId: normalize(requestId),
  nextStatus,
  refusalReason: nextStatus === "refused" ? normalize(refusalReason) : null,
});

const creditRequirement = (
  product: AthleteServiceProduct,
): { creditType: AthleteCreditType; quantity: number } | null => {
  if (product.code === "match_coverage_upgrade") {
    return { creditType: "production", quantity: product.requiredProductionCredits };
  }
  if (product.code === "photo_session_standard" || product.code === "editorial_interview") {
    return { creditType: "production", quantity: 1 };
  }
  if (product.code === "custom_content_single") {
    return { creditType: "custom_content", quantity: 1 };
  }
  if (product.code === "simple_video_capsule") {
    return { creditType: "production", quantity: 2 };
  }
  return null;
};

export const parseAthleteServiceRequestInput = (value: unknown): AthleteServiceRequestInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AthleteServiceRequestError("invalid_input", "Données invalides.");
  }
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["productCode", "fulfillmentMode", "message", "preferredDate"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new AthleteServiceRequestError("invalid_input", "Données invalides.");
  }
  if (!productCodes.includes(input.productCode as AthleteServiceProductCode)) {
    throw new AthleteServiceRequestError("invalid_input", "Produit invalide.");
  }
  if (input.fulfillmentMode === "no_charge") {
    throw new AthleteServiceRequestError("invalid_fulfillment_mode", "Ce mode n’est pas disponible.");
  }
  if (!fulfillmentModes.includes(input.fulfillmentMode as AthleteServiceRequestClientFulfillmentMode)) {
    throw new AthleteServiceRequestError("invalid_fulfillment_mode", "Mode de prestation invalide.");
  }
  if (input.message !== undefined && typeof input.message !== "string") {
    throw new AthleteServiceRequestError("invalid_input", "Message invalide.");
  }
  const message = normalize(input.message);
  if (message.length > 2000) {
    throw new AthleteServiceRequestError("invalid_input", "Le message ne peut pas dépasser 2000 caractères.");
  }
  if (input.preferredDate !== undefined && typeof input.preferredDate !== "string") {
    throw new AthleteServiceRequestError("invalid_input", "Date souhaitée invalide.");
  }
  const preferredDate = normalize(input.preferredDate);
  if (preferredDate && Number.isNaN(new Date(preferredDate).getTime())) {
    throw new AthleteServiceRequestError("invalid_input", "Date souhaitée invalide.");
  }
  return {
    productCode: input.productCode as AthleteServiceProductCode,
    fulfillmentMode: input.fulfillmentMode as AthleteServiceRequestClientFulfillmentMode,
    ...(message ? { message } : {}),
    ...(preferredDate ? { preferredDate: new Date(preferredDate).toISOString() } : {}),
  };
};

export const listAthleteServiceRequests = async ({
  workspaceId,
  athleteId,
  repository = createRepository(),
}: {
  workspaceId: string;
  athleteId: string;
  repository?: AthleteServiceRequestRepository;
}): Promise<PublicAthleteServiceRequest[]> => repository.list(normalize(workspaceId), normalize(athleteId));

export const createAthleteServiceRequest = async ({
  workspaceId,
  athleteId,
  input,
  repository = createRepository(),
}: {
  workspaceId: string;
  athleteId: string;
  input: AthleteServiceRequestInput;
  repository?: AthleteServiceRequestRepository;
}): Promise<PublicAthleteServiceRequest> => {
  const resolvedWorkspaceId = normalize(workspaceId);
  const resolvedAthleteId = normalize(athleteId);
  if (!resolvedWorkspaceId || !resolvedAthleteId) {
    throw new AthleteServiceRequestError("invalid_input", "Identité athlète invalide.");
  }

  const context = await repository.loadCreationContext(
    resolvedWorkspaceId,
    resolvedAthleteId,
    input.productCode,
  );
  const product = context.product;
  if (!product?.active) {
    throw new AthleteServiceRequestError("inactive_product", "Cette prestation n’est pas disponible.");
  }
  if (!context.membershipActive) {
    throw new AthleteServiceRequestError("inactive_membership", "Une adhésion active est requise.");
  }
  if (product.allowedPlanCodes && (!context.plan || !product.allowedPlanCodes.includes(context.plan.code))) {
    throw new AthleteServiceRequestError("plan_not_allowed", "Cette prestation n’est pas disponible avec votre abonnement.");
  }
  if (product.code === "simple_video_capsule" && context.plan?.videoAllowed !== true) {
    throw new AthleteServiceRequestError("plan_not_allowed", "La vidéo est réservée aux abonnements Impact et Signature.");
  }
  if (product.code === "custom_content_pack_5" && input.fulfillmentMode !== "paid_extra") {
    throw new AthleteServiceRequestError("invalid_fulfillment_mode", "Le pack de 5 est disponible uniquement en supplément payant.");
  }
  if (product.code === "match_coverage_upgrade" && input.fulfillmentMode !== "paid_with_right") {
    throw new AthleteServiceRequestError("invalid_fulfillment_mode", "La conversion match requiert un paiement et un droit production.");
  }
  if (input.fulfillmentMode === "paid_with_right" && product.code !== "match_coverage_upgrade") {
    throw new AthleteServiceRequestError("invalid_fulfillment_mode", "Ce mode hybride est réservé à la conversion match.");
  }

  const requirement = creditRequirement(product);
  const usesRight = input.fulfillmentMode === "included_right" || input.fulfillmentMode === "paid_with_right";
  if (usesRight && !requirement) {
    throw new AthleteServiceRequestError("invalid_fulfillment_mode", "Cette prestation ne peut pas utiliser un droit inclus.");
  }
  if (usesRight && requirement) {
    const available = Math.max(0, context.balance[requirement.creditType] - context.reserved[requirement.creditType]);
    if (available < requirement.quantity) {
      throw new AthleteServiceRequestError("insufficient_rights", "Solde de droits insuffisant.");
    }
  }

  const usesPrice = input.fulfillmentMode === "paid_extra" || input.fulfillmentMode === "paid_with_right";
  if (usesPrice && product.priceChf <= 0) {
    throw new AthleteServiceRequestError("invalid_fulfillment_mode", "Cette prestation n’a pas de prix valide.");
  }

  return repository.create({
    id: randomUUID(),
    workspaceId: resolvedWorkspaceId,
    athleteId: resolvedAthleteId,
    productCode: product.code,
    fulfillmentMode: input.fulfillmentMode,
    requestedDetails: {
      ...(input.message ? { message: input.message } : {}),
      ...(input.preferredDate ? { preferredDate: input.preferredDate } : {}),
    },
    snapshotCreditType: usesRight ? requirement!.creditType : null,
    snapshotCreditQuantity: usesRight ? requirement!.quantity : null,
    snapshotPriceChf: usesPrice ? product.priceChf : null,
  });
};
