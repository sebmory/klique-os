import { NextRequest, NextResponse } from "next/server";
import { getAthleteCreditBalance, listAthleteMembershipPlans } from "@/lib/athlete-credits";
import { getCurrentAthleteMembership } from "@/lib/athlete-memberships";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import { buildKliquePassPlanRights, type KliquePassMembership } from "@/lib/klique-pass";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const access = profile?.userAccess ?? null;
    const athleteId = access?.athleteId?.trim() ?? "";
    const workspaceId = access?.workspaceId?.trim() ?? "";

    if (access?.role !== "athlete" || access.status !== "active" || !athleteId || !workspaceId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const athletes = await getAthletesFromGoogleSheets();
    const athleteIndex = athletes.findIndex((athlete) => athlete.key === athleteId);
    const athlete = athleteIndex >= 0 ? athletes[athleteIndex] : null;
    if (!athlete) {
      return NextResponse.json({ error: "Impossible de retrouver les données de votre Pass KLIQUE." }, { status: 404 });
    }

    const membership = await getCurrentAthleteMembership({
      workspaceId,
      athleteId,
      historical: {
        startDate: athlete.adhesionDate,
        athleteIndex,
      },
    });

    const membershipRecord = membership.membership;
    const planCode = membershipRecord?.planCode ?? null;
    const [plans, balance] = planCode
      ? await Promise.all([
          listAthleteMembershipPlans(),
          getAthleteCreditBalance(workspaceId, athleteId),
        ])
      : [[], null];
    const plan = planCode ? plans.find((candidate) => candidate.code === planCode) ?? null : null;
    const planRights = plan && balance
      ? buildKliquePassPlanRights({
          plan,
          balance,
          paymentInstallments: membershipRecord?.paymentInstallments ?? null,
          nextRenewalAt: membership.endsAt,
        })
      : null;
    const publicMembership: KliquePassMembership = {
      origin: membership.origin,
      status: membership.status,
      isActive: membership.isActive,
      startsAt: membership.startsAt,
      endsAt: membership.endsAt,
      membership: membershipRecord ? {
        membershipKind: membershipRecord.membershipKind,
        autoRenew: membershipRecord.autoRenew,
      } : null,
    };

    return NextResponse.json({
      athlete: {
        key: athlete.key,
        name: athlete.name,
        sport: athlete.sport,
        adhesionDate: athlete.adhesionDate,
      },
      athleteIndex,
      membership: publicMembership,
      plan: planRights,
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de charger votre Pass KLIQUE pour le moment." },
      { status: 500 },
    );
  }
}