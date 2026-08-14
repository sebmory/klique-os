import { NextRequest, NextResponse } from "next/server";
import { evaluateBusinessAccess } from "@/lib/clerk-access/service";
import { updateAthletePortraitFramingInGoogleSheets, updateAthleteVisualUrlInGoogleSheets } from "@/lib/google-sheets";
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

export async function PATCH(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as {
      athleteId?: string;
      scale?: number | string;
      x?: number | string;
      y?: number | string;
    };

    const athleteId = String(body.athleteId ?? "").trim();
    const scale = Number(body.scale);
    const x = Number(body.x);
    const y = Number(body.y);

    if (!athleteId) {
      return NextResponse.json({ error: "athleteId est obligatoire." }, { status: 400 });
    }

    if (!Number.isFinite(scale) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ error: "Valeurs de cadrage invalides." }, { status: 400 });
    }

    const framing = {
      scale: Math.min(Math.max(scale, 0.5), 3),
      x: Math.min(Math.max(x, -100), 100),
      y: Math.min(Math.max(y, -100), 100),
    };

    await updateAthletePortraitFramingInGoogleSheets(athleteId, framing);

    return NextResponse.json({ ok: true, athleteId, ...framing });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'enregistrer le cadrage." },
      { status: 500 }
    );
  }
}
