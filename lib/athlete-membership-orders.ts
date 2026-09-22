import { randomBytes, randomUUID } from "crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import { buildAnnualPlanGrantReference } from "@/lib/athlete-credits";

export type AthleteMembershipOrderStatus = "pending" | "paid" | "cancelled" | "expired";
export type CommercialAthletePlanCode = "essential" | "impact" | "signature";

export type AthleteMembershipOrder = {
  id: string;
  workspaceId: string;
  athleteId: string;
  publicReference: string;
  planCode: CommercialAthletePlanCode;
  planName: string;
  annualPriceChf: number;
  durationMonths: number;
  productionCredits: number;
  customContentCredits: number;
  videoAllowed: boolean;
  paymentMethod: "twint_business";
  status: AthleteMembershipOrderStatus;
  membershipId: string | null;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AthleteMembershipOrderView = AthleteMembershipOrder & { twintPaymentUrl: string };
export type AdminAthleteMembershipOrder = AthleteMembershipOrder & { athleteName: string };
export type AdminAthleteMembershipOrderFilters = {
  status?: AthleteMembershipOrderStatus;
  athleteId?: string;
  planCode?: CommercialAthletePlanCode;
};

export type ConfirmedAthleteMembershipOrder = {
  order: AthleteMembershipOrder;
  membershipId: string;
  alreadyPaid: boolean;
};

type OrderRow = {
  id: string;
  workspace_id: string;
  athlete_id: string;
  public_reference: string;
  plan_code: CommercialAthletePlanCode;
  plan_name_snapshot: string;
  annual_price_chf_snapshot: string | number;
  duration_months_snapshot: number;
  production_credits_snapshot: number;
  custom_content_credits_snapshot: number;
  video_allowed_snapshot: boolean;
  payment_method: "twint_business";
  status: AthleteMembershipOrderStatus;
  membership_id: string | null;
  expires_at: string | Date;
  paid_at: string | Date | null;
  cancelled_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type CreateResult = { outcome: "created" | "reused" | "plan_conflict" | "membership_conflict" | "founder" | "invalid_plan"; order: OrderRow | null };
type ConfirmResult = { outcome: "paid" | "already_paid" | "expired" | "not_pending" | "not_found" | "membership_conflict" | "founder"; order: OrderRow | null; membershipId: string | null };

export type AthleteMembershipOrderRepository = {
  createAtomic(input: {
    id: string;
    workspaceId: string;
    athleteId: string;
    clerkUserId: string;
    planCode: CommercialAthletePlanCode;
    publicReference: string;
    now: string;
  }): Promise<CreateResult>;
  readCurrentAtomic(workspaceId: string, athleteId: string, now: string): Promise<OrderRow | null>;
  cancelAtomic(id: string, workspaceId: string, athleteId: string, now: string): Promise<OrderRow | null>;
  list(workspaceId: string, filters: AdminAthleteMembershipOrderFilters): Promise<OrderRow[]>;
  confirmAtomic(input: {
    orderId: string;
    workspaceId: string;
    adminClerkUserId: string;
    membershipId: string;
    productionMovementId: string;
    customContentMovementId: string;
    now: string;
  }): Promise<ConfirmResult>;
};

export type AthleteMembershipOrderDependencies = {
  repository: AthleteMembershipOrderRepository;
  getAccessProfile: typeof getCurrentUserAccessProfile;
  getAthleteNames: () => Promise<Map<string, string>>;
  createId: () => string;
  createReference: () => string;
  now: () => Date;
  getTwintPaymentUrl: () => string;
};

export class AthleteMembershipOrderError extends Error {
  constructor(
    public readonly code: "forbidden" | "validation" | "conflict" | "not_found" | "configuration" | "expired",
    message: string,
  ) {
    super(message);
    this.name = "AthleteMembershipOrderError";
  }
}

const commercialPlanCodes = new Set<CommercialAthletePlanCode>(["essential", "impact", "signature"]);
const statuses = new Set<AthleteMembershipOrderStatus>(["pending", "paid", "cancelled", "expired"]);
const referenceAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const REFERENCE_RETRY_LIMIT = 4;

const iso = (value: string | Date): string => new Date(value).toISOString();
const normalize = (value: string | undefined): string => value?.trim() ?? "";
const mapOrder = (row: OrderRow): AthleteMembershipOrder => ({
  id: row.id,
  workspaceId: row.workspace_id,
  athleteId: row.athlete_id,
  publicReference: row.public_reference,
  planCode: row.plan_code,
  planName: row.plan_name_snapshot,
  annualPriceChf: Number(row.annual_price_chf_snapshot),
  durationMonths: Number(row.duration_months_snapshot),
  productionCredits: Number(row.production_credits_snapshot),
  customContentCredits: Number(row.custom_content_credits_snapshot),
  videoAllowed: row.video_allowed_snapshot,
  paymentMethod: row.payment_method,
  status: row.status,
  membershipId: row.membership_id,
  expiresAt: iso(row.expires_at),
  paidAt: row.paid_at ? iso(row.paid_at) : null,
  cancelledAt: row.cancelled_at ? iso(row.cancelled_at) : null,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export const generateAthleteMembershipOrderReference = (): string => {
  const bytes = randomBytes(12);
  let suffix = "";
  for (const byte of bytes) suffix += referenceAlphabet[byte % referenceAlphabet.length];
  return `KQ-${suffix}`;
};

export const resolveTwintBusinessPaymentUrl = (): string => {
  const configured = process.env.TWINT_BUSINESS_PAYMENT_URL?.trim() ?? "";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
    return url.toString();
  } catch {
    throw new AthleteMembershipOrderError("configuration", "Le paiement TWINT est temporairement indisponible.");
  }
};

const isUniqueReferenceCollision = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const postgres = error as { code?: string; constraint?: string };
  return postgres.code === "23505" && postgres.constraint === "athlete_membership_orders_public_reference_idx";
};

const requireAthlete = async (request: Request, getAccessProfile: typeof getCurrentUserAccessProfile) => {
  const profile = await getAccessProfile(request);
  const access = profile?.userAccess;
  const clerkUserId = normalize(profile?.clerkUser?.id);
  const workspaceId = normalize(access?.workspaceId);
  const athleteId = normalize(access?.athleteId ?? undefined);
  if (!clerkUserId || access?.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
    throw new AthleteMembershipOrderError("forbidden", "Un accès Athlète actif est requis.");
  }
  return { clerkUserId, workspaceId, athleteId };
};

const requireAdmin = async (request: Request, getAccessProfile: typeof getCurrentUserAccessProfile) => {
  const profile = await getAccessProfile(request);
  const access = profile?.userAccess;
  const clerkUserId = normalize(profile?.clerkUser?.id);
  const workspaceId = normalize(access?.workspaceId);
  if (!clerkUserId || access?.role !== "admin" || access.status !== "active" || !workspaceId) {
    throw new AthleteMembershipOrderError("forbidden", "Un accès Admin actif est requis.");
  }
  return { clerkUserId, workspaceId };
};

const parsePlanCode = (value: string): CommercialAthletePlanCode => {
  const planCode = normalize(value) as CommercialAthletePlanCode;
  if (!commercialPlanCodes.has(planCode)) {
    throw new AthleteMembershipOrderError("validation", "Cette offre Athlète n’est pas disponible.");
  }
  return planCode;
};

const parseFilters = (filters: AdminAthleteMembershipOrderFilters): AdminAthleteMembershipOrderFilters => {
  const status = filters.status;
  if (status !== undefined && !statuses.has(status)) {
    throw new AthleteMembershipOrderError("validation", "Le statut de commande est invalide.");
  }
  const planCode = filters.planCode === undefined ? undefined : parsePlanCode(filters.planCode);
  return { status, planCode, athleteId: normalize(filters.athleteId) || undefined };
};

const createRepository = (): AthleteMembershipOrderRepository => {
  const sql = createContentStorageClient();
  const orderColumns = sql.unsafe(`orders.id, orders.workspace_id, orders.athlete_id, orders.public_reference,
    orders.plan_code, orders.plan_name_snapshot, orders.annual_price_chf_snapshot,
    orders.duration_months_snapshot, orders.production_credits_snapshot,
    orders.custom_content_credits_snapshot, orders.video_allowed_snapshot, orders.payment_method,
    orders.status, orders.membership_id, orders.expires_at, orders.paid_at, orders.cancelled_at,
    orders.created_at, orders.updated_at`);

  return {
    async createAtomic(input) {
      const query = sql`
        WITH expired AS (
          UPDATE athlete_membership_orders
          SET status = 'expired', updated_at = ${input.now}::timestamptz
          WHERE workspace_id = ${input.workspaceId} AND athlete_id = ${input.athleteId}
            AND status = 'pending' AND expires_at <= ${input.now}::timestamptz
        ), candidate_plan AS (
          SELECT code, name, duration_months, annual_price_chf, production_credits,
                 custom_content_credits, video_allowed
          FROM membership_plans
          WHERE code = ${input.planCode} AND active = TRUE
            AND code IN ('essential', 'impact', 'signature')
            AND duration_months = 12 AND annual_price_chf IS NOT NULL
            AND production_credits > 0 AND custom_content_credits > 0
        ), membership_state AS (
          SELECT
            BOOL_OR(membership_kind = 'founder') AS is_founder,
            BOOL_OR(
              status = 'active'
              OR (status = 'scheduled' AND starts_at <= ${input.now}::timestamptz
                AND (ends_at IS NULL OR ends_at > ${input.now}::timestamptz))
            ) AS has_active
          FROM athlete_memberships
          WHERE workspace_id = ${input.workspaceId} AND athlete_id = ${input.athleteId}
        ), current_pending AS (
          SELECT orders.* FROM athlete_membership_orders orders
          WHERE orders.workspace_id = ${input.workspaceId} AND orders.athlete_id = ${input.athleteId}
            AND orders.status = 'pending'
          ORDER BY orders.created_at DESC LIMIT 1
        ), inserted AS (
          INSERT INTO athlete_membership_orders (
            id, workspace_id, athlete_id, public_reference, plan_code, plan_name_snapshot,
            annual_price_chf_snapshot, duration_months_snapshot, production_credits_snapshot,
            custom_content_credits_snapshot, video_allowed_snapshot, payment_method, status,
            created_by_clerk_user_id, expires_at, created_at, updated_at
          )
          SELECT ${input.id}::uuid, ${input.workspaceId}, ${input.athleteId}, ${input.publicReference},
                 plan.code, plan.name, plan.annual_price_chf, plan.duration_months,
                 plan.production_credits, plan.custom_content_credits, plan.video_allowed,
                 'twint_business', 'pending', ${input.clerkUserId},
                 ${input.now}::timestamptz + INTERVAL '7 days', ${input.now}::timestamptz, ${input.now}::timestamptz
          FROM candidate_plan plan, membership_state state
          WHERE COALESCE(state.is_founder, FALSE) = FALSE AND COALESCE(state.has_active, FALSE) = FALSE
            AND NOT EXISTS (SELECT 1 FROM current_pending)
          RETURNING *
        ), selected AS (
          SELECT * FROM inserted UNION ALL SELECT * FROM current_pending WHERE NOT EXISTS (SELECT 1 FROM inserted)
        )
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM candidate_plan) THEN 'invalid_plan'
          WHEN COALESCE((SELECT is_founder FROM membership_state), FALSE) THEN 'founder'
          WHEN COALESCE((SELECT has_active FROM membership_state), FALSE) THEN 'membership_conflict'
          WHEN EXISTS (SELECT 1 FROM current_pending WHERE plan_code <> ${input.planCode}) THEN 'plan_conflict'
          WHEN EXISTS (SELECT 1 FROM current_pending) THEN 'reused'
          ELSE 'created'
        END AS outcome,
        row_to_json(selected.*) AS order
        FROM selected
        UNION ALL
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM candidate_plan) THEN 'invalid_plan'
          WHEN COALESCE((SELECT is_founder FROM membership_state), FALSE) THEN 'founder'
          WHEN COALESCE((SELECT has_active FROM membership_state), FALSE) THEN 'membership_conflict'
          ELSE 'created'
        END, NULL
        WHERE NOT EXISTS (SELECT 1 FROM selected)
        LIMIT 1
      `;
      const results = await sql.transaction([query], { isolationLevel: "Serializable" });
      return (results[0] as CreateResult[])[0];
    },
    async readCurrentAtomic(workspaceId, athleteId, now) {
      const query = sql`
        WITH expired AS (
          UPDATE athlete_membership_orders
          SET status = 'expired', updated_at = ${now}::timestamptz
          WHERE workspace_id = ${workspaceId} AND athlete_id = ${athleteId}
            AND status = 'pending' AND expires_at <= ${now}::timestamptz
        )
        SELECT ${orderColumns} FROM athlete_membership_orders orders
        WHERE orders.workspace_id = ${workspaceId} AND orders.athlete_id = ${athleteId}
        ORDER BY CASE orders.status WHEN 'pending' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END,
                 orders.created_at DESC LIMIT 1
      `;
      const results = await sql.transaction([query], { isolationLevel: "Serializable" });
      return (results[0] as OrderRow[])[0] ?? null;
    },
    async cancelAtomic(id, workspaceId, athleteId, now) {
      const query = sql`
        WITH expired AS (
          UPDATE athlete_membership_orders orders
          SET status = 'expired', updated_at = ${now}::timestamptz
          WHERE orders.id = ${id}::uuid AND orders.workspace_id = ${workspaceId}
            AND orders.athlete_id = ${athleteId} AND orders.status = 'pending'
            AND orders.expires_at <= ${now}::timestamptz
        )
        UPDATE athlete_membership_orders orders
        SET status = 'cancelled', cancelled_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
        WHERE orders.id = ${id}::uuid AND orders.workspace_id = ${workspaceId}
          AND orders.athlete_id = ${athleteId} AND orders.status = 'pending'
          AND orders.expires_at > ${now}::timestamptz
        RETURNING ${orderColumns}
      `;
      const results = await sql.transaction([query], { isolationLevel: "Serializable" });
      return (results[0] as OrderRow[])[0] ?? null;
    },
    async list(workspaceId, filters) {
      const rows = await sql`
        SELECT ${orderColumns} FROM athlete_membership_orders orders
        WHERE orders.workspace_id = ${workspaceId}
          AND (${filters.status ?? null}::text IS NULL OR orders.status = ${filters.status ?? null})
          AND (${filters.athleteId ?? null}::text IS NULL OR orders.athlete_id = ${filters.athleteId ?? null})
          AND (${filters.planCode ?? null}::text IS NULL OR orders.plan_code = ${filters.planCode ?? null})
        ORDER BY orders.created_at DESC
      `;
      return rows as OrderRow[];
    },
    async confirmAtomic(input) {
      const startsAt = input.now;
      const referenceId = buildAnnualPlanGrantReference(input.membershipId, new Date(startsAt));
      const query = sql`
        WITH locked AS MATERIALIZED (
          SELECT * FROM athlete_membership_orders
          WHERE id = ${input.orderId}::uuid AND workspace_id = ${input.workspaceId}
          FOR UPDATE
        ), expired AS (
          UPDATE athlete_membership_orders orders
          SET status = 'expired', updated_at = ${input.now}::timestamptz
          FROM locked
          WHERE orders.id = locked.id AND locked.status = 'pending'
            AND locked.expires_at <= ${input.now}::timestamptz
          RETURNING orders.id
        ), membership_state AS (
          SELECT BOOL_OR(membership_kind = 'founder') AS is_founder,
                 BOOL_OR(
                   status = 'active'
                   OR (status = 'scheduled' AND starts_at <= ${input.now}::timestamptz
                     AND (ends_at IS NULL OR ends_at > ${input.now}::timestamptz))
                 ) AS has_active
          FROM athlete_memberships membership
          JOIN locked ON locked.workspace_id = membership.workspace_id AND locked.athlete_id = membership.athlete_id
        ), created_membership AS (
          INSERT INTO athlete_memberships (
            id, workspace_id, athlete_id, membership_kind, plan_code, status, starts_at, ends_at,
            auto_renew, payment_installments, source, created_at, updated_at
          )
          SELECT ${input.membershipId}, locked.workspace_id, locked.athlete_id, 'subscription',
                 locked.plan_code, 'active', ${startsAt}::timestamptz,
                 ${startsAt}::timestamptz + INTERVAL '12 months', FALSE, 1,
                 'twint_manual_order', ${startsAt}::timestamptz, ${startsAt}::timestamptz
          FROM locked, membership_state state
          WHERE locked.status = 'pending' AND locked.expires_at > ${input.now}::timestamptz
            AND COALESCE(state.is_founder, FALSE) = FALSE AND COALESCE(state.has_active, FALSE) = FALSE
          RETURNING *
        ), created_credits AS (
          INSERT INTO athlete_credit_movements (
            id, workspace_id, athlete_id, membership_id, credit_type, quantity,
            source, reference_id, expires_at, created_at
          )
          SELECT credit.id, membership.workspace_id, membership.athlete_id, membership.id,
                 credit.credit_type, credit.quantity, 'plan_grant', ${referenceId},
                 membership.ends_at, ${startsAt}::timestamptz
          FROM created_membership membership
          JOIN locked ON TRUE
          CROSS JOIN LATERAL (VALUES
            (${input.productionMovementId}::uuid, 'production'::text, locked.production_credits_snapshot),
            (${input.customContentMovementId}::uuid, 'custom_content'::text, locked.custom_content_credits_snapshot)
          ) AS credit(id, credit_type, quantity)
          ON CONFLICT (workspace_id, athlete_id, membership_id, credit_type, reference_id)
            WHERE source = 'plan_grant' AND membership_id IS NOT NULL AND reference_id IS NOT NULL
            DO NOTHING
          RETURNING id
        ), paid AS (
          UPDATE athlete_membership_orders orders
          SET status = 'paid', membership_id = membership.id, paid_at = ${input.now}::timestamptz,
              confirmed_by_clerk_user_id = ${input.adminClerkUserId}, updated_at = ${input.now}::timestamptz
          FROM created_membership membership
          WHERE orders.id = ${input.orderId}::uuid
            AND (SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END FROM created_credits) = 1
          RETURNING orders.*
        ), resolved AS (
          SELECT 'paid'::text AS outcome, paid.*, paid.membership_id AS resolved_membership_id FROM paid
          UNION ALL
          SELECT 'already_paid', locked.*, locked.membership_id FROM locked
          WHERE locked.status = 'paid' AND NOT EXISTS (SELECT 1 FROM paid)
          UNION ALL
          SELECT 'expired', locked.*, NULL::text FROM locked
          WHERE (locked.status = 'expired' OR EXISTS (SELECT 1 FROM expired)) AND NOT EXISTS (SELECT 1 FROM paid)
          UNION ALL
          SELECT CASE
            WHEN COALESCE(state.is_founder, FALSE) THEN 'founder'
            WHEN COALESCE(state.has_active, FALSE) THEN 'membership_conflict'
            ELSE 'not_pending'
          END, locked.*, NULL::text
          FROM locked, membership_state state
          WHERE locked.status NOT IN ('paid', 'expired') AND NOT EXISTS (SELECT 1 FROM paid)
            AND NOT EXISTS (SELECT 1 FROM expired)
        )
        SELECT outcome, row_to_json(resolved.*) AS order, resolved_membership_id AS "membershipId"
        FROM resolved
        UNION ALL SELECT 'not_found', NULL, NULL WHERE NOT EXISTS (SELECT 1 FROM locked)
        LIMIT 1
      `;
      const results = await sql.transaction([query], { isolationLevel: "Serializable" });
      const row = (results[0] as Array<{ outcome: ConfirmResult["outcome"]; order: (OrderRow & { outcome?: string; resolved_membership_id?: string }) | null; membershipId: string | null }>)[0];
      if (row.order) {
        delete row.order.outcome;
        delete row.order.resolved_membership_id;
      }
      return { outcome: row.outcome, order: row.order, membershipId: row.membershipId };
    },
  };
};

const defaultDependencies = (): AthleteMembershipOrderDependencies => ({
  repository: createRepository(),
  getAccessProfile: getCurrentUserAccessProfile,
  getAthleteNames: async () => new Map((await getAthletesFromGoogleSheets()).map((athlete) => [athlete.key, athlete.name])),
  createId: randomUUID,
  createReference: generateAthleteMembershipOrderReference,
  now: () => new Date(),
  getTwintPaymentUrl: resolveTwintBusinessPaymentUrl,
});

export const createAthleteMembershipOrder = async (
  request: Request,
  input: { planCode: string },
  dependencies = defaultDependencies(),
): Promise<AthleteMembershipOrderView> => {
  const identity = await requireAthlete(request, dependencies.getAccessProfile);
  const planCode = parsePlanCode(input.planCode);
  const paymentUrl = dependencies.getTwintPaymentUrl();
  for (let attempt = 0; attempt < REFERENCE_RETRY_LIMIT; attempt += 1) {
    try {
      const result = await dependencies.repository.createAtomic({
        ...identity,
        id: dependencies.createId(),
        planCode,
        publicReference: dependencies.createReference(),
        now: dependencies.now().toISOString(),
      });
      if (result.outcome === "founder") throw new AthleteMembershipOrderError("conflict", "Les adhésions Founder sont exclues de ce parcours.");
      if (result.outcome === "membership_conflict") throw new AthleteMembershipOrderError("conflict", "Une adhésion effective ou active existe déjà.");
      if (result.outcome === "plan_conflict") throw new AthleteMembershipOrderError("conflict", "Annulez la commande pending avant de changer d’offre.");
      if (result.outcome === "invalid_plan" || !result.order) throw new AthleteMembershipOrderError("validation", "Cette offre Athlète n’est pas disponible.");
      return { ...mapOrder(result.order), twintPaymentUrl: paymentUrl };
    } catch (error) {
      if (isUniqueReferenceCollision(error) && attempt + 1 < REFERENCE_RETRY_LIMIT) continue;
      throw error;
    }
  }
  throw new AthleteMembershipOrderError("conflict", "Impossible de générer une référence de commande unique.");
};

export const getCurrentAthleteMembershipOrder = async (
  request: Request,
  dependencies = defaultDependencies(),
): Promise<AthleteMembershipOrderView | null> => {
  const identity = await requireAthlete(request, dependencies.getAccessProfile);
  const row = await dependencies.repository.readCurrentAtomic(identity.workspaceId, identity.athleteId, dependencies.now().toISOString());
  const paymentUrl = dependencies.getTwintPaymentUrl();
  return row ? { ...mapOrder(row), twintPaymentUrl: paymentUrl } : null;
};

export const cancelAthleteMembershipOrder = async (
  request: Request,
  orderId: string,
  dependencies = defaultDependencies(),
): Promise<AthleteMembershipOrder> => {
  const identity = await requireAthlete(request, dependencies.getAccessProfile);
  const id = normalize(orderId);
  if (!id) throw new AthleteMembershipOrderError("validation", "L’identifiant de commande est requis.");
  const row = await dependencies.repository.cancelAtomic(id, identity.workspaceId, identity.athleteId, dependencies.now().toISOString());
  if (!row) throw new AthleteMembershipOrderError("conflict", "Seule une commande pending non expirée peut être annulée.");
  return mapOrder(row);
};

export const listAdminAthleteMembershipOrders = async (
  request: Request,
  filters: AdminAthleteMembershipOrderFilters = {},
  dependencies = defaultDependencies(),
): Promise<AdminAthleteMembershipOrder[]> => {
  const identity = await requireAdmin(request, dependencies.getAccessProfile);
  const [rows, names] = await Promise.all([
    dependencies.repository.list(identity.workspaceId, parseFilters(filters)),
    dependencies.getAthleteNames(),
  ]);
  return rows.map((row) => ({ ...mapOrder(row), athleteName: names.get(row.athlete_id)?.trim() || row.athlete_id }));
};

export const confirmAthleteMembershipOrder = async (
  request: Request,
  orderId: string,
  dependencies = defaultDependencies(),
): Promise<ConfirmedAthleteMembershipOrder> => {
  const identity = await requireAdmin(request, dependencies.getAccessProfile);
  const id = normalize(orderId);
  if (!id) throw new AthleteMembershipOrderError("validation", "L’identifiant de commande est requis.");
  const result = await dependencies.repository.confirmAtomic({
    orderId: id,
    workspaceId: identity.workspaceId,
    adminClerkUserId: identity.clerkUserId,
    membershipId: dependencies.createId(),
    productionMovementId: dependencies.createId(),
    customContentMovementId: dependencies.createId(),
    now: dependencies.now().toISOString(),
  });
  if (result.outcome === "not_found" || !result.order) throw new AthleteMembershipOrderError("not_found", "Commande introuvable.");
  if (result.outcome === "expired") throw new AthleteMembershipOrderError("expired", "Cette commande a expiré.");
  if (result.outcome === "founder") throw new AthleteMembershipOrderError("conflict", "Les adhésions Founder sont exclues de ce parcours.");
  if (result.outcome === "membership_conflict") throw new AthleteMembershipOrderError("conflict", "Une adhésion effective ou active existe déjà.");
  if (result.outcome === "not_pending" || !result.membershipId) throw new AthleteMembershipOrderError("conflict", "Cette commande ne peut plus être confirmée.");
  return { order: mapOrder(result.order), membershipId: result.membershipId, alreadyPaid: result.outcome === "already_paid" };
};
