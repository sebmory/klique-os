import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import { FootballPublicService } from "@/lib/sports-watch/football-public-service";
import {
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ candidateId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) {
    return NextResponse.json(
      { ok: false, message: "La veille sportive est désactivée." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { candidateId } = await context.params;
    const body = await request.json() as {
      action?: unknown;
      expectedVersion?: unknown;
      resolution?: unknown;
      entry?: unknown;
    };
    const candidate = body.action === "complete"
      ? await FootballPublicService.completeCandidate(
          candidateId,
          body.expectedVersion,
          body.entry,
          identity,
        )
      : body.action === "resolve"
        ? await FootballPublicService.resolveCandidate(
            candidateId,
            body.expectedVersion,
            body.resolution,
            identity,
          )
        : null;
    if (!candidate) {
      return NextResponse.json(
        { ok: false, message: "L’action football est invalide." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, candidate },
      { headers: { "Cache-Control": "private, no-store" } },
    );
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
