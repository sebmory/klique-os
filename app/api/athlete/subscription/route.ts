import { NextResponse } from "next/server";
import {
  ATHLETE_CONTENT_FORMATS,
  ATHLETE_SUBSCRIPTION_COMMON_BENEFITS,
  type AthleteSubscriptionPlanCode,
} from "@/lib/athlete-subscription-catalog";
import {
  getAthleteCreditBalance,
  listActiveAthleteMembershipPlans,
  type AthleteCreditBalance,
  type AthleteMembershipPlan,
} from "@/lib/athlete-credits";
import {
  getCurrentAthleteMembership,
  type CurrentAthleteMembership,
} from "@/lib/athlete-memberships";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AthleteAccess = {
  role?: string;
  status?: string;
  workspaceId?: string | null;
  athleteId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AthleteAccess | null>;
  getCurrentMembership: (workspaceId: string, athleteId: string) => Promise<CurrentAthleteMembership>;
  listPlans: () => Promise<AthleteMembershipPlan[]>;
  getCreditBalance: (workspaceId: string, athleteId: string) => Promise<AthleteCreditBalance>;
  getContentRequestSubscriptionId: (workspaceId: string, membershipId: string) => Promise<string | null>;
};

const getContentRequestSubscriptionId = async (
  workspaceId: string,
  membershipId: string,
): Promise<string | null> => {
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT id
    FROM athlete_subscriptions
    WHERE workspace_id = ${workspaceId}
      AND membership_id = ${membershipId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.id ? String(rows[0].id) : null;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    return profile?.userAccess ?? null;
  },
  getCurrentMembership: (workspaceId, athleteId) => getCurrentAthleteMembership({
    workspaceId,
    athleteId,
    historical: { athleteIndex: null },
  }),
  listPlans: listActiveAthleteMembershipPlans,
  getCreditBalance: getAthleteCreditBalance,
  getContentRequestSubscriptionId,
};

const commercialPlanCodes = new Set<AthleteSubscriptionPlanCode>([
  "essential",
  "impact",
  "signature",
]);

const isCommercialPlanCode = (value: string | null): value is AthleteSubscriptionPlanCode =>
  value !== null && commercialPlanCodes.has(value as AthleteSubscriptionPlanCode);

const zeroBalance: AthleteCreditBalance = { production: 0, custom_content: 0 };

const buildPublicPass = ({
  membership,
  plan,
  balance,
  contentRequestSubscriptionId,
}: {
  membership: NonNullable<CurrentAthleteMembership["membership"]>;
  plan: AthleteMembershipPlan | null;
  balance: AthleteCreditBalance;
  contentRequestSubscriptionId: string | null;
}) => {
  const founder = membership.membershipKind === "founder";
  if (!founder && !plan) throw new Error("Catalogue d’abonnement Athlète incohérent.");

  return {
    id: membership.id,
    contentRequestSubscriptionId,
    membershipKind: membership.membershipKind,
    planCode: founder ? "founder" : plan!.code,
    status: membership.status,
    startsAt: membership.startsAt,
    endsAt: membership.endsAt,
    autoRenew: membership.autoRenew,
    isFounder: founder,
    catalog: {
      code: founder ? "founder" : plan!.code,
      name: founder ? "Membre fondateur" : plan!.name,
      annualPriceChf: founder ? 0 : plan!.annualPriceChf ?? 0,
      productionCreditCount: founder ? 0 : plan!.productionCredits ?? 0,
      customContentCount: founder ? 0 : plan!.customContentCredits ?? 0,
      videoAllowed: founder ? false : plan!.videoAllowed === true,
      commonBenefits: ATHLETE_SUBSCRIPTION_COMMON_BENEFITS,
      contentFormats: founder ? [] : ATHLETE_CONTENT_FORMATS,
    },
    credits: {
      production: {
        included: founder ? 0 : plan!.productionCredits ?? 0,
        available: founder ? 0 : Math.max(0, balance.production),
      },
      customContent: {
        included: founder ? 0 : plan!.customContentCredits ?? 0,
        available: founder ? 0 : Math.max(0, balance.custom_content),
      },
    },
  };
};

export const createAthleteSubscriptionHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await dependencies.getAccess(request);
      const workspaceId = access?.workspaceId?.trim() ?? "";
      const athleteId = access?.athleteId?.trim() ?? "";
      if (access?.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const current = await dependencies.getCurrentMembership(workspaceId, athleteId);
      const membership = current.membership;
      if (!membership || !current.isActive) {
        const plans = (await dependencies.listPlans())
          .filter((plan) => (
            isCommercialPlanCode(plan.code)
            && plan.durationMonths === 12
            && plan.annualPriceChf !== null
            && plan.productionCredits !== null
            && plan.customContentCredits !== null
          ))
          .map((plan) => ({
            code: plan.code,
            name: plan.name,
            annualPriceChf: plan.annualPriceChf!,
            productionCredits: plan.productionCredits!,
            customContentCredits: plan.customContentCredits!,
            videoAllowed: plan.videoAllowed === true,
          }));
        return NextResponse.json({ pass: null, plans });
      }

      const founder = membership.membershipKind === "founder";
      const planCode = membership.planCode;
      if (!founder && !isCommercialPlanCode(planCode)) {
        throw new Error("Plan d’abonnement Athlète invalide.");
      }

      const [plans, balance, contentRequestSubscriptionId] = await Promise.all([
        founder ? Promise.resolve([]) : dependencies.listPlans(),
        founder ? Promise.resolve(zeroBalance) : dependencies.getCreditBalance(workspaceId, athleteId),
        dependencies.getContentRequestSubscriptionId(workspaceId, membership.id),
      ]);
      const plan = founder ? null : plans.find(({ code }) => code === planCode) ?? null;

      return NextResponse.json({
        pass: buildPublicPass({ membership, plan, balance, contentRequestSubscriptionId }),
      });
    } catch {
      return NextResponse.json(
        { error: "Impossible de charger votre abonnement pour le moment." },
        { status: 500 },
      );
    }
  },
});

const handlers = createAthleteSubscriptionHandlers();
export const GET = handlers.GET;