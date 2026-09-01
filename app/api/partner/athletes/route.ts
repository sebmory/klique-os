import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserPermissionContext } from "@/lib/clerk-access/service";
import { getPublicAthleteDirectoryFromGoogleSheets } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const permissions = await getCurrentUserPermissionContext(request);
    if (!permissions.isPartnerExpert || !permissions.isActive || !permissions.partnerId?.trim()) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const athletes = await getPublicAthleteDirectoryFromGoogleSheets();
    return NextResponse.json({ athletes, source: "google-sheets" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de charger l’annuaire des athlètes." },
      { status: 500 },
    );
  }
}