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

export async function POST(request: Request) {
  if (!isSportsWatchEnabled()) {
    return NextResponse.json(
      { ok: false, message: "La veille sportive est désactivée." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const identity = await requireSportsWatchAdmin(request);
    const body = await request.json() as {
      athleteId?: unknown;
      seasonId?: unknown;
      leagueId?: unknown;
      teamId?: unknown;
      officialPlayerId?: unknown;
      officialPlayerName?: unknown;
    };
    const verification = await SportsWatchService.verifySwissBasketballBinding(
      body.athleteId,
      body.seasonId,
      body.leagueId,
      body.teamId,
      body.officialPlayerId,
      body.officialPlayerName,
      identity,
    );
    return NextResponse.json(
      { ok: true, verification },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error
          ? error.message
          : "Impossible de vérifier le rattachement Swiss Basketball.",
      },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
