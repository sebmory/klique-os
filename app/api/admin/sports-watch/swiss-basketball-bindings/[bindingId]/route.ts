import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import {
  SportsWatchService,
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ bindingId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) {
    return NextResponse.json(
      { ok: false, message: "La veille sportive est désactivée." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { bindingId } = await context.params;
    const body = await request.json() as { expectedVersion?: unknown };
    const binding = await SportsWatchService.disableSwissBasketballBinding(
      bindingId,
      body.expectedVersion,
      identity,
    );
    return NextResponse.json(
      { ok: true, binding },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error
          ? error.message
          : "Impossible de désactiver le rattachement Swiss Basketball.",
      },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
