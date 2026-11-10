import { NextResponse } from "next/server";
import { getDefaultCreativeAdminAccess } from "@/lib/creatives/admin-route";
import {
  getTodayActionsSummary,
  getTodayDeadlines,
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
