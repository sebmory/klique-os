import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import {
  SportsWatchService,
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSportsWatchEnabled()) {
    return NextResponse.json(
      { ok: false, message: "La veille sportive est désactivée." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const identity = await requireSportsWatchAdmin(request);
    const searchParams = new URL(request.url).searchParams;
    const context = await SportsWatchService.buildInterviewContext(
      searchParams.get("athleteId"),
      searchParams.get("candidateId"),
      identity,
    );
    return NextResponse.json(
      { ok: true, context },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error
          ? error.message
          : "Impossible de charger le contexte Sports Watch.",
      },
      {
        status: sportsWatchErrorStatus(error),
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
