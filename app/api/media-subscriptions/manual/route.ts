import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getMediaSubscriptionPlan } from "@/lib/media-subscriptions/plans";
import { activateManualMediaSubscription, getMediaSubscription } from "@/lib/media-subscriptions/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isValidIsoDate = (value: string): boolean => value.length > 0 && Number.isFinite(Date.parse(value));

export async function POST(request: Request) {
  try {
    const accessContext = await requireContentAccess(request);
    if (!accessContext.isAdmin) {
      return NextResponse.json({ ok: false, message: "Acces refuse." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const clerkUserId = typeof body.clerkUserId === "string" ? body.clerkUserId.trim() : "";
    if (!clerkUserId) {
      return NextResponse.json({ ok: false, message: "clerkUserId requis." }, { status: 400 });
    }

    const planCode = typeof body.planCode === "string" ? body.planCode.trim() : "";
    if (!planCode || !getMediaSubscriptionPlan(planCode)) {
      return NextResponse.json({ ok: false, message: "planCode invalide." }, { status: 400 });
    }

    const existingCreditPeriodIdRaw = body.existingCreditPeriodId;
    const hasExistingCreditPeriodId = existingCreditPeriodIdRaw !== undefined && existingCreditPeriodIdRaw !== null;
    const existingCreditPeriodId = typeof existingCreditPeriodIdRaw === "string" ? existingCreditPeriodIdRaw.trim() : "";
    if (hasExistingCreditPeriodId && !existingCreditPeriodId) {
      return NextResponse.json(
        { ok: false, message: "existingCreditPeriodId doit etre une chaine non vide." },
        { status: 400 }
      );
    }

    const periodStart = typeof body.periodStart === "string" ? body.periodStart.trim() : "";
    const periodEnd = typeof body.periodEnd === "string" ? body.periodEnd.trim() : "";

    if (!existingCreditPeriodId) {
      if (!isValidIsoDate(periodStart) || !isValidIsoDate(periodEnd)) {
        return NextResponse.json(
          { ok: false, message: "periodStart/periodEnd invalides (format ISO requis)." },
          { status: 400 }
        );
      }

      if (Date.parse(periodStart) >= Date.parse(periodEnd)) {
        return NextResponse.json(
          { ok: false, message: "periodStart doit etre anterieur a periodEnd." },
          { status: 400 }
        );
      }
    }

    const sql = createContentStorageClient();
    const targetRows = (await sql`
      SELECT role, status
      FROM user_access
      WHERE clerk_user_id = ${clerkUserId}
        AND workspace_id = ${accessContext.workspaceId}
    `) as Record<string, unknown>[];

    const target = targetRows[0];
    if (!target || target.status !== "active" || target.role !== "media") {
      return NextResponse.json(
        { ok: false, message: "Cible invalide: utilisateur media actif requis dans ce workspace." },
        { status: 400 }
      );
    }

    const result = await activateManualMediaSubscription({
      workspaceId: accessContext.workspaceId,
      clerkUserId,
      planCode,
      ...(existingCreditPeriodId ? { existingCreditPeriodId } : { periodStart, periodEnd }),
    });

    if (result.status === "period_conflict") {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          conflictingPeriodId: result.conflictingPeriodId,
          message: "Une periode de credits incompatible chevauche deja cette periode.",
        },
        { status: 409 }
      );
    }

    if (result.status === "provider_conflict") {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          subscriptionId: result.subscriptionId,
          message: "Cet abonnement est gere par un fournisseur de paiement et ne peut pas etre active manuellement.",
        },
        { status: 409 }
      );
    }

    const subscription = await getMediaSubscription({
      workspaceId: accessContext.workspaceId,
      clerkUserId,
    });

    if (result.status === "already_active") {
      return NextResponse.json({
        ok: true,
        status: result.status,
        subscriptionId: result.subscriptionId,
        subscription,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        status: result.status,
        subscriptionId: result.subscriptionId,
        periodId: result.periodId,
        planCode: result.planCode,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        creditsGranted: result.creditsGranted,
        subscription,
      },
      { status: 201 }
    );
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[media_subscriptions] Failed to activate manual subscription: ${reason}`);
    return NextResponse.json({ ok: false, message: "Impossible d activer l abonnement media." }, { status: 500 });
  }
}
