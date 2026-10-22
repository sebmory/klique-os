import { NextResponse } from "next/server";
import {
  AthleteNewsReportService,
  athleteNewsErrorStatus,
  requireAthleteNewsAdmin,
} from "@/lib/athlete-news-reports/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireAthleteNewsAdmin(request);
    const reports = await AthleteNewsReportService.listAdmin(identity);
    return NextResponse.json(
      { ok: true, reports },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de charger les signalements." },
      { status: athleteNewsErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
