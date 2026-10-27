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

const disabledResponse = () => NextResponse.json(
  { ok: false, message: "La veille sportive est désactivée." },
  { status: 404, headers: { "Cache-Control": "private, no-store" } },
);

export async function GET(request: Request) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const [candidates, swissBindings, iwwfBindings, safvBindings, beBasketBindings] = await Promise.all([
      SportsWatchService.list(identity),
      SportsWatchService.listSwissBindings(identity),
      SportsWatchService.listIwwfBindings(identity),
      SportsWatchService.listSafvBindings(identity),
      SportsWatchService.listBeBasketBindings(identity),
    ]);
    return NextResponse.json(
      { ok: true, candidates, swissBindings, iwwfBindings, safvBindings, beBasketBindings },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de charger la veille sportive." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function POST(request: Request) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const body = await request.json() as { sourceKey?: unknown; athleteId?: unknown };
    const result = await SportsWatchService.run(body.sourceKey, body.athleteId, identity);
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lancer la veille sportive." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
