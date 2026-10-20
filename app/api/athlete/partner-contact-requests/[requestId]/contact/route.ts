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
    if (actor?.role !== "athlete" || actor.status !== "active") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const { requestId } = await params;
    const contact = await createPartnerAthleteIntroductionService()
      .presentAthleteContact({ actor, requestId });
    if (!contact) {
      return NextResponse.json(
        { error: "Aucun compte Instagram valide n’est disponible ou la demande n’est plus en attente." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      contact: {
        channel: contact.channel,
        displayValue: contact.value,
        contactReference: contact.reference,
      },
    });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
