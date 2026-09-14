import { NextResponse } from "next/server";
import {
  ATHLETE_CONTENT_FORMATS,
  ATHLETE_SUBSCRIPTION_COMMON_BENEFITS,
  ATHLETE_SUBSCRIPTION_FOUNDER_PLAN,
  ATHLETE_SUBSCRIPTION_PLANS,
} from "@/lib/athlete-subscription-catalog";
import {
  getActiveAthleteSubscription,
  type AthleteSubscription,
} from "@/lib/athlete-subscriptions/service";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

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
  getActiveSubscription: (workspaceId: string, athleteId: string) => Promise<AthleteSubscription | null>;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    return profile?.userAccess ?? null;
  },
  getActiveSubscription: getActiveAthleteSubscription,
};

const buildPublicSubscription = (subscription: AthleteSubscription) => {
  const plan = subscription.planCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code
    ? ATHLETE_SUBSCRIPTION_FOUNDER_PLAN
    : ATHLETE_SUBSCRIPTION_PLANS.find(({ code }) => code === subscription.planCode);
  if (!plan) throw new Error("Catalogue d’abonnement Athlète incohérent.");
  const contentFormatCodes = new Set<string>(plan.contentFormatCodes);

  return {
    id: subscription.id,
    planCode: subscription.planCode,
    status: subscription.status,
    startsOn: subscription.startsOn,
    endsOn: subscription.endsOn,
    isFounder: subscription.isFounder,
    isComplimentary: subscription.isComplimentary,
    priceChf: subscription.priceChf,
    discountPercent: subscription.discountPercent,
    photoSessionsIncluded: subscription.photoSessionsIncluded,
    mediaDaysIncluded: subscription.mediaDaysIncluded,
    competitionSessionsIncluded: subscription.competitionSessionsIncluded,
    customContentsIncluded: subscription.customContentsIncluded,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    catalog: {
      code: plan.code,
      name: plan.name,
      annualPriceChf: plan.annualPriceChf,
      inheritsFrom: "inheritsFrom" in plan ? plan.inheritsFrom : null,
      includedProductions: plan.includedProductions,
      customContentCount: plan.customContentCount,
      aLaCarteDiscountPercent: plan.aLaCarteDiscountPercent,
      commonBenefits: ATHLETE_SUBSCRIPTION_COMMON_BENEFITS.filter(({ code }) => (
        plan.commonBenefitCodes.includes(code)
      )),
      contentFormats: ATHLETE_CONTENT_FORMATS.filter(({ code }) => contentFormatCodes.has(code)),
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

      const subscription = await dependencies.getActiveSubscription(workspaceId, athleteId);
      return NextResponse.json({
        subscription: subscription ? buildPublicSubscription(subscription) : null,
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