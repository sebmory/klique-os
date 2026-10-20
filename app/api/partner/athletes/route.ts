import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserPermissionContext } from "@/lib/clerk-access/service";
import { getPublicAthleteDirectoryFromGoogleSheets } from "@/lib/google-sheets";
import { isAthleteVisibleToExternalRoles } from "@/lib/public-athletes";
import {
  localIntroductionAthleteDirectoryEntry,
  localIntroductionFixturesEnabled,
} from "@/lib/partner-athlete-introductions/local-fixtures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const permissions = await getCurrentUserPermissionContext(request);
    if (!permissions.isPartnerExpert || !permissions.isActive || !permissions.partnerId?.trim()) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const athletes = (localIntroductionFixturesEnabled()
      ? [localIntroductionAthleteDirectoryEntry]
      : await getPublicAthleteDirectoryFromGoogleSheets())
      .filter((athlete) => isAthleteVisibleToExternalRoles(athlete.athleteId));
    return NextResponse.json({
      athletes,
      source: localIntroductionFixturesEnabled() ? "local-introduction-fixtures" : "google-sheets",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de charger l’annuaire des athlètes." },
      { status: 500 },
    );
  }
}