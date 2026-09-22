import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type PartnerBenefitReservationStatus = "reserved" | "used" | "cancelled" | "expired";

export type PartnerBenefitReservation = {
  id: string;
  benefitId: string;
  partnerId: string;
  athleteId: string;
  membershipId: string;
  benefitTitle: string;
  benefitDetails: string;
  usagePolicy: "once_lifetime" | "once_per_membership" | "unlimited";
  status: PartnerBenefitReservationStatus;
  reservedAt: string;
  usedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
};

export type PartnerBenefitReservationGroups = {
  reserved: PartnerBenefitReservation[];
  used: PartnerBenefitReservation[];
  cancelled: PartnerBenefitReservation[];
  expired: PartnerBenefitReservation[];
};

type DataRow = Record<string, unknown>;

export type PartnerReservationScope = {
  workspaceId: string;
  partnerId: string;
  actorClerkUserId: string;
};

export type PartnerReservationTransitionResult = {
  row: DataRow | null;
  currentStatus: PartnerBenefitReservationStatus | null;
};

export type PartnerBenefitReservationRepository = {
  list: (scope: PartnerReservationScope) => Promise<DataRow[]>;
  transition: (
    scope: PartnerReservationScope,
    reservationId: string,
    targetStatus: "used" | "cancelled",
  ) => Promise<PartnerReservationTransitionResult>;
};

export type PartnerBenefitReservationDependencies = {
  repository: PartnerBenefitReservationRepository;
};

export class PartnerBenefitReservationError extends Error {
  constructor(
    public readonly code: "forbidden" | "validation" | "not_found" | "terminal" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "PartnerBenefitReservationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const statuses: readonly PartnerBenefitReservationStatus[] = ["reserved", "used", "cancelled", "expired"];
const usagePolicies = ["once_lifetime", "once_per_membership", "unlimited"] as const;

const requireText = (value: unknown, fieldName: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new PartnerBenefitReservationError("validation", `${fieldName} est requis.`);
  return normalized;
};

const requireUuid = (value: unknown, fieldName: string): string => {
  const normalized = requireText(value, fieldName).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new PartnerBenefitReservationError("validation", `${fieldName} est invalide.`);
  }
  return normalized;
};

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(requireText(value, fieldName));
  if (Number.isNaN(parsed.getTime())) {
    throw new PartnerBenefitReservationError("validation", `${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const normalizeNullableTimestamp = (value: unknown, fieldName: string): string | null =>
  value === null || value === undefined ? null : normalizeTimestamp(value, fieldName);

const normalizeStatus = (value: unknown): PartnerBenefitReservationStatus => {
  const status = requireText(value, "status") as PartnerBenefitReservationStatus;
  if (!statuses.includes(status)) {
    throw new PartnerBenefitReservationError("validation", "status Neon est invalide.");
  }
  return status;
};

const mapReservation = (row: DataRow): PartnerBenefitReservation => {
  const usagePolicy = requireText(row.usage_policy, "usage_policy") as PartnerBenefitReservation["usagePolicy"];
  if (!usagePolicies.includes(usagePolicy)) {
    throw new PartnerBenefitReservationError("validation", "usage_policy Neon est invalide.");
  }
  return {
    id: requireUuid(row.id, "reservation_id"),
    benefitId: requireUuid(row.benefit_id, "benefit_id"),
    partnerId: requireUuid(row.partner_id, "partner_id"),
    athleteId: requireText(row.athlete_id, "athlete_id"),
    membershipId: requireText(row.membership_id, "membership_id"),
    benefitTitle: requireText(row.benefit_title, "benefit_title"),
    benefitDetails: requireText(row.benefit_details, "benefit_details"),
    usagePolicy,
    status: normalizeStatus(row.status),
    reservedAt: normalizeTimestamp(row.reserved_at, "reserved_at"),
    usedAt: normalizeNullableTimestamp(row.used_at, "used_at"),
    cancelledAt: normalizeNullableTimestamp(row.cancelled_at, "cancelled_at"),
    expiresAt: normalizeNullableTimestamp(row.expires_at, "expires_at"),
  };
};

const expirationQuery = (
  sql: ReturnType<typeof createContentStorageClient>,
  scope: PartnerReservationScope,
) => sql`
  WITH expired AS (
    UPDATE partner_benefit_reservations reservation
    SET status = 'expired', updated_at = NOW()
    WHERE reservation.workspace_id = ${scope.workspaceId}
      AND reservation.partner_id = ${scope.partnerId}::uuid
      AND reservation.status = 'reserved'
      AND reservation.expires_at IS NOT NULL
      AND reservation.expires_at <= NOW()
    RETURNING reservation.*
  ), events AS (
    INSERT INTO partner_benefit_reservation_events (
      id, workspace_id, reservation_id, actor_clerk_user_id, actor_role,
      previous_status, new_status, occurred_at
    )
    SELECT md5('partner-benefit-expired:' || expired.id::text)::uuid,
           expired.workspace_id, expired.id, ${scope.actorClerkUserId},
           'partner_expert', 'reserved', 'expired', NOW()
    FROM expired
    RETURNING reservation_id
  ), notifications AS (
    INSERT INTO notifications (
      id, workspace_id, recipient_clerk_user_id, type, title, body,
      action_href, source_type, source_id, created_at
    )
    SELECT md5('partner-benefit-expired-notification:' || expired.id::text || ':' || access.clerk_user_id)::uuid,
           expired.workspace_id, access.clerk_user_id, 'partner_benefit.expired',
           'Avantage partenaire expiré', benefit.title, '/athlete/pass',
           'partner_benefit_reservation.expired', expired.id::text, NOW()
    FROM expired
    JOIN events ON events.reservation_id = expired.id
    JOIN partner_benefits benefit
      ON benefit.workspace_id = expired.workspace_id
     AND benefit.id = expired.benefit_id
     AND benefit.partner_id = expired.partner_id
    JOIN user_access access
      ON access.workspace_id = expired.workspace_id
     AND access.athlete_id = expired.athlete_id
     AND access.role = 'athlete'
     AND access.status = 'active'
    ON CONFLICT (workspace_id, recipient_clerk_user_id, source_type, source_id)
      WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    DO NOTHING
    RETURNING source_id
  )
  SELECT count(*)::integer AS expired_count FROM expired
`;

const createRepository = (): PartnerBenefitReservationRepository => {
  const sql = createContentStorageClient();
  return {
    async list(scope) {
      const expire = expirationQuery(sql, scope);
      const list = sql`
        SELECT reservation.id, reservation.benefit_id, reservation.partner_id,
               reservation.athlete_id, reservation.membership_id, benefit.title AS benefit_title,
               benefit.details AS benefit_details, reservation.usage_policy, reservation.status,
               reservation.reserved_at, reservation.used_at, reservation.cancelled_at, reservation.expires_at
        FROM partner_benefit_reservations reservation
        JOIN partner_benefits benefit
          ON benefit.workspace_id = reservation.workspace_id
         AND benefit.id = reservation.benefit_id
         AND benefit.partner_id = reservation.partner_id
        WHERE reservation.workspace_id = ${scope.workspaceId}
          AND reservation.partner_id = ${scope.partnerId}::uuid
        ORDER BY reservation.reserved_at DESC, reservation.id DESC
      `;
      const results = await sql.transaction([expire, list], { isolationLevel: "Serializable" });
      return results[1] as DataRow[];
    },

    async transition(scope, reservationId, targetStatus) {
      const expire = expirationQuery(sql, scope);
      const transition = sql`
        WITH updated AS (
          UPDATE partner_benefit_reservations reservation
          SET status = ${targetStatus},
              used_at = CASE WHEN ${targetStatus} = 'used' THEN NOW() ELSE reservation.used_at END,
              cancelled_at = CASE WHEN ${targetStatus} = 'cancelled' THEN NOW() ELSE reservation.cancelled_at END,
              updated_at = NOW()
          WHERE reservation.workspace_id = ${scope.workspaceId}
            AND reservation.partner_id = ${scope.partnerId}::uuid
            AND reservation.id = ${reservationId}::uuid
            AND reservation.status = 'reserved'
            AND (reservation.expires_at IS NULL OR reservation.expires_at > NOW())
          RETURNING reservation.*
        ), event AS (
          INSERT INTO partner_benefit_reservation_events (
            id, workspace_id, reservation_id, actor_clerk_user_id, actor_role,
            previous_status, new_status, occurred_at
          )
          SELECT md5('partner-benefit-' || ${targetStatus} || ':' || updated.id::text)::uuid,
                 updated.workspace_id, updated.id, ${scope.actorClerkUserId},
                 'partner_expert', 'reserved', ${targetStatus}, NOW()
          FROM updated
          RETURNING reservation_id
        ), notification AS (
          INSERT INTO notifications (
            id, workspace_id, recipient_clerk_user_id, type, title, body,
            action_href, source_type, source_id, created_at
          )
          SELECT md5('partner-benefit-' || ${targetStatus} || '-notification:' || updated.id::text || ':' || access.clerk_user_id)::uuid,
                 updated.workspace_id, access.clerk_user_id,
                 CASE WHEN ${targetStatus} = 'used' THEN 'partner_benefit.used' ELSE 'partner_benefit.cancelled' END,
                 CASE WHEN ${targetStatus} = 'used' THEN 'Avantage partenaire utilisé' ELSE 'Réservation d’avantage annulée' END,
                 benefit.title, '/athlete/pass',
                 CASE WHEN ${targetStatus} = 'used' THEN 'partner_benefit_reservation.used' ELSE 'partner_benefit_reservation.cancelled' END,
                 updated.id::text, NOW()
          FROM updated
          JOIN event ON event.reservation_id = updated.id
          JOIN partner_benefits benefit
            ON benefit.workspace_id = updated.workspace_id
           AND benefit.id = updated.benefit_id
           AND benefit.partner_id = updated.partner_id
          JOIN user_access access
            ON access.workspace_id = updated.workspace_id
           AND access.athlete_id = updated.athlete_id
           AND access.role = 'athlete'
           AND access.status = 'active'
          ON CONFLICT (workspace_id, recipient_clerk_user_id, source_type, source_id)
            WHERE source_type IS NOT NULL AND source_id IS NOT NULL
          DO NOTHING
          RETURNING source_id
        )
        SELECT reservation.id, reservation.benefit_id, reservation.partner_id,
               reservation.athlete_id, reservation.membership_id, benefit.title AS benefit_title,
               benefit.details AS benefit_details, reservation.usage_policy, reservation.status,
               reservation.reserved_at, reservation.used_at, reservation.cancelled_at, reservation.expires_at
        FROM updated reservation
        JOIN event ON event.reservation_id = reservation.id
        JOIN partner_benefits benefit
          ON benefit.workspace_id = reservation.workspace_id
         AND benefit.id = reservation.benefit_id
         AND benefit.partner_id = reservation.partner_id
      `;
      const currentStatus = sql`
        SELECT status
        FROM partner_benefit_reservations
        WHERE workspace_id = ${scope.workspaceId}
          AND partner_id = ${scope.partnerId}::uuid
          AND id = ${reservationId}::uuid
        LIMIT 1
      `;
      const results = await sql.transaction(
        [expire, transition, currentStatus],
        { isolationLevel: "Serializable" },
      );
      const transitionedRows = results[1] as DataRow[];
      const statusRows = results[2] as DataRow[];
      return {
        row: transitionedRows[0] ?? null,
        currentStatus: statusRows[0] ? normalizeStatus(statusRows[0].status) : null,
      };
    },
  };
};

const defaultDependencies = (): PartnerBenefitReservationDependencies => ({
  repository: createRepository(),
});

const requirePartnerScope = async (request: Request): Promise<PartnerReservationScope> => {
  const profile = await getCurrentUserAccessProfile(request);
  const actorClerkUserId = profile?.clerkUser?.id?.trim() ?? "";
  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const partnerId = access?.partnerId?.trim().toLowerCase() ?? "";
  if (
    !actorClerkUserId
    || access?.role !== "partner_expert"
    || access.status !== "active"
    || !workspaceId
    || !UUID_PATTERN.test(partnerId)
  ) {
    throw new PartnerBenefitReservationError("forbidden", "Un accès Partenaire actif avec un partnerId UUID est requis.");
  }
  return { workspaceId, partnerId, actorClerkUserId };
};

const transitionReservation = async (
  request: Request,
  reservationIdValue: unknown,
  targetStatus: "used" | "cancelled",
  dependencies?: PartnerBenefitReservationDependencies,
): Promise<PartnerBenefitReservation> => {
  const scope = await requirePartnerScope(request);
  const reservationId = requireUuid(reservationIdValue, "reservationId");
  let result: PartnerReservationTransitionResult;
  try {
    result = await (dependencies ?? defaultDependencies()).repository.transition(scope, reservationId, targetStatus);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "40001" || code === "23505") {
      throw new PartnerBenefitReservationError("conflict", "Une transition concurrente a été détectée.");
    }
    throw error;
  }
  if (result.row) return mapReservation(result.row);
  if (result.currentStatus && result.currentStatus !== "reserved") {
    throw new PartnerBenefitReservationError(
      "terminal",
      `La réservation est déjà dans l’état terminal ${result.currentStatus}.`,
    );
  }
  if (result.currentStatus === "reserved") {
    throw new PartnerBenefitReservationError("conflict", "La réservation n’a pas pu être transitionnée.");
  }
  throw new PartnerBenefitReservationError("not_found", "Réservation partenaire introuvable.");
};

export const listPartnerBenefitReservations = async (
  request: Request,
  dependencies?: PartnerBenefitReservationDependencies,
): Promise<PartnerBenefitReservationGroups> => {
  const scope = await requirePartnerScope(request);
  const reservations = (await (dependencies ?? defaultDependencies()).repository.list(scope)).map(mapReservation);
  return {
    reserved: reservations.filter((reservation) => reservation.status === "reserved"),
    used: reservations.filter((reservation) => reservation.status === "used"),
    cancelled: reservations.filter((reservation) => reservation.status === "cancelled"),
    expired: reservations.filter((reservation) => reservation.status === "expired"),
  };
};

export const markPartnerBenefitReservationUsed = async (
  request: Request,
  reservationId: unknown,
  dependencies?: PartnerBenefitReservationDependencies,
): Promise<PartnerBenefitReservation> =>
  transitionReservation(request, reservationId, "used", dependencies);

export const cancelPartnerBenefitReservation = async (
  request: Request,
  reservationId: unknown,
  dependencies?: PartnerBenefitReservationDependencies,
): Promise<PartnerBenefitReservation> =>
  transitionReservation(request, reservationId, "cancelled", dependencies);