import { NextRequest, NextResponse } from "next/server";
import { demoShotListItems } from "@/lib/demo-shotlists";
import {
  addShotListItemToGoogleSheets,
  getShotListItemsFromGoogleSheets,
  updateShotListItemInGoogleSheets,
} from "@/lib/google-sheets";
import type {
  NewShotListItem,
  ShotListResponse,
  ShotListUpdate,
} from "@/types/shotlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await getShotListItemsFromGoogleSheets();
    const response: ShotListResponse = { items, source: "google-sheets" };
    return NextResponse.json(response);
  } catch (error) {
    const response: ShotListResponse = {
      items: demoShotListItems,
      source: "demo",
      message: error instanceof Error ? error.message : "Erreur Shot List.",
    };
    return NextResponse.json(response);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NewShotListItem;
    if (!body.title || !body.category) {
      return NextResponse.json(
        { error: "Le titre et la catégorie sont obligatoires." },
        { status: 400 }
      );
    }

    await addShotListItemToGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Création impossible." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as ShotListUpdate;
    if (!body.row) {
      return NextResponse.json(
        { error: "La ligne Shot List est obligatoire." },
        { status: 400 }
      );
    }

    await updateShotListItemInGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mise à jour impossible." },
      { status: 500 }
    );
  }
}
