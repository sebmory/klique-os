import { NextRequest, NextResponse } from "next/server";
import { listAthleteDistinctions } from "@/lib/athlete-distinctions/service";
import { getCurrentUserPermissionContext } from "@/lib/clerk-access/service";
import { hasPendingPartnerAthleteIntroduction } from "@/lib/contact-requests/service";
import { getPublicAthleteProfileFromGoogleSheets } from "@/lib/google-sheets";
import type { PublicAthleteProfile } from "@/types/athlete";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ athleteId: string }> },
) {
  try {
    const permissions = await getCurrentUserPermissionContext(request);
    if (!permissions.isPartnerExpert || !permissions.isActive || !permissions.partnerId?.trim()) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { athleteId } = await params;
    const requestedAthleteId = athleteId.trim();
    if (!requestedAthleteId) {
      return NextResponse.json({ error: "Athlète introuvable." }, { status: 404 });
    }

    const publicProfile = await getPublicAthleteProfileFromGoogleSheets(requestedAthleteId);
    if (!publicProfile) {
      return NextResponse.json({ error: "Athlète public introuvable ou non visible." }, { status: 404 });
    }

    const distinctionRecords = await listAthleteDistinctions(requestedAthleteId, permissions.workspaceId);
    const athlete: PublicAthleteProfile = {
      ...publicProfile,
      distinctions: distinctionRecords.map((distinction) => ({
        type: distinction.type,
        awardMonth: distinction.awardMonth,
        awardYear: distinction.awardYear,
        description: distinction.description?.trim() ?? "",
      })),
    };
    const introductionPending = await hasPendingPartnerAthleteIntroduction(
      permissions.workspaceId,
      permissions.partnerId,
      requestedAthleteId,
    );

    return NextResponse.json({ athlete, introductionPending, source: "google-sheets" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de charger cette fiche publique." },
      { status: 500 },
    );
  }
}