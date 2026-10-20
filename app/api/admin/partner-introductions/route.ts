import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import { resolveIntroductionStaleDays } from "@/lib/partner-athlete-introductions/domain";
import { getServerIntroductionActor, introductionErrorResponse } from "@/lib/partner-athlete-introductions/http";
import { createPartnerAthleteIntroductionService } from "@/lib/partner-athlete-introductions/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ workflowEnabled: false, items: [], counters: {} });
  }
  try {
    const actor = await getServerIntroductionActor(request);
    if (actor?.role !== "admin" || actor.status !== "active") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const url = new URL(request.url);
    const result = await createPartnerAthleteIntroductionService().listForAdmin({
      actor,
      status: url.searchParams.get("status"),
      moderationStatus: url.searchParams.get("moderationStatus"),
      staleOnly: url.searchParams.get("stale") === "true",
      reportedOnly: url.searchParams.get("reported") === "true",
      historicalOnly: url.searchParams.get("historical") === "true",
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 20),
      staleDays: resolveIntroductionStaleDays(process.env.PARTNER_REQUEST_STALE_DAYS),
    });
    return NextResponse.json({ workflowEnabled: true, ...result });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
