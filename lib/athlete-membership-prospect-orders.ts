import { randomBytes, randomUUID } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { resolveTwintBusinessPaymentUrl } from "@/lib/athlete-membership-orders";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";

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
};

export type AthleteMembershipProspectOrderDependencies = {
  repository: AthleteMembershipProspectOrderRepository;
  getClerkIdentity: (request: Request) => Promise<ProspectClerkIdentity | null>;
  getPublicWorkspaceId: () => string;
  createId: () => string;
  createReference: () => string;
  now: () => Date;
  getTwintPaymentUrl: () => string;
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

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeEmail = (value: unknown): string => normalize(value).toLowerCase();
const iso = (value: string | Date): string => new Date(value).toISOString();

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