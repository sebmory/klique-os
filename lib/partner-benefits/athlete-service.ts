import { randomUUID } from "node:crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getEcosystemPartnersFrom06Partenaires } from "@/lib/google-sheets";

export type AthletePartnerBenefitUsagePolicy = "once_lifetime" | "once_per_membership" | "unlimited";
export type AthletePartnerBenefitAvailability =
  | "available"
  | "already_reserved"
  | "already_used_lifetime"
  | "already_used_membership";
export type AthletePartnerBenefitPersonalStatus = "available" | "reserved" | "used" | "cancelled" | "expired";

export type AthletePartnerBenefit = {
  id: string;
  partnerId: string;
  title: string;
  details: string;
  usagePolicy: AthletePartnerBenefitUsagePolicy;
  validFrom: string;
  expiresAt: string | null;
  availability: AthletePartnerBenefitAvailability;
  personalStatus: AthletePartnerBenefitPersonalStatus;
  available: boolean;
  activeReservationId: string | null;
};

export type AthletePartnerBenefitReservation = {
  id: string;
  workspaceId: string;
  benefitId: string;
  partnerId: string;
  athleteId: string;
  membershipId: string;
  membershipStartsAt: string;
  membershipEndsAt: string | null;
  usagePolicy: AthletePartnerBenefitUsagePolicy;
  usageScopeKey: string;
  status: "reserved" | "cancelled";
  reservedAt: string;
  cancelledAt: string | null;
  expiresAt: string | null;
};

type DataRow = Record<string, unknown>;

export type ActiveMembershipSnapshot = {
  id: string;
  workspaceId: string;
  athleteId: string;
  startsAt: string;
  endsAt: string | null;
};

export type ReservePartnerBenefitRecord = {
  reservationId: string;
  eventId: string;
  workspaceId: string;
  athleteId: string;
  actorClerkUserId: string;
  membership: ActiveMembershipSnapshot;
  benefitId: string;
  activePartnerIds: string[];
};

export type CancelPartnerBenefitReservationRecord = {
  eventId: string;
  workspaceId: string;
  athleteId: string;
  actorClerkUserId: string;
  reservationId: string;
  activePartnerIds: string[];
};

export type AthletePartnerBenefitRepository = {
  findActiveMembership: (workspaceId: string, athleteId: string) => Promise<DataRow | null>;
  list: (
    workspaceId: string,
    athleteId: string,
    membershipId: string,
    activePartnerIds: string[],
  ) => Promise<DataRow[]>;
  reserve: (record: ReservePartnerBenefitRecord) => Promise<DataRow | null>;
  cancel: (record: CancelPartnerBenefitReservationRecord) => Promise<DataRow | null>;
};

export type AthletePartnerBenefitDependencies = {
  repository: AthletePartnerBenefitRepository;
  getPartners: typeof getEcosystemPartnersFrom06Partenaires;
  createId: () => string;
};

export class AthletePartnerBenefitError extends Error {
  constructor(
    public readonly code: "forbidden" | "validation" | "membership_required" | "not_found" | "unavailable" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "AthletePartnerBenefitError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const usagePolicies: readonly AthletePartnerBenefitUsagePolicy[] = ["once_lifetime", "once_per_membership", "unlimited"];
const availabilities: readonly AthletePartnerBenefitAvailability[] = [
  "available",
  "already_reserved",
  "already_used_lifetime",
  "already_used_membership",
];
const personalStatuses: readonly AthletePartnerBenefitPersonalStatus[] = [
  "available",
  "reserved",
  "used",
  "cancelled",
  "expired",
];

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const requireText = (value: unknown, fieldName: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) throw new AthletePartnerBenefitError("validation", `${fieldName} est requis.`);
  return normalized;
};

const requireUuid = (value: unknown, fieldName: string): string => {
  const normalized = requireText(value, fieldName).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new AthletePartnerBenefitError("validation", `${fieldName} est invalide.`);
  }
  return normalized;
};

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(requireText(value, fieldName));
  if (Number.isNaN(parsed.getTime())) {
    throw new AthletePartnerBenefitError("validation", `${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const normalizeNullableTimestamp = (value: unknown, fieldName: string): string | null =>
  value === null || value === undefined ? null : normalizeTimestamp(value, fieldName);

const normalizeUsagePolicy = (value: unknown): AthletePartnerBenefitUsagePolicy => {
  const normalized = normalizeText(value) as AthletePartnerBenefitUsagePolicy;
  if (!usagePolicies.includes(normalized)) {
    throw new AthletePartnerBenefitError("validation", "usage_policy Neon est invalide.");
  }
  return normalized;
};

const normalizeAvailability = (value: unknown): AthletePartnerBenefitAvailability => {
  const normalized = normalizeText(value) as AthletePartnerBenefitAvailability;
  if (!availabilities.includes(normalized)) {
    throw new AthletePartnerBenefitError("validation", "availability Neon est invalide.");
  }
  return normalized;
};

const normalizePersonalStatus = (value: unknown): AthletePartnerBenefitPersonalStatus => {
  const normalized = normalizeText(value) as AthletePartnerBenefitPersonalStatus;
  if (!personalStatuses.includes(normalized)) {
    throw new AthletePartnerBenefitError("validation", "personal_status Neon est invalide.");
  }
  return normalized;
};

const mapMembership = (row: DataRow): ActiveMembershipSnapshot => ({
  id: requireText(row.id, "membership_id"),
  workspaceId: requireText(row.workspace_id, "workspace_id"),
  athleteId: requireText(row.athlete_id, "athlete_id"),
  startsAt: normalizeTimestamp(row.starts_at, "membership_starts_at"),
  endsAt: normalizeNullableTimestamp(row.ends_at, "membership_ends_at"),
});

const mapBenefit = (row: DataRow): AthletePartnerBenefit => {
  const availability = normalizeAvailability(row.availability);
  return {
    id: requireUuid(row.id, "benefit_id"),
    partnerId: requireUuid(row.partner_id, "partner_id"),
    title: requireText(row.title, "title"),
    details: requireText(row.details, "details"),
    usagePolicy: normalizeUsagePolicy(row.usage_policy),
    validFrom: normalizeTimestamp(row.valid_from, "valid_from"),
    expiresAt: normalizeNullableTimestamp(row.expires_at, "expires_at"),
    availability,
    personalStatus: normalizePersonalStatus(row.personal_status),
    available: availability === "available",
    activeReservationId: row.active_reservation_id ? requireUuid(row.active_reservation_id, "active_reservation_id") : null,
  };
};

const mapReservation = (row: DataRow): AthletePartnerBenefitReservation => {
  const status = normalizeText(row.status);
  if (status !== "reserved" && status !== "cancelled") {
    throw new AthletePartnerBenefitError("validation", "status Neon est invalide.");
  }
  return {
    id: requireUuid(row.id, "reservation_id"),
    workspaceId: requireText(row.workspace_id, "workspace_id"),
    benefitId: requireUuid(row.benefit_id, "benefit_id"),
    partnerId: requireUuid(row.partner_id, "partner_id"),
    athleteId: requireText(row.athlete_id, "athlete_id"),
    membershipId: requireText(row.membership_id, "membership_id"),
    membershipStartsAt: normalizeTimestamp(row.membership_starts_at, "membership_starts_at"),
    membershipEndsAt: normalizeNullableTimestamp(row.membership_ends_at, "membership_ends_at"),
    usagePolicy: normalizeUsagePolicy(row.usage_policy),
    usageScopeKey: requireText(row.usage_scope_key, "usage_scope_key"),
    status,
    reservedAt: normalizeTimestamp(row.reserved_at, "reserved_at"),
    cancelledAt: normalizeNullableTimestamp(row.cancelled_at, "cancelled_at"),
    expiresAt: normalizeNullableTimestamp(row.expires_at, "expires_at"),
  };
};

const createRepository = (): AthletePartnerBenefitRepository => {
  const sql = createContentStorageClient();

  return {
    async findActiveMembership(workspaceId, athleteId) {
      const rows = await sql`
        SELECT id, workspace_id, athlete_id, starts_at, ends_at
        FROM athlete_memberships
        WHERE workspace_id = ${workspaceId}
          AND athlete_id = ${athleteId}
          AND status = 'active'
          AND starts_at <= NOW()
          AND (ends_at IS NULL OR ends_at > NOW())
        ORDER BY starts_at DESC, created_at DESC
        LIMIT 1
      ` as DataRow[];
      return rows[0] ?? null;
    },

    async list(workspaceId, athleteId, membershipId, activePartnerIds) {
      if (activePartnerIds.length === 0) return [];
      return await sql`
        SELECT
          benefit.id,
          benefit.partner_id,
          benefit.title,
          benefit.details,
          benefit.usage_policy,
          benefit.valid_from,
          benefit.expires_at,
          active_reservation.id AS active_reservation_id,
          COALESCE(latest_reservation.status, 'available') AS personal_status,
          CASE
            WHEN active_reservation.id IS NOT NULL THEN 'already_reserved'
            WHEN benefit.usage_policy = 'once_lifetime' AND lifetime_usage.used THEN 'already_used_lifetime'
            WHEN benefit.usage_policy = 'once_per_membership' AND membership_usage.used THEN 'already_used_membership'
            ELSE 'available'
          END AS availability
        FROM partner_benefits benefit
        LEFT JOIN LATERAL (
          SELECT reservation.id
          FROM partner_benefit_reservations reservation
          WHERE reservation.workspace_id = ${workspaceId}
            AND reservation.benefit_id = benefit.id
            AND reservation.partner_id = benefit.partner_id
            AND reservation.athlete_id = ${athleteId}
            AND reservation.status = 'reserved'
          ORDER BY reservation.reserved_at DESC
          LIMIT 1
        ) active_reservation ON TRUE
        LEFT JOIN LATERAL (
          SELECT reservation.status
          FROM partner_benefit_reservations reservation
          WHERE reservation.workspace_id = ${workspaceId}
            AND reservation.benefit_id = benefit.id
            AND reservation.partner_id = benefit.partner_id
            AND reservation.athlete_id = ${athleteId}
          ORDER BY reservation.reserved_at DESC, reservation.created_at DESC
          LIMIT 1
        ) latest_reservation ON TRUE
        LEFT JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1
            FROM partner_benefit_reservations reservation
            WHERE reservation.workspace_id = ${workspaceId}
              AND reservation.benefit_id = benefit.id
              AND reservation.partner_id = benefit.partner_id
              AND reservation.athlete_id = ${athleteId}
              AND reservation.status = 'used'
          ) AS used
        ) lifetime_usage ON TRUE
        LEFT JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1
            FROM partner_benefit_reservations reservation
            WHERE reservation.workspace_id = ${workspaceId}
              AND reservation.benefit_id = benefit.id
              AND reservation.partner_id = benefit.partner_id
              AND reservation.athlete_id = ${athleteId}
              AND reservation.membership_id = ${membershipId}
              AND reservation.status = 'used'
          ) AS used
        ) membership_usage ON TRUE
        WHERE benefit.workspace_id = ${workspaceId}
          AND benefit.partner_id = ANY(${activePartnerIds}::uuid[])
          AND benefit.status = 'active'
          AND benefit.valid_from <= NOW()
          AND (benefit.expires_at IS NULL OR benefit.expires_at > NOW())
        ORDER BY benefit.valid_from DESC, benefit.title ASC
      ` as DataRow[];
    },

    async reserve(record) {
      const lockMembership = sql`
        SELECT id
        FROM athlete_memberships
        WHERE workspace_id = ${record.workspaceId}
          AND id = ${record.membership.id}
          AND athlete_id = ${record.athleteId}
          AND status = 'active'
          AND starts_at <= NOW()
          AND (ends_at IS NULL OR ends_at > NOW())
        FOR UPDATE
      `;
      const lockBenefit = sql`
        SELECT id
        FROM partner_benefits
        WHERE workspace_id = ${record.workspaceId}
          AND id = ${record.benefitId}::uuid
          AND partner_id = ANY(${record.activePartnerIds}::uuid[])
          AND status = 'active'
          AND valid_from <= NOW()
          AND (expires_at IS NULL OR expires_at > NOW())
        FOR UPDATE
      `;
      const insertReservation = sql`
        WITH membership AS (
          SELECT id, workspace_id, athlete_id, starts_at, ends_at
          FROM athlete_memberships
          WHERE workspace_id = ${record.workspaceId}
            AND id = ${record.membership.id}
            AND athlete_id = ${record.athleteId}
            AND status = 'active'
            AND starts_at <= NOW()
            AND (ends_at IS NULL OR ends_at > NOW())
          FOR UPDATE
        ), benefit AS (
          SELECT id, workspace_id, partner_id, usage_policy, expires_at
          FROM partner_benefits
          WHERE workspace_id = ${record.workspaceId}
            AND id = ${record.benefitId}::uuid
            AND partner_id = ANY(${record.activePartnerIds}::uuid[])
            AND status = 'active'
            AND valid_from <= NOW()
            AND (expires_at IS NULL OR expires_at > NOW())
        )
        INSERT INTO partner_benefit_reservations (
          id, workspace_id, benefit_id, partner_id, athlete_id, membership_id,
          membership_starts_at, membership_ends_at, usage_policy, usage_scope_key,
          status, reserved_at, expires_at, created_at, updated_at
        )
        SELECT
          ${record.reservationId}::uuid,
          membership.workspace_id,
          benefit.id,
          benefit.partner_id,
          membership.athlete_id,
          membership.id,
          membership.starts_at,
          membership.ends_at,
          benefit.usage_policy,
          CASE WHEN benefit.usage_policy = 'once_lifetime' THEN 'lifetime'
               WHEN benefit.usage_policy = 'once_per_membership' THEN membership.id
               ELSE ${record.reservationId} END,
          'reserved',
          NOW(),
          CASE WHEN membership.ends_at IS NULL THEN benefit.expires_at
               WHEN benefit.expires_at IS NULL THEN membership.ends_at
               ELSE LEAST(membership.ends_at, benefit.expires_at) END,
          NOW(),
          NOW()
        FROM membership
        CROSS JOIN benefit
        WHERE NOT EXISTS (
          SELECT 1
          FROM partner_benefit_reservations existing
          WHERE existing.workspace_id = membership.workspace_id
            AND existing.benefit_id = benefit.id
            AND existing.partner_id = benefit.partner_id
            AND existing.athlete_id = membership.athlete_id
            AND existing.status = 'reserved'
        )
          AND NOT EXISTS (
            SELECT 1
            FROM partner_benefit_reservations existing
            WHERE existing.workspace_id = membership.workspace_id
              AND existing.benefit_id = benefit.id
              AND existing.partner_id = benefit.partner_id
              AND existing.athlete_id = membership.athlete_id
              AND existing.status = 'used'
              AND (
                benefit.usage_policy = 'once_lifetime'
                OR (benefit.usage_policy = 'once_per_membership' AND existing.membership_id = membership.id)
              )
          )
        RETURNING id, workspace_id, benefit_id, partner_id, athlete_id, membership_id,
            membership_starts_at, membership_ends_at, usage_policy, usage_scope_key,
            status, reserved_at, cancelled_at, expires_at
      `;
      const insertEvent = sql`
        INSERT INTO partner_benefit_reservation_events (
          id, workspace_id, reservation_id, actor_clerk_user_id, actor_role,
          previous_status, new_status, occurred_at
        )
        SELECT ${record.eventId}::uuid, reservation.workspace_id, reservation.id,
               ${record.actorClerkUserId}, 'athlete', NULL, 'reserved', NOW()
        FROM partner_benefit_reservations reservation
        WHERE reservation.workspace_id = ${record.workspaceId}
          AND reservation.id = ${record.reservationId}::uuid
          AND reservation.athlete_id = ${record.athleteId}
      `;
      const insertNotifications = sql`
        INSERT INTO notifications (
          id, workspace_id, recipient_clerk_user_id, type, title, body,
          action_href, source_type, source_id, created_at
        )
         SELECT md5(reservation.id::text || ':' || access.clerk_user_id)::uuid,
           reservation.workspace_id, access.clerk_user_id,
               'partner_benefit.reserved', 'Nouvelle réservation d’avantage',
               benefit.title, '/partner', 'partner_benefit_reservation', reservation.id::text, NOW()
        FROM partner_benefit_reservations reservation
        JOIN partner_benefits benefit
          ON benefit.workspace_id = reservation.workspace_id
         AND benefit.id = reservation.benefit_id
         AND benefit.partner_id = reservation.partner_id
        JOIN user_access access
          ON access.workspace_id = reservation.workspace_id
         AND access.partner_id = reservation.partner_id::text
         AND access.role = 'partner_expert'
         AND access.status = 'active'
        WHERE reservation.workspace_id = ${record.workspaceId}
          AND reservation.id = ${record.reservationId}::uuid
        ON CONFLICT (workspace_id, recipient_clerk_user_id, source_type, source_id)
          WHERE source_type IS NOT NULL AND source_id IS NOT NULL
        DO NOTHING
      `;
      const results = await sql.transaction(
        [lockMembership, lockBenefit, insertReservation, insertEvent, insertNotifications],
        { isolationLevel: "Serializable" },
      );
      const membershipRows = results[0] as DataRow[];
      const benefitRows = results[1] as DataRow[];
      const reservationRows = results[2] as DataRow[];
      if (membershipRows.length === 0) {
        throw new AthletePartnerBenefitError("membership_required", "Une adhésion active est requise.");
      }
      if (benefitRows.length === 0) {
        throw new AthletePartnerBenefitError("not_found", "Avantage partenaire actif introuvable.");
      }
      return reservationRows[0] ?? null;
    },

    async cancel(record) {
      const updateReservation = sql`
        WITH updated AS (
          UPDATE partner_benefit_reservations reservation
          SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
          WHERE reservation.workspace_id = ${record.workspaceId}
            AND reservation.id = ${record.reservationId}::uuid
            AND reservation.athlete_id = ${record.athleteId}
            AND reservation.partner_id = ANY(${record.activePartnerIds}::uuid[])
            AND reservation.status = 'reserved'
            AND EXISTS (
              SELECT 1
              FROM partner_benefits benefit
              WHERE benefit.workspace_id = reservation.workspace_id
                AND benefit.id = reservation.benefit_id
                AND benefit.partner_id = reservation.partner_id
                AND benefit.status = 'active'
                AND benefit.valid_from <= NOW()
                AND (benefit.expires_at IS NULL OR benefit.expires_at > NOW())
            )
          RETURNING reservation.*
        ), event AS (
          INSERT INTO partner_benefit_reservation_events (
            id, workspace_id, reservation_id, actor_clerk_user_id, actor_role,
            previous_status, new_status, occurred_at
          )
          SELECT ${record.eventId}::uuid, updated.workspace_id, updated.id,
                 ${record.actorClerkUserId}, 'athlete', 'reserved', 'cancelled', NOW()
          FROM updated
          RETURNING reservation_id
        )
        SELECT updated.id, updated.workspace_id, updated.benefit_id, updated.partner_id,
               updated.athlete_id, updated.membership_id, updated.membership_starts_at,
               updated.membership_ends_at, updated.usage_policy, updated.usage_scope_key,
               updated.status, updated.reserved_at, updated.cancelled_at, updated.expires_at
        FROM updated
        JOIN event ON event.reservation_id = updated.id
      `;
      const results = await sql.transaction([updateReservation], { isolationLevel: "Serializable" });
      return (results[0] as DataRow[])[0] ?? null;
    },
  };
};

const defaultDependencies = (): AthletePartnerBenefitDependencies => ({
  repository: createRepository(),
  getPartners: getEcosystemPartnersFrom06Partenaires,
  createId: randomUUID,
});

const requireActiveAthlete = async (request: Request): Promise<{
  clerkUserId: string;
  workspaceId: string;
  athleteId: string;
}> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const athleteId = access?.athleteId?.trim() ?? "";
  if (!clerkUserId || access?.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
    throw new AthletePartnerBenefitError("forbidden", "Un accès Athlète actif est requis.");
  }
  return { clerkUserId, workspaceId, athleteId };
};

const activePartnerIds = async (
  getPartners: typeof getEcosystemPartnersFrom06Partenaires,
): Promise<string[]> => {
  const partners = await getPartners();
  return partners
    .filter((partner) => normalizeText(partner.status).toLocaleLowerCase("fr") === "actif")
    .map((partner) => normalizeText(partner.id).toLowerCase())
    .filter((partnerId) => UUID_PATTERN.test(partnerId));
};

const requireActiveMembership = async (
  repository: AthletePartnerBenefitRepository,
  workspaceId: string,
  athleteId: string,
): Promise<ActiveMembershipSnapshot> => {
  const row = await repository.findActiveMembership(workspaceId, athleteId);
  if (!row) throw new AthletePartnerBenefitError("membership_required", "Une adhésion active est requise.");
  return mapMembership(row);
};

const isSerializationConflict = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && "code" in error && (error.code === "40001" || error.code === "23505"));

export const listAthletePartnerBenefits = async (
  request: Request,
  dependencies?: AthletePartnerBenefitDependencies,
): Promise<AthletePartnerBenefit[]> => {
  const identity = await requireActiveAthlete(request);
  const resolved = dependencies ?? defaultDependencies();
  const membership = await requireActiveMembership(resolved.repository, identity.workspaceId, identity.athleteId);
  const partnerIds = await activePartnerIds(resolved.getPartners);
  return (await resolved.repository.list(
    identity.workspaceId,
    identity.athleteId,
    membership.id,
    partnerIds,
  )).map(mapBenefit);
};

export const reserveAthletePartnerBenefit = async (
  request: Request,
  input: { benefitId?: unknown },
  dependencies?: AthletePartnerBenefitDependencies,
): Promise<AthletePartnerBenefitReservation> => {
  const identity = await requireActiveAthlete(request);
  const resolved = dependencies ?? defaultDependencies();
  const benefitId = requireUuid(input.benefitId, "benefitId");
  const membership = await requireActiveMembership(resolved.repository, identity.workspaceId, identity.athleteId);
  const partnerIds = await activePartnerIds(resolved.getPartners);
  try {
    const row = await resolved.repository.reserve({
      reservationId: resolved.createId(),
      eventId: resolved.createId(),
      workspaceId: identity.workspaceId,
      athleteId: identity.athleteId,
      actorClerkUserId: identity.clerkUserId,
      membership,
      benefitId,
      activePartnerIds: partnerIds,
    });
    if (!row) {
      throw new AthletePartnerBenefitError("unavailable", "Cet avantage n’est pas disponible pour cette adhésion.");
    }
    return mapReservation(row);
  } catch (error) {
    if (error instanceof AthletePartnerBenefitError) throw error;
    if (isSerializationConflict(error)) {
      throw new AthletePartnerBenefitError("conflict", "Une réservation concurrente a été détectée.");
    }
    throw error;
  }
};

export const cancelAthletePartnerBenefitReservation = async (
  request: Request,
  reservationIdValue: unknown,
  dependencies?: AthletePartnerBenefitDependencies,
): Promise<AthletePartnerBenefitReservation> => {
  const identity = await requireActiveAthlete(request);
  const resolved = dependencies ?? defaultDependencies();
  await requireActiveMembership(resolved.repository, identity.workspaceId, identity.athleteId);
  const partnerIds = await activePartnerIds(resolved.getPartners);
  const reservationId = requireUuid(reservationIdValue, "reservationId");
  const row = await resolved.repository.cancel({
    eventId: resolved.createId(),
    workspaceId: identity.workspaceId,
    athleteId: identity.athleteId,
    actorClerkUserId: identity.clerkUserId,
    reservationId,
    activePartnerIds: partnerIds,
  });
  if (!row) throw new AthletePartnerBenefitError("not_found", "Réservation active introuvable.");
  return mapReservation(row);
};