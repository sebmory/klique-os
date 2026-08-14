import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserPermissionContext } from "@/lib/clerk-access/service";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public-safe projection: never expose email, phone, form answers or private profile fields.
type AthleteArrival = {
  athleteId: string;
  name: string;
  sport: string;
  club: string;
  adhesionDate: string;
  kliqueArrivalVisualUrl: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

export async function GET(request: NextRequest) {
  try {
    const permissionContext = await getCurrentUserPermissionContext(request);
    const isAllowed =
      permissionContext.isActive && (permissionContext.isAdmin || permissionContext.isAthlete);

    if (!isAllowed) {
      return NextResponse.json({ arrivals: [] }, { status: 403 });
    }

    const athletes = await getAthletesFromGoogleSheets();

    const arrivals: AthleteArrival[] = athletes
      .filter((athlete) => normalize(athlete.name) && normalize(athlete.adhesionDate))
      .map((athlete) => ({
        athleteId: normalize(athlete.athleteId) || normalize(athlete.key),
        name: normalize(athlete.name),
        sport: normalize(athlete.sport),
        club: normalize(athlete.club),
        adhesionDate: normalize(athlete.adhesionDate),
        kliqueArrivalVisualUrl: normalize(athlete.kliqueArrivalVisualUrl),
      }))
      .filter((athlete) => athlete.athleteId);

    return NextResponse.json({ arrivals });
  } catch {
    return NextResponse.json({ arrivals: [] }, { status: 200 });
  }
}
