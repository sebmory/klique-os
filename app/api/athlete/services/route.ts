import { NextResponse } from "next/server";
import { getAthleteCreditBalance, listActiveAthleteMembershipPlans } from "@/lib/athlete-credits";
import { getCurrentAthleteMembership } from "@/lib/athlete-memberships";
import {
  buildAthleteMemberServicesProjection,
  listActiveAthleteServiceProducts,
} from "@/lib/athlete-service-catalog";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const access = profile?.userAccess ?? null;
    const workspaceId = access?.workspaceId?.trim() ?? "";
    const athleteId = access?.athleteId?.trim() ?? "";

    if (access?.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const athletes = await getAthletesFromGoogleSheets();
    const athleteIndex = athletes.findIndex((athlete) => athlete.key === athleteId);
    const athlete = athleteIndex >= 0 ? athletes[athleteIndex] : null;
    if (!athlete) {
      return NextResponse.json({ error: "Profil athlète introuvable." }, { status: 404 });
    }

    const [membership, plans, balance, products] = await Promise.all([
      getCurrentAthleteMembership({
        workspaceId,
        athleteId,
        historical: {
          startDate: athlete.adhesionDate,
          athleteIndex,
        },
      }),
      listActiveAthleteMembershipPlans(),
      getAthleteCreditBalance(workspaceId, athleteId),
      listActiveAthleteServiceProducts(),
    ]);

    const planCode = membership.membership?.planCode ?? null;
    const plan = planCode ? plans.find((candidate) => candidate.code === planCode) ?? null : null;
    const catalog = buildAthleteMemberServicesProjection({
      products,
      membershipActive: membership.isActive,
      plan,
      balance,
    });

    return NextResponse.json({
      membership: catalog.membership,
      services: catalog.services,
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de charger les services membres pour le moment." },
      { status: 500 },
    );
  }
}
