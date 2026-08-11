import { NextRequest, NextResponse } from "next/server";
import { demoAthletes } from "@/lib/demo-data";
import { evaluateBusinessAccess, getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
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
    const searchParams = request.nextUrl.searchParams;
    const requestedMemberId = searchParams.get("memberId")?.trim() ?? null;
    const profile = await getCurrentUserAccessProfile(request);
    const role = profile?.userAccess?.role;
    const athleteId = profile?.userAccess?.athleteId;
    const accessCheck = await evaluateBusinessAccess(request, {
      action: requestedMemberId ? "read:athlete-record" : "read:own-profile",
      targetAthleteId: requestedMemberId ?? athleteId,
    });

    if (!accessCheck.allowed) {
      return NextResponse.json({ athletes: [], source: "google-sheets" }, { status: 403 });
    }

    const athletes = await getAthletesFromGoogleSheets();
    const fullAthleteIndex = requestedMemberId
      ? athletes.findIndex((athlete) => athlete.key === requestedMemberId)
      : -1;

    let visibleAthletes = athletes;

    if (requestedMemberId) {
      visibleAthletes = athletes.filter((athlete) => athlete.key === requestedMemberId);
    } else if (role === "athlete" && athleteId) {
      visibleAthletes = athletes.filter((athlete) => athlete.key === athleteId);
    }

    const response: AthletesResponse & { memberIndex?: number | null } = {
      athletes: visibleAthletes,
      source: "google-sheets",
      memberIndex: requestedMemberId ? (fullAthleteIndex >= 0 ? fullAthleteIndex : null) : null,
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
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });

    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

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
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });

    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

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
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });

    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    await rejectFormEntry(email);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors du refus." },
      { status: 500 }
    );
  }
}
