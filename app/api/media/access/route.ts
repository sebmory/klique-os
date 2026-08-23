import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const accessContext = await requireContentAccess(request);
    if (!accessContext.isAdmin) {
      return NextResponse.json({ ok: false, message: "Acces refuse." }, { status: 403 });
    }

    const sql = createContentStorageClient();
    const rows = (await sql`
      SELECT clerk_user_id, email
      FROM user_access
      WHERE workspace_id = ${accessContext.workspaceId}
        AND role = 'media'
        AND status = 'active'
      ORDER BY lower(btrim(email))
    `) as Record<string, unknown>[];

    return NextResponse.json({
      ok: true,
      media: rows.map((row) => ({
        clerkUserId: String(row.clerk_user_id ?? ""),
        email: typeof row.email === "string" ? row.email : null,
      })),
    });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error("[media_access] Failed to list active media accounts", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ ok: false, message: "Impossible de lister les medias actifs." }, { status: 500 });
  }
}
