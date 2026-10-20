import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import { getServerIntroductionActor, introductionErrorResponse } from "@/lib/partner-athlete-introductions/http";
import { createPartnerAthleteIntroductionService } from "@/lib/partner-athlete-introductions/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ workflowEnabled: false, contactRequests: [] });
  }
  try {
    const actor = await getServerIntroductionActor(request);
    if (actor?.role !== "athlete" || actor.status !== "active" || !actor.athleteId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const contactRequests = await createPartnerAthleteIntroductionService()
      .listForAthlete({ actor });
    return NextResponse.json({ workflowEnabled: true, contactRequests });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
