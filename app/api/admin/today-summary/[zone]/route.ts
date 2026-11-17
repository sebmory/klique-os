import { NextResponse } from "next/server";
import { getDefaultCreativeAdminAccess } from "@/lib/creatives/admin-route";
import {
  completeMissionOperationalReminder,
  getTodayActionsSummary,
  getTodayDeadlines,
  getTodayMissionReminders,
} from "@/lib/admin-today-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ zone: string }> },
) {
  const access = await getDefaultCreativeAdminAccess(request);
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (!access?.clerkUserId) {
    return NextResponse.json({ error: "Session expirée." }, { status: 401, headers: noStore });
  }
  if (access.role !== "admin" || access.status !== "active" || !workspaceId) {
    return NextResponse.json(
      { error: "Cette page est réservée aux Administrateurs." },
      { status: 403, headers: noStore },
    );
  }

  const { zone } = await params;
  try {
    if (zone === "actions") {
      return NextResponse.json(await getTodayActionsSummary(workspaceId), { headers: noStore });
    }
    if (zone === "deadlines") {
      return NextResponse.json({ items: await getTodayDeadlines(workspaceId) }, { headers: noStore });
    }
    if (zone === "reminders") {
      return NextResponse.json({ items: await getTodayMissionReminders(workspaceId) }, {
        headers: noStore,
      });
    }
    if (zone === "quick-access") {
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    return NextResponse.json({ error: "Zone inconnue." }, { status: 404, headers: noStore });
  } catch {
    return NextResponse.json(
      { error: "Impossible de charger cette zone." },
      { status: 500, headers: noStore },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ zone: string }> },
) {
  const access = await getDefaultCreativeAdminAccess(request);
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (!access?.clerkUserId) {
    return NextResponse.json({ error: "Session expirée." }, { status: 401, headers: noStore });
  }
  if (access.role !== "admin" || access.status !== "active" || !workspaceId) {
    return NextResponse.json(
      { error: "Cette page est réservée aux Administrateurs." },
      { status: 403, headers: noStore },
    );
  }
  const { zone } = await params;
  if (zone !== "reminders") {
    return NextResponse.json({ error: "Zone inconnue." }, { status: 404, headers: noStore });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sourceId = typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
  if (body?.action !== "complete" || !sourceId) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400, headers: noStore });
  }
  try {
    const completed = await completeMissionOperationalReminder({ workspaceId, sourceId });
    return NextResponse.json({ completed }, {
      status: completed ? 200 : 404,
      headers: noStore,
    });
  } catch (error) {
    console.error("[admin_today][complete_reminder_failed]", {
      type: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { error: "Impossible de terminer ce rappel." },
      { status: 500, headers: noStore },
    );
  }
}
