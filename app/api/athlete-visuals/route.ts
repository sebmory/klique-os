import { NextRequest, NextResponse } from "next/server";
import { evaluateBusinessAccess } from "@/lib/clerk-access/service";
import { updateAthleteVisualUrlInGoogleSheets } from "@/lib/google-sheets";
import {
  isAllowedAthleteVisualUsage,
  uploadAthleteVisual,
} from "@/lib/athlete-visuals/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const formData = await request.formData();
    const athleteId = String(formData.get("athleteId") ?? "").trim();
    const usage = formData.get("usage");
    const file = formData.get("file");

    if (!athleteId) {
      return NextResponse.json({ error: "athleteId est obligatoire." }, { status: 400 });
    }

    if (!isAllowedAthleteVisualUsage(usage)) {
      return NextResponse.json(
        { error: "usage doit être profilePortrait ou kliqueArrivalVisual." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Le fichier image est obligatoire." }, { status: 400 });
    }

    const result = await uploadAthleteVisual({ athleteId, usage, file });
    await updateAthleteVisualUrlInGoogleSheets(athleteId, usage, result.url);

    return NextResponse.json({ ok: true, athleteId, usage, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'uploader le visuel." },
      { status: 500 }
    );
  }
}
