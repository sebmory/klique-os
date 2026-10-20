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
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const idempotencyKey = readIdempotencyKey(request);
    if (!body || !idempotencyKey) {
      return NextResponse.json({ error: "Requête invalide ou clé d’idempotence absente." }, { status: 400 });
    }
    const { requestId } = await params;
    const outcome = await createPartnerAthleteIntroductionService().report({
      actor,
      requestId,
      reason: String(body.reason ?? "").trim(),
      comment: String(body.comment ?? "").trim(),
      idempotencyKey,
    });
    return NextResponse.json({ outcome }, { status: outcome === "created" ? 201 : 200 });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
