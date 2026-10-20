import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import {
  getServerIntroductionActor,
  introductionErrorResponse,
  readIdempotencyKey,
} from "@/lib/partner-athlete-introductions/http";
import { createPartnerAthleteIntroductionService } from "@/lib/partner-athlete-introductions/service";
import type { IntroductionReportStatus } from "@/lib/partner-athlete-introductions/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string; reportId: string }> },
) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ error: "Fonction indisponible." }, { status: 404 });
  }
  try {
    const actor = await getServerIntroductionActor(request);
    if (actor?.role !== "admin" || actor.status !== "active") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const idempotencyKey = readIdempotencyKey(request);
    if (!body || !idempotencyKey) {
      return NextResponse.json({ error: "Requête invalide ou clé d’idempotence absente." }, { status: 400 });
    }
    const { requestId, reportId } = await params;
    const outcome = await createPartnerAthleteIntroductionService().handleReport({
      actor,
      requestId,
      reportId,
      status: String(body.status ?? "") as Exclude<IntroductionReportStatus, "open">,
      note: String(body.note ?? "").trim(),
      idempotencyKey,
    });
    return NextResponse.json({ outcome });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
