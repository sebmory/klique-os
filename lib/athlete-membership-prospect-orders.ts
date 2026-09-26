import { randomBytes, randomUUID } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { resolveTwintBusinessPaymentUrl } from "@/lib/athlete-membership-orders";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import type { AthleteMembership } from "@/lib/athlete-memberships";
import type { Athlete } from "@/types/athlete";

export type AthleteMembershipProspectOrderStatus =
  | "pending_payment"
  | "paid_awaiting_form"
  | "activated"
  | "cancelled"
  | "expired";

export type AthleteMembershipProspectPlanCode = "essential" | "impact" | "signature";

export const ATHLETE_MEMBERSHIP_PROSPECT_TERMS_VERSION = "2026-09-23";
export const PAID_AWAITING_FORM_MESSAGE =
  "Paiement vérifié. KLIQUE vous enverra manuellement le formulaire d’adhésion.";

export type AthleteMembershipProspectOrder = {
  id: string;
  workspaceId: string;
  publicReference: string;
  verifiedEmail: string;
  fullName: string;
  phone: string | null;
  planCode: AthleteMembershipProspectPlanCode;
  planName: string;
  annualPriceChf: number;
  durationMonths: number;
  productionCredits: number;
  customContentCredits: number;
  videoAllowed: boolean;
  paymentMethod: "twint_business";
  status: AthleteMembershipProspectOrderStatus;
  athleteId: string | null;
  membershipId: string | null;
  termsVersion: string;
  termsAcceptedAt: string;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AthleteMembershipProspectOrderView = AthleteMembershipProspectOrder & {
  twintPaymentUrl: string;
  statusMessage: string | null;
};

export type AthleteMembershipProspectOrderCreation = AthleteMembershipProspectOrderView & {
  creationOutcome: "created" | "reused";
};

export type AdminAthleteMembershipProspectOrder = AthleteMembershipProspectOrder;

export type AdminAthleteMembershipProspectOrderFilters = {
  status?: AthleteMembershipProspectOrderStatus;
  email?: string;
  planCode?: AthleteMembershipProspectPlanCode;
};

export type ConfirmedAthleteMembershipProspectOrder = {
  order: AdminAthleteMembershipProspectOrder;
  alreadyConfirmed: boolean;
};

export type ActivatedAthleteMembershipProspectOrder = {
  order: AdminAthleteMembershipProspectOrder;
  membership: AthleteMembership;
  alreadyActivated: boolean;
};

export type ProspectClerkIdentity = {
  clerkUserId: string;
  verifiedEmail: string | null;
};

type ActiveAccess = {
  role: "admin" | "athlete" | "partner_expert" | "media";
  workspaceId: string;
};

type ProspectOrderRow = {
  id: string;
  public_reference: string;
  workspace_id: string;
  clerk_user_id: string;
  verified_email: string;
  full_name: string;
  phone: string | null;
  plan_code: AthleteMembershipProspectPlanCode;
  plan_name_snapshot: string;
  annual_price_chf_snapshot: string | number;
  duration_months_snapshot: number;
  production_credits_snapshot: number;
  custom_content_credits_snapshot: number;
  video_allowed_snapshot: boolean;
  payment_method: "twint_business";
  status: AthleteMembershipProspectOrderStatus;
  athlete_id: string | null;
  membership_id: string | null;
  created_by_clerk_user_id: string;
  confirmed_by_clerk_user_id: string | null;
  activated_by_clerk_user_id: string | null;
  terms_version: string;
  terms_accepted_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
  expires_at: string | Date;
  paid_at: string | Date | null;
  cancelled_at: string | Date | null;
  activated_at: string | Date | null;
};

type CreateResult = {
  outcome: "created" | "reused" | "plan_conflict" | "invalid_plan";
  order: ProspectOrderRow | null;
};

type ConfirmResult = {
  outcome: "confirmed" | "already_confirmed" | "expired" | "not_pending" | "not_found";
  order: ProspectOrderRow | null;
};

type MembershipRow = {
  id: string;
  workspace_id: string;
  athlete_id: string;
  membership_kind: "subscription";
  plan_code: AthleteMembershipProspectPlanCode;
  status: "active";
  starts_at: string | Date;
  ends_at: string | Date;
  auto_renew: boolean;
  payment_installments: number;
  source: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type ActivateResult = {
  outcome:
    | "activated"
    | "already_activated"
    | "athlete_mismatch"
    | "email_mismatch"
    | "membership_conflict"
    | "access_conflict"
    | "not_paid_awaiting_form"
    | "activation_failed"
    | "not_found";
  order: ProspectOrderRow | null;
  membership: MembershipRow | null;
};

export type AthleteMembershipProspectOrderRepository = {
  findActiveAccess(clerkUserId: string): Promise<ActiveAccess | null>;
  createAtomic(input: {
    id: string;
    publicReference: string;
    workspaceId: string;
    clerkUserId: string;
    verifiedEmail: string;
    fullName: string;
    phone: string | null;
    planCode: AthleteMembershipProspectPlanCode;
    termsVersion: string;
    termsAcceptedAt: string;
    now: string;
  }): Promise<CreateResult>;
  readCurrentAtomic(workspaceId: string, clerkUserId: string, now: string): Promise<ProspectOrderRow | null>;
  cancelAtomic(id: string, workspaceId: string, clerkUserId: string, now: string): Promise<ProspectOrderRow | null>;
  list(workspaceId: string, filters: AdminAthleteMembershipProspectOrderFilters): Promise<ProspectOrderRow[]>;
  confirmAtomic(input: {
    orderId: string;
    workspaceId: string;
    adminClerkUserId: string;
    now: string;
  }): Promise<ConfirmResult>;
  findById(workspaceId: string, orderId: string): Promise<ProspectOrderRow | null>;
  activateAtomic(input: {
    orderId: string;
    athleteId: string;
    athleteEmail: string;
    workspaceId: string;
    adminClerkUserId: string;
    membershipId: string;
    productionMovementId: string;
    customContentMovementId: string;
    now: string;
  }): Promise<ActivateResult>;
};

export type AthleteMembershipProspectOrderDependencies = {
  repository: AthleteMembershipProspectOrderRepository;
  getClerkIdentity: (request: Request) => Promise<ProspectClerkIdentity | null>;
  getPublicWorkspaceId: () => string;
  createId: () => string;
  createReference: () => string;
  now: () => Date;
  getTwintPaymentUrl: () => string;
  getAthletes: () => Promise<Athlete[]>;
  termsVersion: string;
};

export class AthleteMembershipProspectOrderError extends Error {
  constructor(
    public readonly code: "unauthorized" | "forbidden" | "validation" | "conflict" | "not_found" | "configuration" | "expired",
    message: string,
  ) {
    super(message);
    this.name = "AthleteMembershipProspectOrderError";
  }
}

const allowedPlanCodes = new Set<AthleteMembershipProspectPlanCode>(["essential", "impact", "signature"]);
const allowedStatuses = new Set<AthleteMembershipProspectOrderStatus>([
  "pending_payment",
  "paid_awaiting_form",
  "activated",
  "cancelled",
  "expired",
]);
const clerkAuthorizedParties = ["http://localhost:3000", "https://klique-os.vercel.app", "https://app.klique.ch"];
const referenceAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const REFERENCE_RETRY_LIMIT = 4;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeEmail = (value: unknown): string => normalize(value).toLowerCase();
const iso = (value: string | Date): string => new Date(value).toISOString();

const mapMembership = (row: MembershipRow): AthleteMembership => ({
  id: row.id,
  workspaceId: row.workspace_id,
  athleteId: row.athlete_id,
  membershipKind: row.membership_kind,
  planCode: row.plan_code,
  status: row.status,
  startsAt: iso(row.starts_at),
  endsAt: iso(row.ends_at),
  autoRenew: row.auto_renew,
  paymentInstallments: row.payment_installments,
  source: row.source,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const mapOrder = (row: ProspectOrderRow): AthleteMembershipProspectOrder => ({
  id: row.id,
  workspaceId: row.workspace_id,
  publicReference: row.public_reference,
  verifiedEmail: row.verified_email,
  fullName: row.full_name,
  phone: row.phone,
  planCode: row.plan_code,
  planName: row.plan_name_snapshot,
  annualPriceChf: Number(row.annual_price_chf_snapshot),
  durationMonths: Number(row.duration_months_snapshot),
  productionCredits: Number(row.production_credits_snapshot),
  customContentCredits: Number(row.custom_content_credits_snapshot),
  videoAllowed: row.video_allowed_snapshot,
  paymentMethod: row.payment_method,
  status: row.status,
  athleteId: row.athlete_id,
  membershipId: row.membership_id,
  termsVersion: row.terms_version,
  termsAcceptedAt: iso(row.terms_accepted_at),
  expiresAt: iso(row.expires_at),
  paidAt: row.paid_at ? iso(row.paid_at) : null,
  cancelledAt: row.cancelled_at ? iso(row.cancelled_at) : null,
  activatedAt: row.activated_at ? iso(row.activated_at) : null,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const withPaymentDetails = (
  row: ProspectOrderRow,
  getTwintPaymentUrl: () => string,
): AthleteMembershipProspectOrderView => ({
  ...mapOrder(row),
  twintPaymentUrl: getTwintPaymentUrl(),
  statusMessage: row.status === "paid_awaiting_form" ? PAID_AWAITING_FORM_MESSAGE : null,
});

export const generateAthleteMembershipProspectOrderReference = (): string => {
  const bytes = randomBytes(12);
  let suffix = "";
  for (const byte of bytes) suffix += referenceAlphabet[byte % referenceAlphabet.length];
  return `KQ-${suffix}`;
};

const getVerifiedClerkIdentity = async (request: Request): Promise<ProspectClerkIdentity | null> => {
  const client = await clerkClient();
  const authResult = await client.authenticateRequest(request, { authorizedParties: clerkAuthorizedParties });
  if (!authResult.isAuthenticated) return null;

  const userId = authResult.toAuth()?.userId;
  if (!userId) return null;
  const user = await client.users.getUser(userId);
  const verifiedAddresses = (user.emailAddresses ?? []).filter(
    (entry) => entry.verification?.status === "verified",
  );
  const preferred = verifiedAddresses.find((entry) => entry.id === user.primaryEmailAddressId) ?? verifiedAddresses[0];
  return {
    clerkUserId: normalize(user.id),
    verifiedEmail: preferred ? normalizeEmail(preferred.emailAddress) : null,
  };
};

const parsePlanCode = (value: unknown): AthleteMembershipProspectPlanCode => {
  const planCode = normalize(value) as AthleteMembershipProspectPlanCode;
  if (!allowedPlanCodes.has(planCode)) {
    throw new AthleteMembershipProspectOrderError("validation", "Cette offre Athlète n’est pas disponible.");
  }
  return planCode;
};

const parseCreateInput = (input: {
  planCode: string;
  fullName: string;
  phone?: string;
  termsAccepted: boolean;
}) => {
  const fullName = normalize(input.fullName);
  const phone = normalize(input.phone) || null;
  if (!fullName) throw new AthleteMembershipProspectOrderError("validation", "Le nom complet est requis.");
  if (input.termsAccepted !== true) {
    throw new AthleteMembershipProspectOrderError("validation", "L’acceptation explicite des conditions est requise.");
  }
  return { planCode: parsePlanCode(input.planCode), fullName, phone };
};

const parseFilters = (
  filters: AdminAthleteMembershipProspectOrderFilters,
): AdminAthleteMembershipProspectOrderFilters => {
  const status = filters.status;
  if (status !== undefined && !allowedStatuses.has(status)) {
    throw new AthleteMembershipProspectOrderError("validation", "Le statut de commande est invalide.");
  }
  return {
    status,
    email: normalizeEmail(filters.email) || undefined,
    planCode: filters.planCode === undefined ? undefined : parsePlanCode(filters.planCode),
  };
};

const requireClerkIdentity = async (
  request: Request,
  dependencies: AthleteMembershipProspectOrderDependencies,
) => {
  const identity = await dependencies.getClerkIdentity(request);
  const clerkUserId = normalize(identity?.clerkUserId);
  if (!clerkUserId) {
    throw new AthleteMembershipProspectOrderError("unauthorized", "Un compte Clerk authentifié est requis.");
  }
  return { clerkUserId, verifiedEmail: normalizeEmail(identity?.verifiedEmail) || null };
};

const requireProspect = async (
  request: Request,
  dependencies: AthleteMembershipProspectOrderDependencies,
) => {
  const identity = await requireClerkIdentity(request, dependencies);
  const verifiedEmail = identity.verifiedEmail;
  if (!verifiedEmail) {
    throw new AthleteMembershipProspectOrderError("forbidden", "Un e-mail Clerk vérifié est requis.");
  }
  const access = await dependencies.repository.findActiveAccess(identity.clerkUserId);
  if (access?.role === "athlete") {
    throw new AthleteMembershipProspectOrderError(
      "forbidden",
      "Un accès Athlète actif existe déjà. Utilisez le parcours /athlete/pass.",
    );
  }
  if (access) {
    throw new AthleteMembershipProspectOrderError("forbidden", "Un autre rôle actif ne peut pas commander un Pass Prospect.");
  }
  const workspaceId = normalize(dependencies.getPublicWorkspaceId());
  if (!workspaceId) throw new AthleteMembershipProspectOrderError("configuration", "Le workspace KLIQUE public est indisponible.");
  return { clerkUserId: identity.clerkUserId, verifiedEmail, workspaceId };
};

const requireAdmin = async (
  request: Request,
  dependencies: AthleteMembershipProspectOrderDependencies,
) => {
  const identity = await requireClerkIdentity(request, dependencies);
  const access = await dependencies.repository.findActiveAccess(identity.clerkUserId);
  if (!access || access.role !== "admin" || !normalize(access.workspaceId)) {
    throw new AthleteMembershipProspectOrderError("forbidden", "Un accès Admin actif est requis.");
  }
  return { clerkUserId: identity.clerkUserId, workspaceId: normalize(access.workspaceId) };
};

const isReferenceCollision = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const postgres = error as { code?: string; constraint?: string };
  return postgres.code === "23505"
    && postgres.constraint === "athlete_membership_prospect_orders_public_reference_key";
};

const isConcurrentActivationConflict = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "40001" || code === "23505";
};

const parseActivationInput = (input: { orderId: string; athleteId: string }) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AthleteMembershipProspectOrderError("validation", "La demande d’activation est invalide.");
  }
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("orderId") || !keys.includes("athleteId")) {
    throw new AthleteMembershipProspectOrderError("validation", "La demande d’activation est invalide.");
  }
  const orderId = normalize(input.orderId);
  const athleteId = normalize(input.athleteId);
  if (!uuidPattern.test(orderId)) {
    throw new AthleteMembershipProspectOrderError("validation", "L’identifiant de commande est invalide.");
  }
  if (!athleteId || athleteId !== input.athleteId || athleteId.length > 200 || /[\u0000-\u001f\u007f]/.test(athleteId)) {
    throw new AthleteMembershipProspectOrderError("validation", "L’identifiant Athlete est invalide.");
  }
  return { orderId, athleteId };
};

export const createAthleteMembershipProspectOrderRepository = (): AthleteMembershipProspectOrderRepository => {
  const sql = createContentStorageClient();
  const columns = sql.unsafe(`orders.id, orders.public_reference, orders.workspace_id,
    orders.clerk_user_id, orders.verified_email, orders.full_name, orders.phone,
    orders.plan_code, orders.plan_name_snapshot, orders.annual_price_chf_snapshot,
    orders.duration_months_snapshot, orders.production_credits_snapshot,
    orders.custom_content_credits_snapshot, orders.video_allowed_snapshot,
    orders.payment_method, orders.status, orders.athlete_id, orders.membership_id,
    orders.created_by_clerk_user_id, orders.confirmed_by_clerk_user_id,
    orders.activated_by_clerk_user_id, orders.terms_version, orders.terms_accepted_at,
    orders.created_at, orders.updated_at, orders.expires_at, orders.paid_at,
    orders.cancelled_at, orders.activated_at`);

  return {
    async findActiveAccess(clerkUserId) {
      const rows = await sql`
        SELECT role, workspace_id
        FROM user_access
        WHERE clerk_user_id = ${clerkUserId} AND status = 'active'
        LIMIT 1
      `;
      const row = rows[0] as { role?: ActiveAccess["role"]; workspace_id?: string } | undefined;
      return row?.role && row.workspace_id ? { role: row.role, workspaceId: row.workspace_id } : null;
    },

    async createAtomic(input) {
      const expireQuery = sql`
        UPDATE athlete_membership_prospect_orders
        SET status = 'expired', updated_at = ${input.now}::timestamptz
        WHERE workspace_id = ${input.workspaceId} AND clerk_user_id = ${input.clerkUserId}
          AND status = 'pending_payment' AND expires_at <= ${input.now}::timestamptz
      `;
      const createQuery = sql`
        WITH candidate_plan AS (
          SELECT code, name, duration_months, annual_price_chf, production_credits,
                 custom_content_credits, video_allowed
          FROM membership_plans
          WHERE code = ${input.planCode} AND active = TRUE
            AND code IN ('essential', 'impact', 'signature')
            AND duration_months = 12 AND annual_price_chf IS NOT NULL
            AND production_credits IS NOT NULL AND custom_content_credits IS NOT NULL
            AND video_allowed IS NOT NULL
        ), current_live AS (
          SELECT orders.*
          FROM athlete_membership_prospect_orders orders
          WHERE orders.workspace_id = ${input.workspaceId}
            AND orders.clerk_user_id = ${input.clerkUserId}
            AND orders.status IN ('pending_payment', 'paid_awaiting_form')
          ORDER BY orders.created_at DESC
          LIMIT 1
        ), inserted AS (
          INSERT INTO athlete_membership_prospect_orders (
            id, public_reference, workspace_id, clerk_user_id, verified_email,
            full_name, phone, plan_code, plan_name_snapshot, annual_price_chf_snapshot,
            duration_months_snapshot, production_credits_snapshot,
            custom_content_credits_snapshot, video_allowed_snapshot, payment_method,
            status, created_by_clerk_user_id, terms_version, terms_accepted_at,
            created_at, updated_at, expires_at
          )
          SELECT ${input.id}::uuid, ${input.publicReference}, ${input.workspaceId},
                 ${input.clerkUserId}, ${input.verifiedEmail}, ${input.fullName}, ${input.phone},
                 plan.code, plan.name, plan.annual_price_chf, plan.duration_months,
                 plan.production_credits, plan.custom_content_credits, plan.video_allowed,
                 'twint_business', 'pending_payment', ${input.clerkUserId},
                 ${input.termsVersion}, ${input.termsAcceptedAt}::timestamptz,
                 ${input.now}::timestamptz, ${input.now}::timestamptz,
                 ${input.now}::timestamptz + INTERVAL '7 days'
          FROM candidate_plan plan
          WHERE NOT EXISTS (SELECT 1 FROM current_live)
          RETURNING *
        ), selected AS (
          SELECT * FROM inserted
          UNION ALL
          SELECT * FROM current_live WHERE NOT EXISTS (SELECT 1 FROM inserted)
        )
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM candidate_plan) THEN 'invalid_plan'
          WHEN EXISTS (SELECT 1 FROM current_live WHERE plan_code <> ${input.planCode}) THEN 'plan_conflict'
          WHEN EXISTS (SELECT 1 FROM current_live) THEN 'reused'
          ELSE 'created'
        END AS outcome, row_to_json(selected.*) AS order
        FROM selected
        UNION ALL
        SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM candidate_plan) THEN 'invalid_plan' ELSE 'created' END, NULL
        WHERE NOT EXISTS (SELECT 1 FROM selected)
        LIMIT 1
      `;
      const results = await sql.transaction([expireQuery, createQuery], { isolationLevel: "Serializable" });
      return (results[1] as CreateResult[])[0];
    },

    async readCurrentAtomic(workspaceId, clerkUserId, now) {
      const expireQuery = sql`
        UPDATE athlete_membership_prospect_orders
        SET status = 'expired', updated_at = ${now}::timestamptz
        WHERE workspace_id = ${workspaceId} AND clerk_user_id = ${clerkUserId}
          AND status = 'pending_payment' AND expires_at <= ${now}::timestamptz
      `;
      const readQuery = sql`
        SELECT ${columns}
        FROM athlete_membership_prospect_orders orders
        WHERE orders.workspace_id = ${workspaceId} AND orders.clerk_user_id = ${clerkUserId}
        ORDER BY CASE orders.status
          WHEN 'pending_payment' THEN 0 WHEN 'paid_awaiting_form' THEN 1 ELSE 2 END,
          orders.created_at DESC
        LIMIT 1
      `;
      const results = await sql.transaction([expireQuery, readQuery], { isolationLevel: "Serializable" });
      return (results[1] as ProspectOrderRow[])[0] ?? null;
    },

    async cancelAtomic(id, workspaceId, clerkUserId, now) {
      const expireQuery = sql`
        UPDATE athlete_membership_prospect_orders
        SET status = 'expired', updated_at = ${now}::timestamptz
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId} AND clerk_user_id = ${clerkUserId}
          AND status = 'pending_payment' AND expires_at <= ${now}::timestamptz
      `;
      const cancelQuery = sql`
        UPDATE athlete_membership_prospect_orders orders
        SET status = 'cancelled', cancelled_at = ${now}::timestamptz,
            updated_at = ${now}::timestamptz
        WHERE orders.id = ${id}::uuid AND orders.workspace_id = ${workspaceId}
          AND orders.clerk_user_id = ${clerkUserId}
          AND orders.status = 'pending_payment' AND orders.expires_at > ${now}::timestamptz
        RETURNING ${columns}
      `;
      const results = await sql.transaction([expireQuery, cancelQuery], { isolationLevel: "Serializable" });
      return (results[1] as ProspectOrderRow[])[0] ?? null;
    },

    async list(workspaceId, filters) {
      const rows = await sql`
        SELECT ${columns}
        FROM athlete_membership_prospect_orders orders
        WHERE orders.workspace_id = ${workspaceId}
          AND (${filters.status ?? null}::text IS NULL OR orders.status = ${filters.status ?? null})
          AND (${filters.email ?? null}::text IS NULL OR orders.verified_email = ${filters.email ?? null})
          AND (${filters.planCode ?? null}::text IS NULL OR orders.plan_code = ${filters.planCode ?? null})
        ORDER BY orders.created_at DESC
      `;
      return rows as ProspectOrderRow[];
    },

    async findById(workspaceId, orderId) {
      const rows = await sql`
        SELECT ${columns}
        FROM athlete_membership_prospect_orders orders
        WHERE orders.id = ${orderId}::uuid AND orders.workspace_id = ${workspaceId}
        LIMIT 1
      `;
      return (rows as ProspectOrderRow[])[0] ?? null;
    },

    async confirmAtomic(input) {
      const query = sql`
        WITH locked AS MATERIALIZED (
          SELECT *
          FROM athlete_membership_prospect_orders
          WHERE id = ${input.orderId}::uuid AND workspace_id = ${input.workspaceId}
          FOR UPDATE
        ), expired AS (
          UPDATE athlete_membership_prospect_orders orders
          SET status = 'expired', updated_at = ${input.now}::timestamptz
          FROM locked
          WHERE orders.id = locked.id AND locked.status = 'pending_payment'
            AND locked.expires_at <= ${input.now}::timestamptz
          RETURNING orders.id
        ), confirmed AS (
          UPDATE athlete_membership_prospect_orders orders
          SET status = 'paid_awaiting_form', paid_at = ${input.now}::timestamptz,
              confirmed_by_clerk_user_id = ${input.adminClerkUserId},
              updated_at = ${input.now}::timestamptz
          FROM locked
          WHERE orders.id = locked.id AND locked.status = 'pending_payment'
            AND locked.expires_at > ${input.now}::timestamptz
          RETURNING orders.*
        ), resolved AS (
          SELECT 'confirmed'::text AS outcome, confirmed.* FROM confirmed
          UNION ALL
          SELECT 'already_confirmed', locked.* FROM locked
          WHERE locked.status = 'paid_awaiting_form' AND NOT EXISTS (SELECT 1 FROM confirmed)
          UNION ALL
          SELECT 'expired', locked.* FROM locked
          WHERE (locked.status = 'expired' OR EXISTS (SELECT 1 FROM expired))
            AND NOT EXISTS (SELECT 1 FROM confirmed)
          UNION ALL
          SELECT 'not_pending', locked.* FROM locked
          WHERE locked.status NOT IN ('pending_payment', 'paid_awaiting_form', 'expired')
            AND NOT EXISTS (SELECT 1 FROM confirmed)
        )
        SELECT outcome, row_to_json(resolved.*) AS order
        FROM resolved
        UNION ALL SELECT 'not_found', NULL WHERE NOT EXISTS (SELECT 1 FROM locked)
        LIMIT 1
      `;
      const results = await sql.transaction([query], { isolationLevel: "Serializable" });
      const row = (results[0] as Array<{
        outcome: ConfirmResult["outcome"];
        order: (ProspectOrderRow & { outcome?: string }) | null;
      }>)[0];
      if (row.order) delete row.order.outcome;
      return { outcome: row.outcome, order: row.order };
    },

    async activateAtomic(input) {
      const referenceId = `prospect-order:${input.orderId}`;
      const query = sql`
        WITH locked AS MATERIALIZED (
          SELECT *
          FROM athlete_membership_prospect_orders
          WHERE id = ${input.orderId}::uuid AND workspace_id = ${input.workspaceId}
          FOR UPDATE
        ), current_membership AS MATERIALIZED (
          SELECT membership.*
          FROM athlete_memberships membership
          JOIN locked
            ON locked.membership_id = membership.id
           AND locked.workspace_id = membership.workspace_id
           AND locked.athlete_id = membership.athlete_id
        ), membership_state AS (
          SELECT EXISTS (
            SELECT 1
            FROM athlete_memberships membership
            WHERE membership.workspace_id = ${input.workspaceId}
              AND membership.athlete_id = ${input.athleteId}
              AND membership.status = 'active'
          ) AS has_active
        ), access_state AS MATERIALIZED (
          SELECT access.*
          FROM user_access access
          JOIN locked ON locked.clerk_user_id = access.clerk_user_id
          FOR UPDATE OF access
        ), other_active_access AS (
          SELECT 1
          FROM user_access access
          JOIN locked ON TRUE
          WHERE access.workspace_id = locked.workspace_id
            AND access.athlete_id = ${input.athleteId}
            AND access.role = 'athlete'
            AND access.status = 'active'
            AND access.clerk_user_id <> locked.clerk_user_id
          LIMIT 1
        ), created_membership AS (
          INSERT INTO athlete_memberships (
            id, workspace_id, athlete_id, membership_kind, plan_code, status, starts_at, ends_at,
            auto_renew, payment_installments, source, created_at, updated_at
          )
          SELECT ${input.membershipId}, locked.workspace_id, ${input.athleteId}, 'subscription',
                 locked.plan_code, 'active', ${input.now}::timestamptz,
                 ${input.now}::timestamptz + make_interval(months => locked.duration_months_snapshot),
                 FALSE, 1, 'twint_prospect_order', ${input.now}::timestamptz, ${input.now}::timestamptz
          FROM locked, membership_state
          WHERE locked.status = 'paid_awaiting_form'
            AND lower(btrim(locked.verified_email)) = ${input.athleteEmail}
            AND membership_state.has_active = FALSE
            AND NOT EXISTS (SELECT 1 FROM other_active_access)
            AND (
              NOT EXISTS (SELECT 1 FROM access_state)
              OR EXISTS (
                SELECT 1 FROM access_state access
                WHERE access.role = 'athlete'
                  AND access.workspace_id = locked.workspace_id
                  AND access.athlete_id = ${input.athleteId}
              )
            )
          RETURNING *
        ), credit_expectation AS (
          SELECT
            (CASE WHEN locked.production_credits_snapshot > 0 THEN 1 ELSE 0 END
             + CASE WHEN locked.custom_content_credits_snapshot > 0 THEN 1 ELSE 0 END) AS expected_count
          FROM locked
        ), created_credits AS (
          INSERT INTO athlete_credit_movements (
            id, workspace_id, athlete_id, membership_id, credit_type, quantity,
            source, reference_id, expires_at, created_at
          )
          SELECT credit.id, membership.workspace_id, membership.athlete_id, membership.id,
                 credit.credit_type, credit.quantity, 'plan_grant', ${referenceId},
                 membership.ends_at, ${input.now}::timestamptz
          FROM created_membership membership
          JOIN locked ON TRUE
          CROSS JOIN LATERAL (VALUES
            (${input.productionMovementId}::uuid, 'production'::text, locked.production_credits_snapshot),
            (${input.customContentMovementId}::uuid, 'custom_content'::text, locked.custom_content_credits_snapshot)
          ) AS credit(id, credit_type, quantity)
          WHERE credit.quantity > 0
          ON CONFLICT (workspace_id, athlete_id, membership_id, credit_type, reference_id)
            WHERE source = 'plan_grant' AND membership_id IS NOT NULL AND reference_id IS NOT NULL
            DO NOTHING
          RETURNING id
        ), credit_check AS (
          SELECT 1 / CASE WHEN COUNT(created_credits.id) = expectation.expected_count THEN 1 ELSE 0 END AS complete
          FROM created_membership, credit_expectation expectation
          LEFT JOIN created_credits ON TRUE
          GROUP BY expectation.expected_count
        ), upserted_access AS (
          INSERT INTO user_access (
            clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id,
            status, created_at, updated_at
          )
          SELECT locked.clerk_user_id, ${input.athleteEmail}, 'athlete', locked.workspace_id,
                 ${input.athleteId}, NULL, NULL, 'active', ${input.now}::timestamptz,
                 ${input.now}::timestamptz
          FROM locked, created_membership, credit_check
          WHERE credit_check.complete = 1
          ON CONFLICT (clerk_user_id) DO UPDATE SET
            email = EXCLUDED.email,
            status = 'active',
            updated_at = EXCLUDED.updated_at
          WHERE user_access.role = 'athlete'
            AND user_access.workspace_id = EXCLUDED.workspace_id
            AND user_access.athlete_id = EXCLUDED.athlete_id
          RETURNING clerk_user_id
        ), activated AS (
          UPDATE athlete_membership_prospect_orders orders
          SET status = 'activated', athlete_id = ${input.athleteId},
              membership_id = membership.id, activated_at = ${input.now}::timestamptz,
              activated_by_clerk_user_id = ${input.adminClerkUserId},
              updated_at = ${input.now}::timestamptz
          FROM created_membership membership, upserted_access access
          WHERE orders.id = ${input.orderId}::uuid
            AND access.clerk_user_id = orders.clerk_user_id
          RETURNING orders.*
        ), resolved AS (
          SELECT 'activated'::text AS outcome, row_to_json(activated.*) AS order,
                 row_to_json(created_membership.*) AS membership
          FROM activated, created_membership
          UNION ALL
          SELECT 'already_activated', row_to_json(locked.*), row_to_json(current_membership.*)
          FROM locked, current_membership
          WHERE locked.status = 'activated' AND locked.athlete_id = ${input.athleteId}
            AND NOT EXISTS (SELECT 1 FROM activated)
          UNION ALL
          SELECT 'athlete_mismatch', row_to_json(locked.*), NULL::json
          FROM locked
          WHERE locked.status = 'activated' AND locked.athlete_id <> ${input.athleteId}
            AND NOT EXISTS (SELECT 1 FROM activated)
          UNION ALL
          SELECT 'email_mismatch', row_to_json(locked.*), NULL::json
          FROM locked
          WHERE locked.status = 'paid_awaiting_form'
            AND lower(btrim(locked.verified_email)) <> ${input.athleteEmail}
            AND NOT EXISTS (SELECT 1 FROM activated)
          UNION ALL
          SELECT 'membership_conflict', row_to_json(locked.*), NULL::json
          FROM locked, membership_state
          WHERE locked.status = 'paid_awaiting_form'
            AND lower(btrim(locked.verified_email)) = ${input.athleteEmail}
            AND membership_state.has_active
            AND NOT EXISTS (SELECT 1 FROM activated)
          UNION ALL
          SELECT 'access_conflict', row_to_json(locked.*), NULL::json
          FROM locked
          WHERE locked.status = 'paid_awaiting_form'
            AND lower(btrim(locked.verified_email)) = ${input.athleteEmail}
            AND (
              EXISTS (SELECT 1 FROM other_active_access)
              OR EXISTS (
                SELECT 1 FROM access_state access
                WHERE access.role <> 'athlete'
                   OR access.workspace_id <> locked.workspace_id
                   OR access.athlete_id IS DISTINCT FROM ${input.athleteId}
              )
            )
            AND NOT EXISTS (SELECT 1 FROM activated)
            AND NOT EXISTS (SELECT 1 FROM membership_state WHERE has_active)
          UNION ALL
          SELECT 'not_paid_awaiting_form', row_to_json(locked.*), NULL::json
          FROM locked
          WHERE locked.status NOT IN ('paid_awaiting_form', 'activated')
            AND NOT EXISTS (SELECT 1 FROM activated)
          UNION ALL
          SELECT 'activation_failed', row_to_json(locked.*), NULL::json
          FROM locked
          WHERE locked.status = 'paid_awaiting_form'
            AND NOT EXISTS (SELECT 1 FROM activated)
            AND lower(btrim(locked.verified_email)) = ${input.athleteEmail}
            AND NOT EXISTS (SELECT 1 FROM membership_state WHERE has_active)
            AND NOT EXISTS (SELECT 1 FROM other_active_access)
            AND NOT EXISTS (
              SELECT 1 FROM access_state access
              WHERE access.role <> 'athlete'
                 OR access.workspace_id <> locked.workspace_id
                 OR access.athlete_id IS DISTINCT FROM ${input.athleteId}
            )
        )
        SELECT outcome, resolved.order, resolved.membership
        FROM resolved
        UNION ALL SELECT 'not_found', NULL::json, NULL::json WHERE NOT EXISTS (SELECT 1 FROM locked)
        LIMIT 1
      `;
      const results = await sql.transaction([query], { isolationLevel: "Serializable" });
      return (results[0] as ActivateResult[])[0];
    },
  };
};

const defaultDependencies = (): AthleteMembershipProspectOrderDependencies => ({
  repository: createAthleteMembershipProspectOrderRepository(),
  getClerkIdentity: getVerifiedClerkIdentity,
  getPublicWorkspaceId: getDefaultWorkspaceId,
  createId: randomUUID,
  createReference: generateAthleteMembershipProspectOrderReference,
  now: () => new Date(),
  getTwintPaymentUrl: resolveTwintBusinessPaymentUrl,
  getAthletes: getAthletesFromGoogleSheets,
  termsVersion: ATHLETE_MEMBERSHIP_PROSPECT_TERMS_VERSION,
});

export const createAthleteMembershipProspectOrder = async (
  request: Request,
  input: { planCode: string; fullName: string; phone?: string; termsAccepted: boolean },
  dependencies = defaultDependencies(),
): Promise<AthleteMembershipProspectOrderCreation> => {
  const identity = await requireProspect(request, dependencies);
  const parsed = parseCreateInput(input);
  const termsVersion = normalize(dependencies.termsVersion);
  if (!termsVersion) throw new AthleteMembershipProspectOrderError("configuration", "La version des conditions est indisponible.");
  const twintPaymentUrl = dependencies.getTwintPaymentUrl();
  const acceptedAt = dependencies.now().toISOString();

  for (let attempt = 0; attempt < REFERENCE_RETRY_LIMIT; attempt += 1) {
    try {
      const result = await dependencies.repository.createAtomic({
        ...identity,
        ...parsed,
        id: dependencies.createId(),
        publicReference: dependencies.createReference(),
        termsVersion,
        termsAcceptedAt: acceptedAt,
        now: acceptedAt,
      });
      if (result.outcome === "plan_conflict") {
        throw new AthleteMembershipProspectOrderError(
          "conflict",
          "Annulez la commande en cours avant de changer d’offre.",
        );
      }
      if (result.outcome === "invalid_plan" || !result.order) {
        throw new AthleteMembershipProspectOrderError("validation", "Cette offre Athlète n’est pas disponible.");
      }
      return {
        ...withPaymentDetails(result.order, () => twintPaymentUrl),
        creationOutcome: result.outcome,
      };
    } catch (error) {
      if (isReferenceCollision(error) && attempt + 1 < REFERENCE_RETRY_LIMIT) continue;
      throw error;
    }
  }
  throw new AthleteMembershipProspectOrderError("conflict", "Impossible de générer une référence de commande unique.");
};

export const getCurrentAthleteMembershipProspectOrder = async (
  request: Request,
  dependencies = defaultDependencies(),
): Promise<AthleteMembershipProspectOrderView | null> => {
  const identity = await requireProspect(request, dependencies);
  const row = await dependencies.repository.readCurrentAtomic(
    identity.workspaceId,
    identity.clerkUserId,
    dependencies.now().toISOString(),
  );
  return row ? withPaymentDetails(row, dependencies.getTwintPaymentUrl) : null;
};

export const cancelAthleteMembershipProspectOrder = async (
  request: Request,
  orderId: string,
  dependencies = defaultDependencies(),
): Promise<AthleteMembershipProspectOrder> => {
  const identity = await requireProspect(request, dependencies);
  const id = normalize(orderId);
  if (!id) throw new AthleteMembershipProspectOrderError("validation", "L’identifiant de commande est requis.");
  const row = await dependencies.repository.cancelAtomic(
    id,
    identity.workspaceId,
    identity.clerkUserId,
    dependencies.now().toISOString(),
  );
  if (!row) {
    throw new AthleteMembershipProspectOrderError(
      "conflict",
      "Seule votre commande en attente de paiement et non expirée peut être annulée.",
    );
  }
  return mapOrder(row);
};

export const listAdminAthleteMembershipProspectOrders = async (
  request: Request,
  filters: AdminAthleteMembershipProspectOrderFilters = {},
  dependencies = defaultDependencies(),
): Promise<AdminAthleteMembershipProspectOrder[]> => {
  const admin = await requireAdmin(request, dependencies);
  const rows = await dependencies.repository.list(admin.workspaceId, parseFilters(filters));
  return rows.map(mapOrder);
};

export const confirmAthleteMembershipProspectOrderPayment = async (
  request: Request,
  orderId: string,
  dependencies = defaultDependencies(),
): Promise<ConfirmedAthleteMembershipProspectOrder> => {
  const admin = await requireAdmin(request, dependencies);
  const id = normalize(orderId);
  if (!id) throw new AthleteMembershipProspectOrderError("validation", "L’identifiant de commande est requis.");
  const result = await dependencies.repository.confirmAtomic({
    orderId: id,
    workspaceId: admin.workspaceId,
    adminClerkUserId: admin.clerkUserId,
    now: dependencies.now().toISOString(),
  });
  if (result.outcome === "not_found" || !result.order) {
    throw new AthleteMembershipProspectOrderError("not_found", "Commande Prospect introuvable.");
  }
  if (result.outcome === "expired") {
    throw new AthleteMembershipProspectOrderError("expired", "Cette commande Prospect a expiré.");
  }
  if (result.outcome === "not_pending") {
    throw new AthleteMembershipProspectOrderError("conflict", "Cette commande Prospect ne peut plus être confirmée.");
  }
  return { order: mapOrder(result.order), alreadyConfirmed: result.outcome === "already_confirmed" };
};

export const activateAthleteMembershipProspectOrder = async (
  request: Request,
  input: { orderId: string; athleteId: string },
  dependencies = defaultDependencies(),
): Promise<ActivatedAthleteMembershipProspectOrder> => {
  const admin = await requireAdmin(request, dependencies);
  const parsed = parseActivationInput(input);
  const order = await dependencies.repository.findById(admin.workspaceId, parsed.orderId);
  if (!order) {
    throw new AthleteMembershipProspectOrderError("not_found", "Commande Prospect introuvable.");
  }

  const athletes = await dependencies.getAthletes();
  const athlete = athletes.find((candidate) => candidate.athleteId === parsed.athleteId && candidate.key === parsed.athleteId);
  if (!athlete) {
    throw new AthleteMembershipProspectOrderError("not_found", "Fiche Athlete canonique introuvable.");
  }
  if (typeof athlete.row !== "number" || athlete.row <= 0) {
    throw new AthleteMembershipProspectOrderError(
      "conflict",
      "Le formulaire doit être synchronisé vers une fiche Athlete canonique avant l’activation.",
    );
  }
  const athleteEmail = normalizeEmail(athlete.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(athleteEmail)) {
    throw new AthleteMembershipProspectOrderError("conflict", "La fiche Athlete sélectionnée ne possède pas d’e-mail exploitable.");
  }
  if (normalizeEmail(order.verified_email) !== athleteEmail) {
    throw new AthleteMembershipProspectOrderError(
      "conflict",
      "L’e-mail de la fiche Athlete ne correspond pas à l’e-mail Clerk vérifié de la commande.",
    );
  }

  try {
    const result = await dependencies.repository.activateAtomic({
      ...parsed,
      athleteEmail,
      workspaceId: admin.workspaceId,
      adminClerkUserId: admin.clerkUserId,
      membershipId: dependencies.createId(),
      productionMovementId: dependencies.createId(),
      customContentMovementId: dependencies.createId(),
      now: dependencies.now().toISOString(),
    });
    if (result.outcome === "not_found" || !result.order) {
      throw new AthleteMembershipProspectOrderError("not_found", "Commande Prospect introuvable.");
    }
    if (result.outcome === "athlete_mismatch") {
      throw new AthleteMembershipProspectOrderError("conflict", "Cette commande est déjà liée à un autre Athlete.");
    }
    if (result.outcome === "email_mismatch") {
      throw new AthleteMembershipProspectOrderError(
        "conflict",
        "L’e-mail de la fiche Athlete ne correspond plus à l’e-mail vérifié de la commande.",
      );
    }
    if (result.outcome === "membership_conflict") {
      throw new AthleteMembershipProspectOrderError("conflict", "Cet Athlete possède déjà une adhésion active.");
    }
    if (result.outcome === "access_conflict") {
      throw new AthleteMembershipProspectOrderError("conflict", "L’accès plateforme existant est incompatible avec cet Athlete.");
    }
    if (result.outcome === "not_paid_awaiting_form") {
      throw new AthleteMembershipProspectOrderError("conflict", "Seule une commande payée en attente de formulaire peut être activée.");
    }
    if (result.outcome === "activation_failed" || !result.membership) {
      throw new Error("L’activation transactionnelle de la commande Prospect a échoué.");
    }
    return {
      order: mapOrder(result.order),
      membership: mapMembership(result.membership),
      alreadyActivated: result.outcome === "already_activated",
    };
  } catch (error) {
    if (isConcurrentActivationConflict(error)) {
      throw new AthleteMembershipProspectOrderError(
        "conflict",
        "Une activation concurrente a modifié cette commande, cette adhésion ou cet accès. Rechargez puis réessayez.",
      );
    }
    throw error;
  }
};