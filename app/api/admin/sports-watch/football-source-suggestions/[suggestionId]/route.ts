import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import { FootballPublicService } from "@/lib/sports-watch/football-public-service";
import {
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ suggestionId: string }> },
) {
  if (!isSportsWatchEnabled()) {
    return NextResponse.json({ ok: false, message: "La veille sportive est désactivée." }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { suggestionId } = await context.params;
    const body = await request.json() as { expectedVersion?: unknown; decision?: unknown };
    const candidate = await FootballPublicService.decideSourceSuggestion({
      suggestionId,
      expectedVersion: body.expectedVersion,
      decision: body.decision,
    }, identity);
    return NextResponse.json({ ok: true, candidate }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Action impossible." },
      {
        status: sportsWatchErrorStatus(error),
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
