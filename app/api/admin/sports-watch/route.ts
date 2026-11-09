import { NextResponse } from "next/server";
import {
  isScheduledSportsWatchRefreshEnabled,
  isSportsWatchEnabled,
} from "@/lib/sports-watch/activation";
import { PostgresSportsWatchRefreshRepository } from "@/lib/sports-watch/refresh-repository";
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
    const url = new URL(request.url);
    const allowedParameters = new Set(["group", "cursor", "limit"]);
    const unknownParameter = [...url.searchParams.keys()]
      .find((parameter) => !allowedParameters.has(parameter));
    if (unknownParameter) {
      return NextResponse.json(
        { ok: false, message: `Le paramètre « ${unknownParameter} » n’est pas reconnu.` },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const duplicateParameter = [...allowedParameters]
      .find((parameter) => url.searchParams.getAll(parameter).length > 1);
    if (duplicateParameter) {
      return NextResponse.json(
        { ok: false, message: `Le paramètre « ${duplicateParameter} » ne peut être répété.` },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const group = url.searchParams.get("group");
    if (group) {
      const page = await SportsWatchService.listPage(
        group,
        url.searchParams.get("cursor"),
        url.searchParams.get("limit"),
        identity,
      );
      return NextResponse.json(
        { ok: true, page },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (url.searchParams.has("cursor")) {
      return NextResponse.json(
        { ok: false, message: "Un groupe est requis avec un curseur de pagination." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const [
      candidateDashboard,
      swissBindings,
      iwwfBindings,
      safvBindings,
      beBasketBindings,
      swissBasketballBindings,
      latestRefresh,
    ] = await Promise.all([
      SportsWatchService.dashboard(identity, url.searchParams.get("limit")),
      SportsWatchService.listSwissBindings(identity),
      SportsWatchService.listIwwfBindings(identity),
      SportsWatchService.listSafvBindings(identity),
      SportsWatchService.listBeBasketBindings(identity),
      SportsWatchService.listSwissBasketballBindings(identity),
      isScheduledSportsWatchRefreshEnabled()
        ? PostgresSportsWatchRefreshRepository.getLatestBatch(identity.workspaceId)
        : Promise.resolve(null),
    ]);
    return NextResponse.json(
      {
        ok: true,
        workspaceId: identity.workspaceId,
        candidateDashboard,
        candidates: [
          ...candidateDashboard.pages.pending.items,
          ...candidateDashboard.pages.validated.items,
          ...candidateDashboard.pages.history.items,
        ],
        swissBindings,
        iwwfBindings,
        safvBindings,
        beBasketBindings,
        swissBasketballBindings,
        latestRefresh,
      },
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
