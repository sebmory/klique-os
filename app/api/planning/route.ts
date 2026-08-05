import { NextRequest, NextResponse } from "next/server";
import { demoPlanning } from "@/lib/demo-planning";
import {
  addPlanningToGoogleSheets,
  getPlanningFromGoogleSheets,
  updatePlanningInGoogleSheets,
} from "@/lib/google-sheets";
import type {
  NewShootingPlanning,
  PlanningResponse,
  PlanningUpdate,
} from "@/types/planning";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const planning = await getPlanningFromGoogleSheets();
    const response: PlanningResponse = {
      planning,
      source: "google-sheets",
    };
    return NextResponse.json(response);
  } catch (error) {
    const response: PlanningResponse = {
      planning: demoPlanning,
      source: "demo",
      message:
        error instanceof Error ? error.message : "Erreur Planning.",
    };
    return NextResponse.json(response);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NewShootingPlanning;

    if (!body.athlete || !body.date || !body.shootingTime || !body.title) {
      return NextResponse.json(
        { error: "Athlète, date, heure et titre sont obligatoires." },
        { status: 400 }
      );
    }

    await addPlanningToGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de créer le planning.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as PlanningUpdate;

    if (!body.row) {
      return NextResponse.json(
        { error: "La ligne Planning est obligatoire." },
        { status: 400 }
      );
    }

    await updatePlanningInGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de mettre à jour le planning.",
      },
      { status: 500 }
    );
  }
}
