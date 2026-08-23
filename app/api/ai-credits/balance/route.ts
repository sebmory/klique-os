import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getAiCreditBalance } from "@/lib/ai-usage/credit-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const accessContext = await requireContentAccess(request);
    const url = new URL(request.url);

    let clerkUserId: string;

    if (accessContext.isAdmin) {
      const requestedClerkUserId = url.searchParams.get("clerkUserId")?.trim() ?? "";
      if (!requestedClerkUserId) {
        return NextResponse.json({ ok: false, message: "clerkUserId requis." }, { status: 400 });
      }

      const sql = createContentStorageClient();
      const targetRows = (await sql`
        SELECT role, status
        FROM user_access
        WHERE clerk_user_id = ${requestedClerkUserId}
          AND workspace_id = ${accessContext.workspaceId}
      `) as Record<string, unknown>[];

      const target = targetRows[0];
      if (!target || target.status !== "active" || target.role !== "media") {
        return NextResponse.json(
          { ok: false, message: "Cible invalide: utilisateur media actif requis dans ce workspace." },
          { status: 400 }
        );
      }

      clerkUserId = requestedClerkUserId;
    } else {
      clerkUserId = accessContext.clerkUserId;
    }

    const balance = await getAiCreditBalance({
      workspaceId: accessContext.workspaceId,
      clerkUserId,
    });

    if (!balance.hasActivePeriod) {
      return NextResponse.json({ ok: true, period: null, balance: 0 });
    }

    return NextResponse.json({
      ok: true,
      period: {
        id: balance.periodId,
        periodStart: new Date(balance.periodStart as string).toISOString(),
        periodEnd: new Date(balance.periodEnd as string).toISOString(),
        creditsGranted: balance.creditsGranted,
      },
      balance: balance.currentBalance,
    });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error("[ai_credits] Failed to read credit balance", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ ok: false, message: "Impossible de lire le solde de credits." }, { status: 500 });
  }
}
