import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { addAiCreditAdjustment } from "@/lib/ai-usage/credit-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!idempotencyKey) {
      return NextResponse.json({ ok: false, message: "idempotencyKey requis." }, { status: 400 });
    }

    const creditDelta = Number(body.creditDelta);
    if (!Number.isInteger(creditDelta) || creditDelta === 0) {
      return NextResponse.json({ ok: false, message: "creditDelta doit etre un entier non nul." }, { status: 400 });
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

    const result = await addAiCreditAdjustment({
      workspaceId: accessContext.workspaceId,
      clerkUserId,
      creditDelta,
      idempotencyKey,
      operation: "admin_credit_adjustment",
    });

    if (result.status === "adjusted") {
      return NextResponse.json({
        ok: true,
        status: result.status,
        transactionId: result.transactionId,
        periodId: result.periodId,
        remainingBalance: result.remainingBalance,
      });
    }

    if (result.status === "already_adjusted") {
      return NextResponse.json({ ok: true, status: result.status, transactionId: result.transactionId });
    }

    if (result.status === "insufficient_credits") {
      return NextResponse.json(
        { ok: false, status: result.status, periodId: result.periodId, currentBalance: result.currentBalance, message: "Solde insuffisant pour cet ajustement." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, status: result.status, message: "Aucune periode de credits active pour ce media." },
      { status: 400 }
    );
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[ai_credits] Failed to apply credit adjustment: ${reason}`);
    return NextResponse.json({ ok: false, message: "Impossible d appliquer l ajustement de credits." }, { status: 500 });
  }
}
