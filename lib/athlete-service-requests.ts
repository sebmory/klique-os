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

export type AthleteServiceRequestInput = {
  productCode: AthleteServiceProductCode;
  fulfillmentMode: AthleteServiceRequestClientFulfillmentMode;
  message?: string;
  preferredDate?: string;
};

export type PublicAthleteServiceRequest = {
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
};

type RequestedDetails = {
  message?: string;
  preferredDate?: string;
};

type AthleteServiceRequestRow = {
  product_code: AthleteServiceProductCode;
  fulfillment_mode: AthleteServiceRequestFulfillmentMode;
  status: AthleteServiceRequestStatus;
  requested_details: unknown;
  requested_at: string | Date;
  scheduled_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  refused_at: string | Date | null;
  refusal_reason: string | null;
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
  };
};

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
        SELECT product_code, fulfillment_mode, status, requested_details, requested_at,
               scheduled_at, started_at, completed_at, refused_at, refusal_reason
        FROM athlete_service_requests
        WHERE workspace_id = ${workspaceId}
          AND athlete_id = ${athleteId}
        ORDER BY requested_at DESC
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
        RETURNING product_code, fulfillment_mode, status, requested_details, requested_at,
                  scheduled_at, started_at, completed_at, refused_at, refusal_reason
      `;
      return mapPublicRequest(rows[0] as AthleteServiceRequestRow);
    },
  };
};

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
