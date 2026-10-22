import { NextRequest, NextResponse } from "next/server";
import {
  AthleteNewsReportService,
  athleteNewsErrorStatus,
  requireAthleteNewsAdmin,
} from "@/lib/athlete-news-reports/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const identity = await requireAthleteNewsAdmin(request);
    const { reportId } = await context.params;
    const prefill = await AthleteNewsReportService.buildArticlePrefill(reportId, identity);
    return NextResponse.json(
      { ok: true, prefill },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Signalement inaccessible." },
      { status: athleteNewsErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const identity = await requireAthleteNewsAdmin(request);
    const { reportId } = await context.params;
    const body = await request.json() as { status?: unknown; version?: unknown };
    const report = await AthleteNewsReportService.updateStatus(
      reportId,
      body.status,
      body.version,
      identity,
    );
    return NextResponse.json(
      { ok: true, report },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de modifier le signalement." },
      { status: athleteNewsErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
