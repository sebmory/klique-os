import { NextRequest, NextResponse } from "next/server";
import { demoMedia } from "@/lib/demo-media";
import { evaluateBusinessAccess } from "@/lib/clerk-access/service";
import {
  addMediaToGoogleSheets,
  getMediaFromGoogleSheets,
} from "@/lib/google-sheets";
import type { MediaResponse, NewMediaLot } from "@/types/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeAthleteIds = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const entries = value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  return entries.length > 0 ? [...new Set(entries)] : undefined;
};

export async function GET(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "read:community" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ media: [], source: "google-sheets" }, { status: 403 });
    }

    const media = await getMediaFromGoogleSheets();
    const response: MediaResponse = {
      media,
      source: "google-sheets",
    };
    return NextResponse.json(response);
  } catch (error) {
    const response: MediaResponse = {
      media: demoMedia,
      source: "demo",
      message:
        error instanceof Error ? error.message : "Erreur Banque médias.",
    };
    return NextResponse.json(response);
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as NewMediaLot & { galleryUrl?: unknown };

    if (!body.date || !body.athlete || !body.event) {
      return NextResponse.json(
        { error: "Date, athlète et shooting sont obligatoires." },
        { status: 400 }
      );
    }

    // galleryUrl remplace driveLink en colonne S, l ancien champ reste accepte.
    const link = String(body.galleryUrl ?? body.driveLink ?? "").trim();
    if (link && !isHttpsUrl(link)) {
      return NextResponse.json(
        { error: "Le lien de galerie doit être une URL https." },
        { status: 400 }
      );
    }

    await addMediaToGoogleSheets({
      ...body,
      driveLink: link,
      athleteIds: normalizeAthleteIds(body.athleteIds),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible d’ajouter le lot média.",
      },
      { status: 500 }
    );
  }
}
