import { get } from "@vercel/blob";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import { getAthleteNewsBlobToken } from "@/lib/athlete-news-reports/photo";
import { SportsWatchImportService } from "@/lib/sports-watch/import-service";
import {
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ importId: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isSportsWatchEnabled()) {
    return Response.json(
      { ok: false, message: "La veille sportive est désactivée." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const identity = await requireSportsWatchAdmin(request);
    const { importId } = await context.params;
    const imported = await SportsWatchImportService.get(importId, identity);
    const blob = await get(imported.blobPathname, {
      access: "private",
      useCache: false,
      token: getAthleteNewsBlobToken(),
    });
    if (!blob?.stream) {
      return new Response("Document introuvable.", { status: 404 });
    }
    const filename = imported.originalFilename.replace(/["\r\n]/g, "_");
    return new Response(blob.stream, {
      headers: {
        "Content-Type": imported.contentType,
        "Content-Length": String(imported.sizeBytes),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Document inaccessible.",
      },
      { status: sportsWatchErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
