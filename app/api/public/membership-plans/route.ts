import { NextResponse } from "next/server";
import {
  listActiveAthleteMembershipPlans,
  type AthleteMembershipPlan,
} from "@/lib/athlete-credits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  listPlans: () => Promise<AthleteMembershipPlan[]>;
};

const defaultDependencies: HandlerDependencies = {
  listPlans: listActiveAthleteMembershipPlans,
};

const planOrder = new Map([
  ["essential", 0],
  ["impact", 1],
  ["signature", 2],
]);

export const createPublicMembershipPlansHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    try {
      const plans = (await dependencies.listPlans())
        .filter((plan) => (
          plan.active
          && planOrder.has(plan.code)
          && plan.annualPriceChf !== null
          && plan.durationMonths !== null
          && plan.productionCredits !== null
          && plan.customContentCredits !== null
        ))
        .sort((left, right) => planOrder.get(left.code)! - planOrder.get(right.code)!)
        .map((plan) => ({
          code: plan.code,
          name: plan.name,
          annualPriceChf: plan.annualPriceChf!,
          durationMonths: plan.durationMonths!,
          productionCredits: plan.productionCredits!,
          customContentCredits: plan.customContentCredits!,
          videoAllowed: plan.videoAllowed === true,
        }));

      return NextResponse.json({ plans });
    } catch {
      return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
    }
  },
});

const handlers = createPublicMembershipPlansHandlers();
export const GET = handlers.GET;