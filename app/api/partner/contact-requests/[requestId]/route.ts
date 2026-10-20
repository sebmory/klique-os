import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import { getServerIntroductionActor, introductionErrorResponse } from "@/lib/partner-athlete-introductions/http";
import { createPartnerAthleteIntroductionService } from "@/lib/partner-athlete-introductions/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ error: "Fonction indisponible." }, { status: 404 });
  }
  try {
    const actor = await getServerIntroductionActor(request);
    if (actor?.role !== "partner_expert" || actor.status !== "active") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const { requestId } = await params;
    const contactRequest = await createPartnerAthleteIntroductionService()
      .getPartnerDetail({ actor, requestId });
    return NextResponse.json({ contactRequest });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
