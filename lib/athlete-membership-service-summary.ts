import { createContentStorageClient } from "@/lib/content-storage/db";
import type { AthleteMembership } from "@/lib/athlete-memberships";
import type {
  AthleteCreditMovementSource,
  AthleteCreditType,
} from "@/lib/athlete-credits";
import type {
  AthleteServiceRequestFulfillmentMode,
  AthleteServiceRequestStatus,
} from "@/lib/athlete-service-requests";

export type AthleteIncludedServiceSummary = {
  creditType: AthleteCreditType;
  label: string;
  quota: number;
  reserved: number;
  used: number;
  available: number;
  expiresAt: string | null;
};

export type AthletePendingServiceRequestSummary = {
  total: number;
  received: number;
  toConfirm: number;
};

export type AthletePurchasedServiceSummary = {
  purchaseId: string;
  productCode: string;
  productName: string;
  paid: number;
  delivered: number;
  remaining: number;
  expiresAt: string;
  expired: boolean;
};

export type AthleteMembershipServiceSummary = {
  membershipId: string;
  startsAt: string;
  endsAt: string | null;
  expiresInDays: number | null;
  included: AthleteIncludedServiceSummary[];
  pendingRequests: AthletePendingServiceRequestSummary;
  purchases: AthletePurchasedServiceSummary[];
};

type CreditMovementProjection = {
  creditType: AthleteCreditType;
  quantity: number;
  source: AthleteCreditMovementSource;
  referenceId: string | null;
  expiresAt: string | null;
};

type ServiceRequestProjection = {
  status: AthleteServiceRequestStatus;
  fulfillmentMode: AthleteServiceRequestFulfillmentMode;
  creditType: AthleteCreditType | null;
  creditQuantity: number | null;
};

type LegacyContentRequestProjection = {
  id: string;
  status: "requested" | "accepted" | "in_progress" | "completed" | "declined" | "cancelled";
};

type LegacyContentProjection = {
  quota: number;
  expiresAt: string | null;
  requests: LegacyContentRequestProjection[];
} | null;

type PurchasedServiceProjection = {
  purchaseId: string;
  productCode: string;
  productName: string;
  quantity: number;
  delivered: number;
  expiresAt: string;
};

export type AthleteMembershipServiceSummaryProjection = {
  movements: CreditMovementProjection[];
  serviceRequests: ServiceRequestProjection[];
  legacyContent: LegacyContentProjection;
  purchases: PurchasedServiceProjection[];
};

export type AthleteMembershipServiceSummaryRepository = {
  load: (input: {
    workspaceId: string;
    athleteId: string;
    membership: AthleteMembership;
    now: Date;
  }) => Promise<AthleteMembershipServiceSummaryProjection>;
};

type MovementRow = {
  credit_type: AthleteCreditType;
  quantity: number | string;
  source: AthleteCreditMovementSource;
  reference_id: string | null;
  expires_at: string | Date | null;
};

type ServiceRequestRow = {
  status: AthleteServiceRequestStatus;
  fulfillment_mode: AthleteServiceRequestFulfillmentMode;
  snapshot_credit_type: AthleteCreditType | null;
  snapshot_credit_quantity: number | string | null;
};

type LegacyContentRow = {
  subscription_id: string;
  custom_contents_included: number | string;
  ends_on: string | Date;
  request_id: string | null;
  request_status: LegacyContentRequestProjection["status"] | null;
};

type PurchaseRow = {
  purchase_id: string;
  product_code: string;
  product_name: string;
  quantity: number | string;
  delivered: number | string;
  expires_at: string | Date;
};

const toIsoString = (value: string | Date): string => new Date(value).toISOString();

const createRepository = (): AthleteMembershipServiceSummaryRepository => {
  const sql = createContentStorageClient();
  return {
    async load({ workspaceId, athleteId, membership, now }) {
      const [movementRows, requestRows, legacyRows, purchaseRows] = await Promise.all([
        sql`
          SELECT credit_type, quantity, source, reference_id, expires_at
          FROM athlete_credit_movements
          WHERE workspace_id = ${workspaceId}
            AND athlete_id = ${athleteId}
            AND membership_id = ${membership.id}
          ORDER BY created_at ASC, id ASC
        `,
        sql`
          SELECT status, fulfillment_mode, snapshot_credit_type, snapshot_credit_quantity
          FROM athlete_service_requests
          WHERE workspace_id = ${workspaceId}
            AND athlete_id = ${athleteId}
            AND (
              status IN ('received', 'to_confirm')
              OR (
                status IN ('scheduled', 'in_progress')
                AND fulfillment_mode IN ('included_right', 'paid_with_right')
              )
            )
          ORDER BY requested_at ASC, id ASC
        `,
        sql`
          WITH selected_subscription AS (
            SELECT subscription.id, subscription.custom_contents_included, subscription.ends_on
            FROM athlete_subscriptions subscription
            WHERE subscription.workspace_id = ${workspaceId}
              AND subscription.athlete_id = ${athleteId}
              AND (
                subscription.membership_id = ${membership.id}
                OR (
                  subscription.membership_id IS NULL
                  AND subscription.starts_on <= ${membership.endsAt ?? now.toISOString()}::timestamptz
                  AND subscription.ends_on >= ${membership.startsAt}::timestamptz
                )
              )
            ORDER BY
              CASE WHEN subscription.membership_id = ${membership.id} THEN 0 ELSE 1 END,
              subscription.starts_on DESC,
              subscription.created_at DESC
            LIMIT 1
          )
          SELECT selected.id AS subscription_id, selected.custom_contents_included,
                 selected.ends_on, request.id AS request_id, request.status AS request_status
          FROM selected_subscription selected
          LEFT JOIN athlete_subscription_content_requests request
            ON request.workspace_id = ${workspaceId}
           AND request.athlete_id = ${athleteId}
           AND request.subscription_id = selected.id
          ORDER BY request.created_at ASC, request.id ASC
        `,
        sql`
          SELECT purchase.id AS purchase_id, purchase.product_code, product.name AS product_name,
                 purchase.quantity, COALESCE(SUM(execution.quantity), 0) AS delivered,
                 purchase.expires_at
          FROM athlete_credit_purchases purchase
          JOIN athlete_service_products product ON product.code = purchase.product_code
          LEFT JOIN athlete_credit_purchase_executions execution
            ON execution.purchase_id = purchase.id
          WHERE purchase.workspace_id = ${workspaceId}
            AND purchase.athlete_id = ${athleteId}
            AND purchase.status = 'paid'
            AND purchase.purchased_at >= ${membership.startsAt}::timestamptz
            AND (
              ${membership.endsAt}::timestamptz IS NULL
              OR purchase.purchased_at < ${membership.endsAt}::timestamptz
            )
          GROUP BY purchase.id, purchase.product_code, product.name, purchase.quantity,
                   purchase.expires_at, purchase.purchased_at
          ORDER BY purchase.purchased_at DESC, purchase.id DESC
        `,
      ]);

      const legacy = legacyRows as LegacyContentRow[];
      return {
        movements: (movementRows as MovementRow[]).map((row) => ({
          creditType: row.credit_type,
          quantity: Number(row.quantity),
          source: row.source,
          referenceId: row.reference_id,
          expiresAt: row.expires_at ? toIsoString(row.expires_at) : null,
        })),
        serviceRequests: (requestRows as ServiceRequestRow[]).map((row) => ({
          status: row.status,
          fulfillmentMode: row.fulfillment_mode,
          creditType: row.snapshot_credit_type,
          creditQuantity: row.snapshot_credit_quantity === null
            ? null
            : Number(row.snapshot_credit_quantity),
        })),
        legacyContent: legacy[0]
          ? {
              quota: Number(legacy[0].custom_contents_included),
              expiresAt: toIsoString(legacy[0].ends_on),
              requests: legacy.flatMap((row) => (
                row.request_id && row.request_status
                  ? [{ id: row.request_id, status: row.request_status }]
                  : []
              )),
            }
          : null,
        purchases: (purchaseRows as PurchaseRow[]).map((row) => ({
          purchaseId: row.purchase_id,
          productCode: row.product_code,
          productName: row.product_name,
          quantity: Number(row.quantity),
          delivered: Number(row.delivered),
          expiresAt: toIsoString(row.expires_at),
        })),
      };
    },
  };
};

const creditLabels: Record<AthleteCreditType, string> = {
  production: "Productions",
  custom_content: "Contenus personnalisés",
};

const legacyReference = (requestId: string): string =>
  `athlete_subscription_content_request:${requestId}`;

export const calculateAthleteMembershipServiceSummary = ({
  membership,
  projection,
  now = new Date(),
}: {
  membership: AthleteMembership;
  projection: AthleteMembershipServiceSummaryProjection;
  now?: Date;
}): AthleteMembershipServiceSummary => {
  const nowTimestamp = now.getTime();
  const legacyUsageReferences = new Set(
    projection.movements
      .filter((movement) => movement.source === "usage" && movement.referenceId)
      .map((movement) => movement.referenceId!),
  );
  const legacyRequests = projection.legacyContent?.requests.filter(
    (request) => !legacyUsageReferences.has(legacyReference(request.id)),
  ) ?? [];
  const isLegacyFounder = membership.membershipKind === "founder"
    && membership.source === "legacy_founder_migration";

  const included = (["production", "custom_content"] as const).map((creditType) => {
    const movements = projection.movements.filter((movement) => movement.creditType === creditType);
    const activeEntitlements = movements.filter((movement) => (
      movement.source !== "usage"
      && movement.source !== "purchase"
      && (!movement.expiresAt || new Date(movement.expiresAt).getTime() > nowTimestamp)
    ));
    const ledgerQuota = activeEntitlements.reduce((total, movement) => total + movement.quantity, 0);
    const hasPlanGrant = movements.some((movement) => (
      movement.source === "plan_grant" && movement.quantity > 0
    ));
    const founderFallbackQuota = isLegacyFounder && !hasPlanGrant ? 1 : 0;
    const legacyQuota = !isLegacyFounder && creditType === "custom_content" && !hasPlanGrant
      ? projection.legacyContent?.quota ?? 0
      : 0;
    const quota = Math.max(0, ledgerQuota + founderFallbackQuota + legacyQuota);
    const ledgerUsed = -movements
      .filter((movement) => movement.source === "usage" && movement.quantity < 0)
      .reduce((total, movement) => total + movement.quantity, 0);
    const legacyUsed = creditType === "custom_content"
      ? legacyRequests.filter((request) => request.status === "completed").length
      : 0;
    const serviceReserved = projection.serviceRequests
      .filter((request) => (
        request.creditType === creditType
        && (request.status === "scheduled" || request.status === "in_progress")
        && (request.fulfillmentMode === "included_right" || request.fulfillmentMode === "paid_with_right")
      ))
      .reduce((total, request) => total + (request.creditQuantity ?? 0), 0);
    const legacyReserved = creditType === "custom_content"
      ? legacyRequests.filter((request) => (
          request.status === "requested"
          || request.status === "accepted"
          || request.status === "in_progress"
        )).length
      : 0;
    const used = ledgerUsed + legacyUsed;
    const reserved = serviceReserved + legacyReserved;
    const movementExpirations = activeEntitlements
      .flatMap((movement) => movement.expiresAt ? [movement.expiresAt] : [])
      .sort();
    const expiresAt = movementExpirations[0]
      ?? (creditType === "custom_content" && legacyQuota > 0
        ? projection.legacyContent?.expiresAt ?? membership.endsAt
        : membership.endsAt);

    return {
      creditType,
      label: creditLabels[creditType],
      quota,
      reserved,
      used,
      available: Math.max(0, quota - reserved - used),
      expiresAt,
    };
  });

  const received = projection.serviceRequests.filter((request) => request.status === "received").length;
  const toConfirm = projection.serviceRequests.filter((request) => request.status === "to_confirm").length;
  const membershipEndTimestamp = membership.endsAt ? new Date(membership.endsAt).getTime() : null;

  return {
    membershipId: membership.id,
    startsAt: membership.startsAt,
    endsAt: membership.endsAt,
    expiresInDays: membershipEndTimestamp === null || !Number.isFinite(membershipEndTimestamp)
      ? null
      : Math.ceil((membershipEndTimestamp - nowTimestamp) / 86_400_000),
    included,
    pendingRequests: {
      total: received + toConfirm,
      received,
      toConfirm,
    },
    purchases: projection.purchases.map((purchase) => {
      const expired = new Date(purchase.expiresAt).getTime() <= nowTimestamp;
      return {
        purchaseId: purchase.purchaseId,
        productCode: purchase.productCode,
        productName: purchase.productName,
        paid: purchase.quantity,
        delivered: purchase.delivered,
        remaining: expired ? 0 : Math.max(0, purchase.quantity - purchase.delivered),
        expiresAt: purchase.expiresAt,
        expired,
      };
    }),
  };
};

export const getAthleteMembershipServiceSummary = async ({
  workspaceId,
  athleteId,
  membership,
  now = new Date(),
  repository = createRepository(),
}: {
  workspaceId: string;
  athleteId: string;
  membership: AthleteMembership;
  now?: Date;
  repository?: AthleteMembershipServiceSummaryRepository;
}): Promise<AthleteMembershipServiceSummary> => {
  const normalizedWorkspaceId = workspaceId.trim();
  const normalizedAthleteId = athleteId.trim();
  if (!normalizedWorkspaceId || !normalizedAthleteId) {
    throw new Error("workspaceId et athleteId sont requis.");
  }
  if (membership.workspaceId !== normalizedWorkspaceId || membership.athleteId !== normalizedAthleteId) {
    throw new Error("L’adhésion ne correspond pas au workspace et à l’Athlète demandés.");
  }

  const projection = await repository.load({
    workspaceId: normalizedWorkspaceId,
    athleteId: normalizedAthleteId,
    membership,
    now,
  });
  return calculateAthleteMembershipServiceSummary({ membership, projection, now });
};
