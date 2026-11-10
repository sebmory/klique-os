import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import { FootballPublicService } from "@/lib/sports-watch/football-public-service";
import {
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ reconciliationId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) {
    return NextResponse.json(
      { ok: false, message: "La veille sportive est désactivée." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { reconciliationId } = await context.params;
    const body = await request.json() as { decision?: unknown; expectedVersion?: unknown };
    const reconciliation = await FootballPublicService.decideReconciliation({
      reconciliationId,
      decision: body.decision,
      expectedVersion: body.expectedVersion,
    }, identity);
    return NextResponse.json(
      { ok: true, reconciliation },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Décision impossible." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
