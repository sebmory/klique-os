import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { createAiCreditPeriod } from "@/lib/ai-usage/credit-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isValidIsoDate = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
};

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
    const periodStart = body.periodStart;
    const periodEnd = body.periodEnd;
    const creditsGrantedRaw = body.creditsGranted;

    if (!clerkUserId) {
      return NextResponse.json({ ok: false, message: "clerkUserId requis." }, { status: 400 });
    }

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

    const creditsGranted = Number(creditsGrantedRaw);
    if (!Number.isFinite(creditsGranted) || !Number.isInteger(creditsGranted) || creditsGranted < 0) {
      return NextResponse.json(
        { ok: false, message: "creditsGranted doit etre un entier positif ou nul." },
        { status: 400 }
      );
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

    const periodId = await createAiCreditPeriod({
      workspaceId: accessContext.workspaceId,
      clerkUserId,
      periodStart,
      periodEnd,
      creditsGranted,
    });

    return NextResponse.json(
      {
        ok: true,
        period: {
          id: periodId,
          workspaceId: accessContext.workspaceId,
          clerkUserId,
          periodStart,
          periodEnd,
          creditsGranted,
          status: "active",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const message = error instanceof Error ? error.message : "unknown error";
    if (message.includes("duplicate key value") || message.includes("ai_credit_periods_workspace_id_clerk_user_id_period_start")) {
      return NextResponse.json(
        { ok: false, message: "Une periode existe deja pour cet utilisateur a cette date de debut." },
        { status: 409 }
      );
    }

    console.error("[ai_credits] Failed to create credit period", { message });
    return NextResponse.json({ ok: false, message: "Impossible de creer la periode de credits." }, { status: 500 });
  }
}
