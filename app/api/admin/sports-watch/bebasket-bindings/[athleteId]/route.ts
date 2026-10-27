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

type RouteContext = { params: Promise<{ athleteId: string }> };

const disabledResponse = () => NextResponse.json(
  { ok: false, message: "La veille sportive est désactivée." },
  { status: 404, headers: { "Cache-Control": "private, no-store" } },
);

export async function PUT(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { athleteId } = await context.params;
    const body = await request.json() as {
      calendarUrl?: unknown;
      teamName?: unknown;
      playerName?: unknown;
      expectedVersion?: unknown;
    };
    const binding = await SportsWatchService.confirmBeBasketBinding(
      athleteId,
      body.calendarUrl,
      body.teamName,
      body.playerName,
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
        message: error instanceof Error ? error.message : "Impossible de confirmer le rattachement BeBasket.",
      },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { athleteId } = await context.params;
    const body = await request.json() as { expectedVersion?: unknown };
    const binding = await SportsWatchService.disableBeBasketBinding(
      athleteId,
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
        message: error instanceof Error ? error.message : "Impossible de désactiver le rattachement BeBasket.",
      },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
