import { NextRequest, NextResponse } from "next/server";
import { demoShootings } from "@/lib/demo-shootings";
import {
  addShootingToGoogleSheets,
  deleteShootingFromGoogleSheets,
  getShootingsFromGoogleSheets,
  updateShootingInGoogleSheets,
} from "@/lib/google-sheets";
import type {
  NewShooting,
  ShootingsResponse,
  ShootingUpdate,
} from "@/types/shooting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const shootings = await getShootingsFromGoogleSheets();
    const response: ShootingsResponse = {
      shootings,
      source: "google-sheets",
    };
    return NextResponse.json(response);
  } catch (error) {
    const response: ShootingsResponse = {
      shootings: demoShootings,
      source: "demo",
      message:
        error instanceof Error ? error.message : "Erreur Google Sheets.",
    };
    return NextResponse.json(response);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NewShooting;

    if (!body.date || !body.athlete || !body.type) {
      return NextResponse.json(
        { error: "Date, athlète et type sont obligatoires." },
        { status: 400 }
      );
    }

    await addShootingToGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de créer le shooting.",
      },
      { status: 500 }
    );
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as ShootingUpdate;

    if (!body.row) {
      return NextResponse.json(
        { error: "La ligne du shooting est obligatoire." },
        { status: 400 }
      );
    }

    await updateShootingInGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de mettre à jour le shooting.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const row = Number(request.nextUrl.searchParams.get("row"));
    if (!row) {
      return NextResponse.json(
        { error: "La ligne du shooting est obligatoire." },
        { status: 400 }
      );
    }

    await deleteShootingFromGoogleSheets(row);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de supprimer le shooting.",
      },
      { status: 500 }
    );
  }
}
