import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import { SportsWatchImportService } from "@/lib/sports-watch/import-service";
import {
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";
import { SportsWatchImportFileError } from "@/lib/sports-watch/import-file";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isSportsWatchEnabled()) {
    return NextResponse.json(
      { ok: false, message: "La veille sportive est désactivée." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const identity = await requireSportsWatchAdmin(request);
    const formData = await request.formData();
    const submittedFile = formData.get("file");
    if (!(submittedFile instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "Sélectionnez un document à importer." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const imported = await SportsWatchImportService.upload(
      formData.get("athleteId"),
      submittedFile,
      identity,
    );
    return NextResponse.json(
      { ok: true, imported },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Impossible d’importer le document.",
      },
      {
        status: error instanceof SportsWatchImportFileError ? 400 : sportsWatchErrorStatus(error),
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
