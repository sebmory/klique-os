import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isScheduledSportsWatchRefreshEnabled,
  isSportsWatchEnabled,
} from "@/lib/sports-watch/activation";
import { ScheduledSportsWatchRefresh } from "@/lib/sports-watch/scheduled-refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const authorized = (request: Request): boolean => {
  const configured = process.env.CRON_SECRET?.trim() ?? "";
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!configured || !header.startsWith("Bearer ")) return false;
  const expected = Buffer.from(configured);
  const supplied = Buffer.from(header.slice("Bearer ".length));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
};

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  if (!isSportsWatchEnabled() || !isScheduledSportsWatchRefreshEnabled()) {
    return new Response(null, { status: 204 });
  }
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  try {
    if (mode === "schedule") {
      return NextResponse.json({ mode, results: await ScheduledSportsWatchRefresh.schedule() });
    }
    if (mode === "work") {
      if (url.searchParams.get("slot") === "01") {
        await ScheduledSportsWatchRefresh.schedule();
      }
      return NextResponse.json({ mode, result: await ScheduledSportsWatchRefresh.work() });
    }
    if (mode === "finalize") {
      return NextResponse.json({
        mode,
        finalizedCount: await ScheduledSportsWatchRefresh.finalize(),
      });
    }
    return NextResponse.json({ error: "Mode de tâche invalide." }, { status: 400 });
  } catch (error) {
    console.error("[sports_watch_scheduled_refresh] execution=failed", {
      mode,
      error,
    });
    return NextResponse.json(
      { error: "L’actualisation planifiée n’a pas pu être exécutée." },
      { status: 500 },
    );
  }
}
