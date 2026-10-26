import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import {
  SportsWatchService,
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ candidateId: string }> };

const disabledResponse = () => NextResponse.json(
  { ok: false, message: "La veille sportive est désactivée." },
  { status: 404, headers: { "Cache-Control": "private, no-store" } },
);

export async function GET(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { candidateId } = await context.params;
    const prefill = await SportsWatchService.buildArticlePrefill(candidateId, identity);
    return NextResponse.json(
      { ok: true, prefill },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Candidat inaccessible." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { candidateId } = await context.params;
    const body = await request.json() as { status?: unknown; version?: unknown };
    const candidate = await SportsWatchService.review(
      candidateId,
      body.status,
      body.version,
      identity,
    );
    return NextResponse.json(
      { ok: true, candidate },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de modifier le candidat." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
