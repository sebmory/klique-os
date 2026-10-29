import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import {
  SportsWatchService,
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const disabledResponse = () => NextResponse.json(
  { ok: false, message: "La veille sportive est désactivée." },
  { status: 404, headers: { "Cache-Control": "private, no-store" } },
);

export async function POST(request: Request) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const body = await request.json() as { candidateIds?: unknown };
    const prefill = await SportsWatchService.buildArticlePrefillFromSelection(
      body.candidateIds,
      identity,
    );
    const confirmedDistinct = new URL(request.url).searchParams.get("confirmDistinct") === "true";
    if (prefill.potentialDuplicates.length > 0 && !confirmedDistinct) {
      return NextResponse.json(
        {
          ok: false,
          message: "Des doublons potentiels existent. Choisissez un résultat ou confirmez qu’il s’agit d’événements distincts.",
          prefill,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, prefill },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error
          ? error.message
          : "Impossible de préparer les résultats sélectionnés.",
      },
      {
        status: sportsWatchErrorStatus(error),
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
