import { neon } from "@neondatabase/serverless";
import {
  buildAnnualPlanCreditGrantAssertionQuery,
  buildAnnualPlanCreditGrantQueries,
  grantAnnualPlanCredits,
  listActiveAthleteMembershipPlans,
  mapAnnualPlanCreditGrantExecution,
  type AthleteMembershipPlan,
} from "@/lib/athlete-credits";
import { buildMembershipState } from "@/lib/membership";

export type AthleteMembershipKind = "founder" | "subscription" | "trial" | "manual";
export type AthleteMembershipStatus = "active" | "scheduled" | "expired" | "cancelled" | "past_due";
export type AthleteMembershipPaymentMode = "annual" | "monthly_12";

export type AthleteMembership = {
  id: string;
  workspaceId: string;
  athleteId: string;
  membershipKind: AthleteMembershipKind;
  planCode: string | null;
  status: AthleteMembershipStatus;
  startsAt: string;
  endsAt: string | null;
  autoRenew: boolean;
  paymentInstallments: number | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type CurrentAthleteMembership = {
  origin: "neon" | "historical";
  membership: AthleteMembership | null;
  status: AthleteMembershipStatus | "unknown";
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type HistoricalMembershipInput = {
  startDate?: string | null;
  athleteIndex: number | null;
};

type AthleteMembershipRow = {
  id: string;
  workspace_id: string;
  athlete_id: string;
  membership_kind: AthleteMembershipKind;
  plan_code: string | null;
  status: AthleteMembershipStatus;
  starts_at: string | Date;
  ends_at: string | Date | null;
  auto_renew: boolean;
  payment_installments: number | null;
  source: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export type AthleteMembershipReader = (workspaceId: string, athleteId: string) => Promise<AthleteMembership[]>;

export type AthleteMembershipAdminInput = {
  membershipKind: AthleteMembershipKind;
  planCode: string | null;
  status: AthleteMembershipStatus;
  startsAt: string;
  endsAt: string | null;
  autoRenew: boolean;
  paymentMode: AthleteMembershipPaymentMode | null;
};

export type AthleteMembershipAdminRepository = {
  getActivePlan: (planCode: string) => Promise<AthleteMembershipPlan | null>;
  hasActiveMembership: (workspaceId: string, athleteId: string, excludeId?: string) => Promise<boolean>;
  create: (input: AthleteMembershipAdminInput & { id: string; workspaceId: string; athleteId: string; source: "admin_manual"; paymentInstallments: 1 | 12 | null; grantAnnualCredits: boolean }) => Promise<AthleteMembership>;
  update: (input: AthleteMembershipAdminInput & { id: string; workspaceId: string; athleteId: string; paymentInstallments: 1 | 12 | null; grantAnnualCredits: boolean }) => Promise<AthleteMembership | null>;
};

export class AthleteMembershipValidationError extends Error {}
export class AthleteMembershipActiveConflictError extends Error {}
export class AthleteMembershipPlanChangeError extends Error {}

const membershipKinds: AthleteMembershipKind[] = ["founder", "subscription", "trial", "manual"];
const membershipStatuses: AthleteMembershipStatus[] = ["active", "scheduled", "expired", "cancelled", "past_due"];

export const isAthleteMembershipKind = (value: unknown): value is AthleteMembershipKind =>
  typeof value === "string" && membershipKinds.includes(value as AthleteMembershipKind);

export const isAthleteMembershipStatus = (value: unknown): value is AthleteMembershipStatus =>
  typeof value === "string" && membershipStatuses.includes(value as AthleteMembershipStatus);

export const isAthleteMembershipPaymentMode = (value: unknown): value is AthleteMembershipPaymentMode =>
  value === "annual" || value === "monthly_12";

export const assertAthleteMembershipPlanChangeAllowed = (
  currentPlanCode: string | null,
  nextPlanCode: string | null,
  hasPlanGrant: boolean,
): void => {
  if (hasPlanGrant && currentPlanCode !== nextPlanCode) {
    throw new AthleteMembershipPlanChangeError("Ce cycle a déjà reçu ses crédits. Créez le changement de plan au prochain cycle.");
  }
};

export const validateAthleteMembershipAdminInput = (input: AthleteMembershipAdminInput): AthleteMembershipAdminInput => {
  if (!isAthleteMembershipKind(input.membershipKind)) {
    throw new AthleteMembershipValidationError("Type d’adhésion invalide.");
  }
  if (!isAthleteMembershipStatus(input.status)) {
    throw new AthleteMembershipValidationError("Statut d’adhésion invalide.");
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (!input.startsAt || Number.isNaN(startsAt.getTime())) {
    throw new AthleteMembershipValidationError("La date de début est invalide.");
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw new AthleteMembershipValidationError("La date de fin est invalide.");
  }
  if (endsAt && endsAt <= startsAt) {
    throw new AthleteMembershipValidationError("La date de fin doit être postérieure à la date de début.");
  }
  if (input.membershipKind === "subscription" && !input.planCode?.trim()) {
    throw new AthleteMembershipValidationError("Le plan est obligatoire pour un abonnement.");
  }
  if (input.membershipKind === "subscription" && !input.paymentMode) {
    throw new AthleteMembershipValidationError("Le mode de paiement est obligatoire pour un abonnement.");
  }
  if (input.paymentMode !== null && !isAthleteMembershipPaymentMode(input.paymentMode)) {
    throw new AthleteMembershipValidationError("Le mode de paiement est invalide.");
  }

  return {
    ...input,
    planCode: input.planCode?.trim() || null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt?.toISOString() ?? null,
  };
};

const addPlanMonths = (startsAt: string, durationMonths: number): string => {
  const start = new Date(startsAt);
  start.setUTCMonth(start.getUTCMonth() + durationMonths);
  return start.toISOString();
};

const paymentInstallmentsFor = (paymentMode: AthleteMembershipPaymentMode | null): 1 | 12 | null =>
  paymentMode === "annual" ? 1 : paymentMode === "monthly_12" ? 12 : null;

const prepareAdminMembershipInput = async (
  input: AthleteMembershipAdminInput,
  repository: AthleteMembershipAdminRepository,
  now: Date,
  allowLegacyMonthly12: boolean,
): Promise<AthleteMembershipAdminInput & { paymentInstallments: 1 | 12 | null; grantAnnualCredits: boolean }> => {
  const validated = validateAthleteMembershipAdminInput(input);
  if (validated.membershipKind !== "subscription") {
    return { ...validated, paymentInstallments: paymentInstallmentsFor(validated.paymentMode), grantAnnualCredits: false };
  }
  if (validated.paymentMode === "monthly_12" && !allowLegacyMonthly12) {
    throw new AthleteMembershipValidationError("L’offre Athlète V1 requiert un paiement annuel en une fois.");
  }

  const plan = await repository.getActivePlan(validated.planCode!);
  if (!plan || plan.active !== true || plan.durationMonths !== 12) {
    throw new AthleteMembershipValidationError("Ce plan d’abonnement n’est pas disponible.");
  }
  if ((plan.productionCredits ?? 0) <= 0 || (plan.customContentCredits ?? 0) <= 0) {
    throw new AthleteMembershipValidationError("Les droits de ce plan sont incomplets.");
  }

  const endsAt = addPlanMonths(validated.startsAt, plan.durationMonths);
  const startsAtTimestamp = new Date(validated.startsAt).getTime();
  const endsAtTimestamp = new Date(endsAt).getTime();
  const grantAnnualCredits = validated.status === "active"
    && startsAtTimestamp <= now.getTime()
    && endsAtTimestamp > now.getTime();

  return {
    ...validated,
    endsAt,
    paymentInstallments: paymentInstallmentsFor(validated.paymentMode),
    grantAnnualCredits,
  };
};

const asIsoString = (value: string | Date): string => new Date(value).toISOString();

const mapMembershipRow = (row: AthleteMembershipRow): AthleteMembership => ({
  id: row.id,
  workspaceId: row.workspace_id,
  athleteId: row.athlete_id,
  membershipKind: row.membership_kind,
  planCode: row.plan_code,
  status: row.status,
  startsAt: asIsoString(row.starts_at),
  endsAt: row.ends_at ? asIsoString(row.ends_at) : null,
  autoRenew: row.auto_renew,
  paymentInstallments: row.payment_installments,
  source: row.source,
  createdAt: asIsoString(row.created_at),
  updatedAt: asIsoString(row.updated_at),
});

export const readAthleteMembershipsFromNeon: AthleteMembershipReader = async (workspaceId, athleteId) => {
  const databaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("POSTGRES_DATABASE_URL absente.");

  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT
      id,
      workspace_id,
      athlete_id,
      membership_kind,
      plan_code,
      status,
      starts_at,
      ends_at,
      auto_renew,
      payment_installments,
      source,
      created_at,
      updated_at
    FROM athlete_memberships
    WHERE workspace_id = ${workspaceId}
      AND athlete_id = ${athleteId}
    ORDER BY starts_at DESC, created_at DESC
  `;

  return (rows as AthleteMembershipRow[]).map(mapMembershipRow);
};

const createAdminRepository = (): AthleteMembershipAdminRepository => {
  const databaseUrl = process.env.POSTGRES_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("POSTGRES_DATABASE_URL absente.");
  const sql = neon(databaseUrl);

  return {
    async getActivePlan(planCode) {
      const plans = await listActiveAthleteMembershipPlans();
      return plans.find((plan) => plan.code === planCode) ?? null;
    },
    async hasActiveMembership(workspaceId, athleteId, excludeId) {
      const rows = await sql`
        SELECT 1
        FROM athlete_memberships
        WHERE workspace_id = ${workspaceId}
          AND athlete_id = ${athleteId}
          AND status = 'active'
          AND (${excludeId ?? null}::TEXT IS NULL OR id <> ${excludeId ?? null})
        LIMIT 1
      `;
      return rows.length > 0;
    },
    async create(input) {
      try {
        const insertMembership = sql`
          INSERT INTO athlete_memberships (
            id, workspace_id, athlete_id, membership_kind, plan_code, status, starts_at, ends_at,
            auto_renew, payment_installments, source, created_at, updated_at
          ) VALUES (
            ${input.id}, ${input.workspaceId}, ${input.athleteId}, ${input.membershipKind}, ${input.planCode},
            ${input.status}, ${input.startsAt}, ${input.endsAt}, ${input.autoRenew}, ${input.paymentInstallments},
            ${input.source}, NOW(), NOW()
          )
          RETURNING *
        `;
        if (!input.grantAnnualCredits) {
          const rows = await insertMembership;
          return mapMembershipRow(rows[0] as AthleteMembershipRow);
        }

        let membership: AthleteMembership | null = null;
        await grantAnnualPlanCredits({
          workspaceId: input.workspaceId,
          athleteId: input.athleteId,
          membershipId: input.id,
          cycleStart: input.startsAt,
          execute: async (grantInput) => {
            const results = await sql.transaction([
              insertMembership,
              ...buildAnnualPlanCreditGrantQueries(sql, grantInput),
              buildAnnualPlanCreditGrantAssertionQuery(sql, grantInput),
            ]);
            membership = mapMembershipRow((results[0] as AthleteMembershipRow[])[0]);
            return mapAnnualPlanCreditGrantExecution(results.slice(1));
          },
        });
        if (!membership) throw new Error("La création transactionnelle de l’adhésion a échoué.");
        return membership;
      } catch (error) {
        if ((error as { code?: string }).code === "23505" && input.status === "active") {
          throw new AthleteMembershipActiveConflictError("Une adhésion active existe déjà pour cet athlète.");
        }
        throw error;
      }
    },
    async update(input) {
      try {
        const lockMembership = sql`
          SELECT m.*,
                 EXISTS (
                   SELECT 1 FROM athlete_credit_movements movement
                   WHERE movement.membership_id = m.id AND movement.source = 'plan_grant'
                 ) AS has_plan_grant
          FROM athlete_memberships m
          WHERE m.id = ${input.id}
            AND m.workspace_id = ${input.workspaceId}
            AND m.athlete_id = ${input.athleteId}
          FOR UPDATE OF m
        `;
        const updateMembership = sql`
          UPDATE athlete_memberships
          SET membership_kind = ${input.membershipKind},
              plan_code = ${input.planCode},
              status = ${input.status},
              starts_at = ${input.startsAt},
              ends_at = ${input.endsAt},
              auto_renew = ${input.autoRenew},
              payment_installments = ${input.paymentInstallments},
              updated_at = NOW()
          WHERE id = ${input.id}
            AND workspace_id = ${input.workspaceId}
            AND athlete_id = ${input.athleteId}
            AND membership_kind <> 'founder'
            AND (${input.paymentInstallments}::INTEGER IS DISTINCT FROM 12 OR payment_installments = 12)
            AND NOT (
              (plan_code IS DISTINCT FROM ${input.planCode} OR starts_at IS DISTINCT FROM ${input.startsAt}::timestamptz)
              AND EXISTS (
                SELECT 1 FROM athlete_credit_movements movement
                WHERE movement.membership_id = athlete_memberships.id
                  AND movement.source = 'plan_grant'
              )
            )
          RETURNING *
        `;
        let results: unknown[][];
        if (input.grantAnnualCredits) {
          await grantAnnualPlanCredits({
            workspaceId: input.workspaceId,
            athleteId: input.athleteId,
            membershipId: input.id,
            cycleStart: input.startsAt,
            execute: async (grantInput) => {
              results = await sql.transaction([
                lockMembership,
                updateMembership,
                ...buildAnnualPlanCreditGrantQueries(sql, grantInput),
                buildAnnualPlanCreditGrantAssertionQuery(sql, grantInput),
              ]);
              return mapAnnualPlanCreditGrantExecution(results.slice(2));
            },
          });
        } else {
          results = await sql.transaction([lockMembership, updateMembership]);
        }

        const current = (results![0] as Array<AthleteMembershipRow & { has_plan_grant: boolean }>)[0];
        if (!current) return null;
        if (current.membership_kind === "founder") {
          throw new AthleteMembershipValidationError("Les adhésions fondatrices historiques ne peuvent pas être modifiées.");
        }
        const updated = (results![1] as AthleteMembershipRow[])[0];
        if (!updated) assertAthleteMembershipPlanChangeAllowed(current.plan_code, input.planCode, current.has_plan_grant);
        if (!updated && asIsoString(current.starts_at) !== input.startsAt && current.has_plan_grant) {
          throw new AthleteMembershipValidationError("La date d’un cycle déjà crédité ne peut pas être modifiée.");
        }
        if (!updated && input.paymentInstallments === 12 && current.payment_installments !== 12) {
          throw new AthleteMembershipValidationError("Une nouvelle modalité en 12 échéances n’est plus disponible.");
        }
        return updated ? mapMembershipRow(updated) : null;
      } catch (error) {
        if ((error as { code?: string }).code === "23505" && input.status === "active") {
          throw new AthleteMembershipActiveConflictError("Une adhésion active existe déjà pour cet athlète.");
        }
        throw error;
      }
    },
  };
};

export const createAthleteMembershipAsAdmin = async ({
  workspaceId,
  athleteId,
  input,
  now = new Date(),
  repository = createAdminRepository(),
}: {
  workspaceId: string;
  athleteId: string;
  input: AthleteMembershipAdminInput;
  now?: Date;
  repository?: AthleteMembershipAdminRepository;
}): Promise<AthleteMembership> => {
  const prepared = await prepareAdminMembershipInput(input, repository, now, false);
  if (prepared.status === "active" && await repository.hasActiveMembership(workspaceId, athleteId)) {
    throw new AthleteMembershipActiveConflictError("Une adhésion active existe déjà pour cet athlète.");
  }
  return repository.create({
    ...prepared,
    id: crypto.randomUUID(),
    workspaceId,
    athleteId,
    source: "admin_manual",
  });
};

export const updateAthleteMembershipAsAdmin = async ({
  id,
  workspaceId,
  athleteId,
  input,
  now = new Date(),
  repository = createAdminRepository(),
}: {
  id: string;
  workspaceId: string;
  athleteId: string;
  input: AthleteMembershipAdminInput;
  now?: Date;
  repository?: AthleteMembershipAdminRepository;
}): Promise<AthleteMembership | null> => {
  const prepared = await prepareAdminMembershipInput(input, repository, now, true);
  if (prepared.status === "active" && await repository.hasActiveMembership(workspaceId, athleteId, id)) {
    throw new AthleteMembershipActiveConflictError("Une adhésion active existe déjà pour cet athlète.");
  }
  return repository.update({ ...prepared, id, workspaceId, athleteId });
};

const timestamp = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const isMembershipActiveAt = (membership: AthleteMembership, now: number): boolean => {
  const startsAt = timestamp(membership.startsAt);
  const endsAt = timestamp(membership.endsAt);
  return membership.status === "active"
    && startsAt !== null
    && startsAt <= now
    && (endsAt === null || endsAt > now);
};

const selectMembership = (memberships: AthleteMembership[], now: number): AthleteMembership => {
  const current = memberships.find((membership) => isMembershipActiveAt(membership, now));
  if (current) return current;

  const future = memberships
    .filter((membership) => (timestamp(membership.startsAt) ?? 0) > now)
    .sort((left, right) => (timestamp(left.startsAt) ?? 0) - (timestamp(right.startsAt) ?? 0))[0];
  if (future) return future;

  return [...memberships].sort(
    (left, right) => (timestamp(right.startsAt) ?? 0) - (timestamp(left.startsAt) ?? 0),
  )[0];
};

const effectiveStatus = (membership: AthleteMembership, now: number): AthleteMembershipStatus => {
  const startsAt = timestamp(membership.startsAt);
  const endsAt = timestamp(membership.endsAt);
  if (startsAt !== null && startsAt > now) return "scheduled";
  if (membership.status === "active" && endsAt !== null && endsAt <= now) return "expired";
  return membership.status;
};

export const getCurrentAthleteMembership = async ({
  workspaceId,
  athleteId,
  historical,
  now = new Date(),
  readMemberships = readAthleteMembershipsFromNeon,
}: {
  workspaceId: string;
  athleteId: string;
  historical: HistoricalMembershipInput;
  now?: Date;
  readMemberships?: AthleteMembershipReader;
}): Promise<CurrentAthleteMembership> => {
  const memberships = await readMemberships(workspaceId, athleteId);
  const nowTimestamp = now.getTime();

  if (memberships.length > 0) {
    const membership = selectMembership(memberships, nowTimestamp);
    return {
      origin: "neon",
      membership,
      status: effectiveStatus(membership, nowTimestamp),
      isActive: isMembershipActiveAt(membership, nowTimestamp),
      startsAt: membership.startsAt,
      endsAt: membership.endsAt,
    };
  }

  const state = buildMembershipState({
    startDate: historical.startDate,
    isInitialFreeYearEligible: historical.athleteIndex !== null && historical.athleteIndex < 16,
    now,
  });

  return {
    origin: "historical",
    membership: null,
    status: state.statusLabel === "Actif" ? "active" : state.statusLabel === "Expiré" ? "expired" : "unknown",
    isActive: state.isActive,
    startsAt: historical.startDate?.trim() || null,
    endsAt: state.endDateLabel,
  };
};