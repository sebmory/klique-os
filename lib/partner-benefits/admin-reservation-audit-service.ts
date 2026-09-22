import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  getAthletesFromGoogleSheets,
  getEcosystemPartnersFrom06Partenaires,
} from "@/lib/google-sheets";

export const PARTNER_BENEFIT_RESERVATION_STATUSES = ["reserved", "used", "cancelled", "expired"] as const;

export type PartnerBenefitReservationAuditStatus = (typeof PARTNER_BENEFIT_RESERVATION_STATUSES)[number];

export type PartnerBenefitReservationAuditFilters = {
  partnerId?: unknown;
  athleteId?: unknown;
  benefitId?: unknown;
  status?: unknown;
};

export type PartnerBenefitReservationAuditEvent = {
  id: string;
  actorClerkUserId: string;
  actorRole: "admin" | "athlete" | "partner_expert" | "media";
  previousStatus: PartnerBenefitReservationAuditStatus | null;
  newStatus: PartnerBenefitReservationAuditStatus;
  occurredAt: string;
};

export type PartnerBenefitReservationAuditRecord = {
  id: string;
  partnerId: string;
  partnerName: string;
  athleteId: string;
  athleteName: string;
  benefit: {
    id: string;
    title: string;
    details: string;
    usagePolicy: "once_lifetime" | "once_per_membership" | "unlimited";
  };
  status: PartnerBenefitReservationAuditStatus;
  reservedAt: string;
  usedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  history: PartnerBenefitReservationAuditEvent[];
};

type DataRow = Record<string, unknown>;

type NormalizedFilters = {
  partnerId: string | null;
  athleteId: string | null;
  benefitId: string | null;
  status: PartnerBenefitReservationAuditStatus | null;
};

export type PartnerBenefitReservationAuditRepository = {
  list: (workspaceId: string, filters: NormalizedFilters) => Promise<DataRow[]>;
};

export type PartnerBenefitReservationAuditDependencies = {
  repository: PartnerBenefitReservationAuditRepository;
  getPartners: typeof getEcosystemPartnersFrom06Partenaires;
  getAthletes: typeof getAthletesFromGoogleSheets;
};

export class PartnerBenefitReservationAuditError extends Error {
  constructor(
    public readonly code: "forbidden" | "validation",
    message: string,
  ) {
    super(message);
    this.name = "PartnerBenefitReservationAuditError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const usagePolicies = ["once_lifetime", "once_per_membership", "unlimited"] as const;
const actorRoles = ["admin", "athlete", "partner_expert", "media"] as const;

const requireText = (value: unknown, fieldName: string, maximumLength = 200): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new PartnerBenefitReservationAuditError("validation", `${fieldName} est requis.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new PartnerBenefitReservationAuditError("validation", `${fieldName} est trop long.`);
  }
  return normalized;
};

const requireUuid = (value: unknown, fieldName: string): string => {
  const normalized = requireText(value, fieldName, 36).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new PartnerBenefitReservationAuditError("validation", `${fieldName} doit être un UUID valide.`);
  }
  return normalized;
};

const normalizeStatus = (value: unknown, fieldName = "status"): PartnerBenefitReservationAuditStatus => {
  const normalized = requireText(value, fieldName, 20).toLowerCase() as PartnerBenefitReservationAuditStatus;
  if (!PARTNER_BENEFIT_RESERVATION_STATUSES.includes(normalized)) {
    throw new PartnerBenefitReservationAuditError("validation", `${fieldName} est invalide.`);
  }
  return normalized;
};

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(requireText(value, fieldName));
  if (Number.isNaN(parsed.getTime())) {
    throw new PartnerBenefitReservationAuditError("validation", `${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const normalizeNullableTimestamp = (value: unknown, fieldName: string): string | null =>
  value === null || value === undefined ? null : normalizeTimestamp(value, fieldName);

const normalizeHistory = (value: unknown): PartnerBenefitReservationAuditEvent[] => {
  const raw = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(raw)) {
    throw new PartnerBenefitReservationAuditError("validation", "history Neon est invalide.");
  }
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new PartnerBenefitReservationAuditError("validation", "Événement Neon invalide.");
    }
    const row = entry as DataRow;
    const actorRole = requireText(row.actorRole, "actorRole") as PartnerBenefitReservationAuditEvent["actorRole"];
    if (!actorRoles.includes(actorRole)) {
      throw new PartnerBenefitReservationAuditError("validation", "actorRole Neon est invalide.");
    }
    return {
      id: requireUuid(row.id, "eventId"),
      actorClerkUserId: requireText(row.actorClerkUserId, "actorClerkUserId"),
      actorRole,
      previousStatus: row.previousStatus === null ? null : normalizeStatus(row.previousStatus, "previousStatus"),
      newStatus: normalizeStatus(row.newStatus, "newStatus"),
      occurredAt: normalizeTimestamp(row.occurredAt, "occurredAt"),
    };
  });
};

const mapReservation = (row: DataRow): PartnerBenefitReservationAuditRecord => {
  const usagePolicy = requireText(row.usage_policy, "usage_policy") as PartnerBenefitReservationAuditRecord["benefit"]["usagePolicy"];
  if (!usagePolicies.includes(usagePolicy)) {
    throw new PartnerBenefitReservationAuditError("validation", "usage_policy Neon est invalide.");
  }
  return {
    id: requireUuid(row.id, "reservationId"),
    partnerId: requireUuid(row.partner_id, "partnerId"),
    partnerName: requireUuid(row.partner_id, "partnerId"),
    athleteId: requireText(row.athlete_id, "athleteId"),
    athleteName: requireText(row.athlete_id, "athleteId"),
    benefit: {
      id: requireUuid(row.benefit_id, "benefitId"),
      title: requireText(row.benefit_title, "benefitTitle"),
      details: requireText(row.benefit_details, "benefitDetails", 5000),
      usagePolicy,
    },
    status: normalizeStatus(row.status),
    reservedAt: normalizeTimestamp(row.reserved_at, "reservedAt"),
    usedAt: normalizeNullableTimestamp(row.used_at, "usedAt"),
    cancelledAt: normalizeNullableTimestamp(row.cancelled_at, "cancelledAt"),
    expiresAt: normalizeNullableTimestamp(row.expires_at, "expiresAt"),
    history: normalizeHistory(row.history),
  };
};

const normalizeFilters = (filters: PartnerBenefitReservationAuditFilters): NormalizedFilters => ({
  partnerId: filters.partnerId === undefined ? null : requireUuid(filters.partnerId, "partnerId"),
  athleteId: filters.athleteId === undefined ? null : requireText(filters.athleteId, "athleteId"),
  benefitId: filters.benefitId === undefined ? null : requireUuid(filters.benefitId, "benefitId"),
  status: filters.status === undefined ? null : normalizeStatus(filters.status),
});

const createRepository = (): PartnerBenefitReservationAuditRepository => {
  const sql = createContentStorageClient();
  return {
    async list(workspaceId, filters) {
      return await sql`
        SELECT reservation.id, reservation.partner_id, reservation.athlete_id,
               reservation.benefit_id, benefit.title AS benefit_title,
               benefit.details AS benefit_details, reservation.usage_policy,
               reservation.status, reservation.reserved_at, reservation.used_at,
               reservation.cancelled_at, reservation.expires_at,
               COALESCE(history.events, '[]'::json) AS history
        FROM partner_benefit_reservations reservation
        JOIN partner_benefits benefit
          ON benefit.workspace_id = reservation.workspace_id
         AND benefit.id = reservation.benefit_id
         AND benefit.partner_id = reservation.partner_id
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', event.id,
              'actorClerkUserId', event.actor_clerk_user_id,
              'actorRole', event.actor_role,
              'previousStatus', event.previous_status,
              'newStatus', event.new_status,
              'occurredAt', event.occurred_at
            ) ORDER BY event.occurred_at ASC, event.id ASC
          ) AS events
          FROM partner_benefit_reservation_events event
          WHERE event.workspace_id = reservation.workspace_id
            AND event.reservation_id = reservation.id
        ) history ON TRUE
        WHERE reservation.workspace_id = ${workspaceId}
          AND (${filters.partnerId}::uuid IS NULL OR reservation.partner_id = ${filters.partnerId}::uuid)
          AND (${filters.athleteId}::text IS NULL OR reservation.athlete_id = ${filters.athleteId})
          AND (${filters.benefitId}::uuid IS NULL OR reservation.benefit_id = ${filters.benefitId}::uuid)
          AND (${filters.status}::text IS NULL OR reservation.status = ${filters.status})
        ORDER BY reservation.reserved_at DESC, reservation.id DESC
      ` as DataRow[];
    },
  };
};

const defaultDependencies = (): PartnerBenefitReservationAuditDependencies => ({
  repository: createRepository(),
  getPartners: getEcosystemPartnersFrom06Partenaires,
  getAthletes: getAthletesFromGoogleSheets,
});

const requireActiveAdminWorkspace = async (request: Request): Promise<string> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (!clerkUserId || access?.role !== "admin" || access.status !== "active" || !workspaceId) {
    throw new PartnerBenefitReservationAuditError("forbidden", "Un accès Admin actif est requis.");
  }
  return workspaceId;
};

export const listAdminPartnerBenefitReservationAudit = async (
  request: Request,
  filters: PartnerBenefitReservationAuditFilters = {},
  dependencies?: PartnerBenefitReservationAuditDependencies,
): Promise<PartnerBenefitReservationAuditRecord[]> => {
  const workspaceId = await requireActiveAdminWorkspace(request);
  const normalizedFilters = normalizeFilters(filters);
  const resolvedDependencies = dependencies ?? defaultDependencies();
  const rows = await resolvedDependencies.repository.list(workspaceId, normalizedFilters);
  const reservations = rows.map(mapReservation);
  const [partners, athletes] = await Promise.all([
    resolvedDependencies.getPartners(),
    resolvedDependencies.getAthletes(),
  ]);
  const partnerNames = new Map(partners.map((partner) => [
    String(partner.id ?? "").trim().toLowerCase(),
    String(partner.name ?? "").trim(),
  ]));
  const athleteNames = new Map(athletes.map((athlete) => [
    String(athlete.athleteId || athlete.key || "").trim(),
    String(athlete.name ?? "").trim(),
  ]));

  return reservations.map((reservation) => ({
    ...reservation,
    partnerName: partnerNames.get(reservation.partnerId) || reservation.partnerId,
    athleteName: athleteNames.get(reservation.athleteId) || reservation.athleteId,
  }));
};