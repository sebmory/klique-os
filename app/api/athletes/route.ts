import { NextRequest, NextResponse } from "next/server";
import { demoAthletes } from "@/lib/demo-data";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  getAthletesFromGoogleSheets,
  updateAthleteInGoogleSheets,
  addAthleteToGoogleSheets,
  rejectFormEntry,
} from "@/lib/google-sheets";
import type { Athlete, AthletesResponse, AthleteUpdate } from "@/types/athlete";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const role = profile?.userAccess?.role;
    const athleteId = profile?.userAccess?.athleteId;

    const athletes = await getAthletesFromGoogleSheets();

    const visibleAthletes = role === "athlete" && athleteId
      ? athletes.filter((athlete) => athlete.key === athleteId)
      : athletes;

    const response: AthletesResponse = {
      athletes: visibleAthletes,
      source: "google-sheets",
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur Google Sheets.";

    const response: AthletesResponse = {
      athletes: demoAthletes,
      source: "demo",
      message,
    };

    return NextResponse.json(response);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as AthleteUpdate;

    if (!body.row) {
      return NextResponse.json(
        { error: "La ligne de l'athlète est obligatoire." }, 
        { status: 400 }
      );
    }

    await updateAthleteInGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de mettre \u00e0 jour l'athl\u00e8te.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Athlete;
    await addAthleteToGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'ajout." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { email } = (await request.json()) as { email: string };
    await rejectFormEntry(email);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors du refus." },
      { status: 500 }
    );
  }
}
