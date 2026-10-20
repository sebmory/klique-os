import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import {
  getServerIntroductionActor,
  introductionErrorResponse,
  readIdempotencyKey,
} from "@/lib/partner-athlete-introductions/http";
import { createPartnerAthleteIntroductionService } from "@/lib/partner-athlete-introductions/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ error: "Fonction indisponible." }, { status: 404 });
  }
  try {
    const actor = await getServerIntroductionActor(request);
    if (actor?.role !== "athlete" || actor.status !== "active") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const idempotencyKey = readIdempotencyKey(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!idempotencyKey || !body || (body.decision !== "accept" && body.decision !== "decline")) {
      return NextResponse.json({ error: "Requête invalide ou clé d’idempotence absente." }, { status: 400 });
    }
    const { requestId } = await params;
    const result = await createPartnerAthleteIntroductionService().respond({
      actor,
      requestId,
      payload: {
        decision: body.decision,
        confirmedContact: String(body.confirmedContact ?? "").trim() || null,
        contactReference: String(body.contactReference ?? "").trim() || null,
      },
      idempotencyKey,
    });
    return NextResponse.json({
      contactRequest: result.request
        ? {
            id: result.request.id,
            status: result.request.status,
            respondedAt: result.request.respondedAt,
          }
        : null,
      replay: result.outcome === "replay",
    });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
