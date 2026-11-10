import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import { FootballPublicService } from "@/lib/sports-watch/football-public-service";
import {
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
    return NextResponse.json(
      { ok: true, ...await FootballPublicService.list(identity) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Chargement impossible." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function POST(request: Request) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const body = await request.json() as { athleteId?: unknown; teamId?: unknown };
    const discovery = await FootballPublicService.discover(
      body.athleteId,
      body.teamId,
      identity,
    );
    return NextResponse.json(
      { ok: true, discovery },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Découverte impossible." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function PUT(request: Request) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const body = await request.json() as Parameters<typeof FootballPublicService.saveBinding>[0];
    const binding = await FootballPublicService.saveBinding(body, identity);
    return NextResponse.json(
      { ok: true, binding },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Enregistrement impossible." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const body = await request.json() as { athleteId?: unknown; expectedVersion?: unknown };
    const binding = await FootballPublicService.disableBinding(
      body.athleteId,
      body.expectedVersion,
      identity,
    );
    return NextResponse.json(
      { ok: true, binding },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Désactivation impossible." },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
