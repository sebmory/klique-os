import { createContentStorageClient } from "@/lib/content-storage/db";

export type AthleteCreditType = "production" | "custom_content";
export type AthleteCreditMovementSource = "plan_grant" | "admin_adjustment" | "purchase" | "usage";
export type AthleteCreditPurchaseStatus = "pending" | "paid" | "cancelled" | "refunded";
export type AthleteServiceType = "standard_photo" | "editorial_interview" | "simple_video" | "custom_content";

export type AthleteMembershipPlan = {
  code: string;
  name: string;
  active: boolean;
  durationMonths: number | null;
  annualPriceChf: number | null;
  monthlyInstallmentChf: number | null;
  productionCredits: number | null;
  customContentCredits: number | null;
  videoAllowed: boolean | null;
  metadata: Record<string, unknown>;
};

export type AthleteCreditMovement = {
  id: string;
  workspaceId: string;
  athleteId: string;
  membershipId: string | null;
  creditType: AthleteCreditType;
  quantity: number;
  source: AthleteCreditMovementSource;
  referenceId: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type AthleteCreditPurchase = {
  id: string;
  workspaceId: string;
  athleteId: string;
  productCode: string;
  quantity: number;
  amountChf: number;
  status: AthleteCreditPurchaseStatus;
  purchasedAt: string;
  expiresAt: string;
  paymentReference: string | null;
};

export type AthleteCreditBalance = Record<AthleteCreditType, number>;

export type AthleteServiceConsumptionCheck = {
  allowed: boolean;
  creditType: AthleteCreditType | null;
  creditsRequired: number;
  availableBalance: number;
  reason: "allowed" | "klique_initiated" | "video_not_allowed" | "insufficient_credits";
};

export type AnnualPlanCreditGrantResult = {
  status: "granted" | "already_granted" | "not_eligible";
  reason?: "membership_not_found" | "membership_inactive" | "trial_membership" | "missing_plan" | "invalid_plan" | "cycle_outside_membership";
  referenceId: string;
  expiresAt: string;
  movements: AthleteCreditMovement[];
};

type AnnualPlanGrantEligibility = {
  membershipStatus: string;
  membershipKind: string;
  membershipStartsAt: string;
  membershipEndsAt: string | null;
  planCode: string | null;
  planActive: boolean | null;
  durationMonths: number | null;
  productionCredits: number | null;
  customContentCredits: number | null;
};

export type AnnualPlanCreditGrantExecutor = (input: {
  workspaceId: string;
  athleteId: string;
  membershipId: string;
  referenceId: string;
  cycleStart: string;
  expiresAt: string;
  productionMovementId: string;
  customContentMovementId: string;
}) => Promise<{
  eligibility: AnnualPlanGrantEligibility | null;
  movements: AthleteCreditMovement[];
}>;

export type AnnualPlanCreditGrantExecutionInput = Parameters<AnnualPlanCreditGrantExecutor>[0];

type PlanRow = {
  code: string;
  name: string;
  active: boolean;
  duration_months: number | null;
  annual_price_chf: string | number | null;
  monthly_installment_chf: string | number | null;
  production_credits: number | null;
  custom_content_credits: number | null;
  video_allowed: boolean | null;
  metadata: Record<string, unknown>;
};

type MovementRow = {
  id: string;
  workspace_id: string;
  athlete_id: string;
  membership_id: string | null;
  credit_type: AthleteCreditType;
  quantity: number;
  source: AthleteCreditMovementSource;
  reference_id: string | null;
  expires_at: string | Date | null;
  created_at: string | Date;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const isoDate = (value: string | Date): string => new Date(value).toISOString();

const mapPlan = (row: PlanRow): AthleteMembershipPlan => ({
  code: row.code,
  name: row.name,
  active: row.active,
  durationMonths: row.duration_months,
  annualPriceChf: row.annual_price_chf === null ? null : Number(row.annual_price_chf),
  monthlyInstallmentChf: row.monthly_installment_chf === null ? null : Number(row.monthly_installment_chf),
  productionCredits: row.production_credits,
  customContentCredits: row.custom_content_credits,
  videoAllowed: row.video_allowed,
  metadata: row.metadata ?? {},
});

const mapMovement = (row: MovementRow): AthleteCreditMovement => ({
  id: row.id,
  workspaceId: row.workspace_id,
  athleteId: row.athlete_id,
  membershipId: row.membership_id,
  creditType: row.credit_type,
  quantity: Number(row.quantity),
  source: row.source,
  referenceId: row.reference_id,
  expiresAt: row.expires_at ? isoDate(row.expires_at) : null,
  createdAt: isoDate(row.created_at),
});

type ContentStorageSql = ReturnType<typeof createContentStorageClient>;

export const buildAnnualPlanCreditGrantQueries = (
  sql: ContentStorageSql,
  input: AnnualPlanCreditGrantExecutionInput,
) => [
  sql`
    SELECT
      m.status AS membership_status,
      m.membership_kind,
      m.starts_at AS membership_starts_at,
      m.ends_at AS membership_ends_at,
      m.plan_code,
      p.active AS plan_active,
      p.duration_months,
      p.production_credits,
      p.custom_content_credits
    FROM athlete_memberships m
    LEFT JOIN membership_plans p ON p.code = m.plan_code
    WHERE m.id = ${input.membershipId}
      AND m.workspace_id = ${input.workspaceId}
      AND m.athlete_id = ${input.athleteId}
    FOR UPDATE OF m
  `,
  sql`
    INSERT INTO athlete_credit_movements (
      id, workspace_id, athlete_id, membership_id, credit_type, quantity,
      source, reference_id, expires_at, created_at
    )
    SELECT grant_row.id, ${input.workspaceId}, ${input.athleteId}, ${input.membershipId},
           grant_row.credit_type, grant_row.quantity, 'plan_grant', ${input.referenceId},
           ${input.expiresAt}::timestamptz, NOW()
    FROM athlete_memberships m
    JOIN membership_plans p ON p.code = m.plan_code AND p.active = TRUE
    CROSS JOIN LATERAL (
      VALUES
        (${input.productionMovementId}::uuid, 'production'::text, p.production_credits),
        (${input.customContentMovementId}::uuid, 'custom_content'::text, p.custom_content_credits)
    ) AS grant_row(id, credit_type, quantity)
    WHERE m.id = ${input.membershipId}
      AND m.workspace_id = ${input.workspaceId}
      AND m.athlete_id = ${input.athleteId}
      AND m.status = 'active'
      AND m.membership_kind <> 'trial'
      AND p.duration_months = 12
      AND p.production_credits > 0
      AND p.custom_content_credits > 0
      AND m.starts_at <= ${input.cycleStart}::timestamptz
      AND (m.ends_at IS NULL OR m.ends_at >= ${input.expiresAt}::timestamptz)
      AND NOT EXISTS (
        SELECT 1
        FROM athlete_credit_movements existing
        WHERE existing.workspace_id = ${input.workspaceId}
          AND existing.athlete_id = ${input.athleteId}
          AND existing.membership_id = ${input.membershipId}
          AND existing.source = 'plan_grant'
          AND existing.reference_id = ${input.referenceId}
      )
    ON CONFLICT (workspace_id, athlete_id, membership_id, credit_type, reference_id)
      WHERE source = 'plan_grant' AND membership_id IS NOT NULL AND reference_id IS NOT NULL
      DO NOTHING
    RETURNING id, workspace_id, athlete_id, membership_id, credit_type, quantity,
              source, reference_id, expires_at, created_at
  `,
];

export const buildAnnualPlanCreditGrantAssertionQuery = (
  sql: ContentStorageSql,
  input: AnnualPlanCreditGrantExecutionInput,
) => sql`
  SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END AS complete_grant
  FROM athlete_credit_movements
  WHERE workspace_id = ${input.workspaceId}
    AND athlete_id = ${input.athleteId}
    AND membership_id = ${input.membershipId}
    AND source = 'plan_grant'
    AND reference_id = ${input.referenceId}
    AND credit_type IN ('production', 'custom_content')
`;

export const mapAnnualPlanCreditGrantExecution = (
  results: unknown[][],
): Awaited<ReturnType<AnnualPlanCreditGrantExecutor>> => {
  const row = (results[0] as Record<string, unknown>[])[0];
  const eligibility = row ? {
    membershipStatus: String(row.membership_status ?? ""),
    membershipKind: String(row.membership_kind ?? ""),
    membershipStartsAt: isoDate(row.membership_starts_at as string | Date),
    membershipEndsAt: row.membership_ends_at ? isoDate(row.membership_ends_at as string | Date) : null,
    planCode: row.plan_code ? String(row.plan_code) : null,
    planActive: typeof row.plan_active === "boolean" ? row.plan_active : null,
    durationMonths: row.duration_months === null || row.duration_months === undefined ? null : Number(row.duration_months),
    productionCredits: row.production_credits === null || row.production_credits === undefined ? null : Number(row.production_credits),
    customContentCredits: row.custom_content_credits === null || row.custom_content_credits === undefined ? null : Number(row.custom_content_credits),
  } : null;

  return {
    eligibility,
    movements: (results[1] as MovementRow[]).map(mapMovement),
  };
};

const executeAnnualPlanCreditGrant: AnnualPlanCreditGrantExecutor = async (input) => {
  const sql = createContentStorageClient();
  const results = await sql.transaction(buildAnnualPlanCreditGrantQueries(sql, input));
  return mapAnnualPlanCreditGrantExecution(results);
};

const addUtcMonths = (date: Date, months: number): Date => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

export const buildAnnualPlanGrantReference = (membershipId: string, cycleStart: Date): string =>
  `plan-cycle:${membershipId}:${cycleStart.toISOString()}`;

export const grantAnnualPlanCredits = async ({
  workspaceId,
  athleteId,
  membershipId,
  cycleStart,
  execute = executeAnnualPlanCreditGrant,
}: {
  workspaceId: string;
  athleteId: string;
  membershipId: string;
  cycleStart: string | Date;
  execute?: AnnualPlanCreditGrantExecutor;
}): Promise<AnnualPlanCreditGrantResult> => {
  const resolvedWorkspaceId = normalize(workspaceId);
  const resolvedAthleteId = normalize(athleteId);
  const resolvedMembershipId = normalize(membershipId);
  const parsedCycleStart = new Date(cycleStart);
  if (!resolvedWorkspaceId || !resolvedAthleteId || !resolvedMembershipId || Number.isNaN(parsedCycleStart.getTime())) {
    throw new Error("workspaceId, athleteId, membershipId et cycleStart valides sont requis.");
  }

  const expiresAt = addUtcMonths(parsedCycleStart, 12);
  const referenceId = buildAnnualPlanGrantReference(resolvedMembershipId, parsedCycleStart);
  const result = await execute({
    workspaceId: resolvedWorkspaceId,
    athleteId: resolvedAthleteId,
    membershipId: resolvedMembershipId,
    referenceId,
    cycleStart: parsedCycleStart.toISOString(),
    expiresAt: expiresAt.toISOString(),
    productionMovementId: crypto.randomUUID(),
    customContentMovementId: crypto.randomUUID(),
  });

  const baseResult = { referenceId, expiresAt: expiresAt.toISOString(), movements: result.movements };
  const eligibility = result.eligibility;
  if (!eligibility) return { ...baseResult, status: "not_eligible", reason: "membership_not_found" };
  if (eligibility.membershipStatus !== "active") return { ...baseResult, status: "not_eligible", reason: "membership_inactive" };
  if (eligibility.membershipKind === "trial") return { ...baseResult, status: "not_eligible", reason: "trial_membership" };
  if (!eligibility.planCode) return { ...baseResult, status: "not_eligible", reason: "missing_plan" };
  if (eligibility.planActive !== true || eligibility.durationMonths !== 12 || (eligibility.productionCredits ?? 0) <= 0 || (eligibility.customContentCredits ?? 0) <= 0) {
    return { ...baseResult, status: "not_eligible", reason: "invalid_plan" };
  }

  const membershipStart = new Date(eligibility.membershipStartsAt).getTime();
  const membershipEnd = eligibility.membershipEndsAt ? new Date(eligibility.membershipEndsAt).getTime() : null;
  if (membershipStart > parsedCycleStart.getTime() || (membershipEnd !== null && membershipEnd < expiresAt.getTime())) {
    return { ...baseResult, status: "not_eligible", reason: "cycle_outside_membership" };
  }

  return result.movements.length === 0
    ? { ...baseResult, status: "already_granted" }
    : { ...baseResult, status: "granted" };
};

export const listAthleteMembershipPlans = async (): Promise<AthleteMembershipPlan[]> => {
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT code, name, active, duration_months, annual_price_chf, monthly_installment_chf,
           production_credits, custom_content_credits, video_allowed, metadata
    FROM membership_plans
    ORDER BY annual_price_chf ASC NULLS LAST, code ASC
  `;
  return (rows as PlanRow[]).map(mapPlan);
};

const athleteSubscriptionPlanCodes = new Set(["essential", "impact", "signature"]);

export const listActiveAthleteMembershipPlans = async (): Promise<AthleteMembershipPlan[]> =>
  (await listAthleteMembershipPlans()).filter((plan) => plan.active && athleteSubscriptionPlanCodes.has(plan.code));

export const listAthleteCreditMovements = async (
  workspaceId: string,
  athleteId: string,
): Promise<AthleteCreditMovement[]> => {
  const resolvedWorkspaceId = normalize(workspaceId);
  const resolvedAthleteId = normalize(athleteId);
  if (!resolvedWorkspaceId || !resolvedAthleteId) throw new Error("workspaceId et athleteId sont requis.");

  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT id, workspace_id, athlete_id, membership_id, credit_type, quantity, source,
           reference_id, expires_at, created_at
    FROM athlete_credit_movements
    WHERE workspace_id = ${resolvedWorkspaceId}
      AND athlete_id = ${resolvedAthleteId}
    ORDER BY created_at DESC, id DESC
  `;
  return (rows as MovementRow[]).map(mapMovement);
};

export const calculateAthleteCreditBalance = (
  movements: AthleteCreditMovement[],
  at = new Date(),
): AthleteCreditBalance => {
  const atTimestamp = at.getTime();
  return movements.reduce<AthleteCreditBalance>((balance, movement) => {
    const expiresAt = movement.expiresAt ? new Date(movement.expiresAt).getTime() : null;
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= atTimestamp)) return balance;
    balance[movement.creditType] += movement.quantity;
    return balance;
  }, { production: 0, custom_content: 0 });
};

export const getAthleteCreditBalance = async (
  workspaceId: string,
  athleteId: string,
  at = new Date(),
): Promise<AthleteCreditBalance> => {
  const movements = await listAthleteCreditMovements(workspaceId, athleteId);
  return calculateAthleteCreditBalance(movements, at);
};

const serviceCreditRequirement: Record<AthleteServiceType, { creditType: AthleteCreditType; quantity: number }> = {
  standard_photo: { creditType: "production", quantity: 1 },
  editorial_interview: { creditType: "production", quantity: 1 },
  simple_video: { creditType: "production", quantity: 2 },
  custom_content: { creditType: "custom_content", quantity: 1 },
};

export const getAthleteServiceCreditRequirement = (
  serviceType: AthleteServiceType,
): Readonly<{ creditType: AthleteCreditType; quantity: number }> => serviceCreditRequirement[serviceType];

/**
 * Photo standard et interview éditoriale coûtent 1 crédit production.
 * Une capsule vidéo simple coûte 2 crédits production et requiert videoAllowed.
 * Les crédits de plan expirent à la fin du cycle annuel sans report; les achats expirent 12 mois après achat.
 * Une prestation initiée par KLIQUE ne consomme aucun crédit.
 */
export const canConsumeAthleteService = ({
  serviceType,
  plan,
  balance,
  initiatedByKlique = false,
}: {
  serviceType: AthleteServiceType;
  plan: AthleteMembershipPlan | null;
  balance: AthleteCreditBalance;
  initiatedByKlique?: boolean;
}): AthleteServiceConsumptionCheck => {
  if (initiatedByKlique) {
    return { allowed: true, creditType: null, creditsRequired: 0, availableBalance: 0, reason: "klique_initiated" };
  }

  const requirement = getAthleteServiceCreditRequirement(serviceType);
  const availableBalance = balance[requirement.creditType];
  if (serviceType === "simple_video" && plan?.videoAllowed !== true) {
    return {
      allowed: false,
      creditType: requirement.creditType,
      creditsRequired: requirement.quantity,
      availableBalance,
      reason: "video_not_allowed",
    };
  }

  const allowed = availableBalance >= requirement.quantity;
  return {
    allowed,
    creditType: requirement.creditType,
    creditsRequired: requirement.quantity,
    availableBalance,
    reason: allowed ? "allowed" : "insufficient_credits",
  };
};