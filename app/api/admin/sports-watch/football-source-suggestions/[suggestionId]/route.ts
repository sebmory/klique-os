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
    const status = sportsWatchErrorStatus(error);
    if (status === 500) {
      const databaseError = error && typeof error === "object"
        ? error as { code?: unknown; constraint?: unknown; name?: unknown }
        : null;
      console.error("[sports_watch][football_source_attachment_failed]", {
        code: typeof databaseError?.code === "string" ? databaseError.code : null,
        constraint: typeof databaseError?.constraint === "string"
          ? databaseError.constraint
          : null,
        name: typeof databaseError?.name === "string" ? databaseError.name : null,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        message: status !== 500 && error instanceof Error
          ? error.message
          : "Impossible de rattacher la source publique. Aucune modification n’a été enregistrée.",
      },
      {
        status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
