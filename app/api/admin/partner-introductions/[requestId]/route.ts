import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import { resolveIntroductionStaleDays } from "@/lib/partner-athlete-introductions/domain";
import {
  getServerIntroductionActor,
  introductionErrorResponse,
  readIdempotencyKey,
} from "@/lib/partner-athlete-introductions/http";
import { schedulePartnerIntroductionOutboxAfterResponse } from "@/lib/partner-athlete-introductions/outbox-after-response";
import { createPartnerAthleteIntroductionService } from "@/lib/partner-athlete-introductions/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ requestId: string }> };

export async function GET(request: Request, { params }: Context) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ error: "Fonction indisponible." }, { status: 404 });
  }
  try {
    const actor = await getServerIntroductionActor(request);
    if (actor?.role !== "admin" || actor.status !== "active") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const { requestId } = await params;
    const contactRequest = await createPartnerAthleteIntroductionService().getAdminDetail({
      actor,
      requestId,
      staleDays: resolveIntroductionStaleDays(process.env.PARTNER_REQUEST_STALE_DAYS),
    });
    return NextResponse.json({ contactRequest });
  } catch (error) {
    return introductionErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
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
    const { requestId } = await params;
    const service = createPartnerAthleteIntroductionService();
    if (body.action === "activate_historical") {
      const result = await service.activateHistorical({
        actor,
        requestId,
        idempotencyKey,
      });
      if (result.outcome === "transitioned") {
        schedulePartnerIntroductionOutboxAfterResponse();
      }
      return NextResponse.json({ outcome: result.outcome });
    }
    if (body.action === "suspend" || body.action === "reactivate") {
      const result = await service.moderate({
        actor,
        requestId,
        action: body.action,
        reason: String(body.reason ?? "").trim(),
        idempotencyKey,
      });
      return NextResponse.json({ outcome: result.outcome });
    }
    if (body.action === "set_solicitation") {
      const detail = await service.getAdminDetail({
        actor,
        requestId,
        staleDays: resolveIntroductionStaleDays(process.env.PARTNER_REQUEST_STALE_DAYS),
      });
      await service.setPartnerSolicitation({
        actor,
        partnerId: detail.partnerId,
        canSolicit: body.canSolicit === true,
        reason: String(body.reason ?? "").trim(),
        idempotencyKey,
      });
      return NextResponse.json({ outcome: "updated" });
    }
    return NextResponse.json(
      { error: "Action Admin non autorisée. L’acceptation et le refus appartiennent à l’athlète." },
      { status: 400 },
    );
  } catch (error) {
    return introductionErrorResponse(error);
  }
}
