import { get } from "@vercel/blob";
import { getAthleteNewsBlobToken } from "@/lib/athlete-news-reports/photo";
import {
  athleteNewsErrorStatus,
  getAccessibleAthleteNewsPhoto,
} from "@/lib/athlete-news-reports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { reportId } = await context.params;
    const photo = await getAccessibleAthleteNewsPhoto(reportId, request);
    const blob = await get(photo.pathname, {
      access: "private",
      useCache: false,
      token: getAthleteNewsBlobToken(),
    });
    if (!blob || !blob.stream) return new Response("Photo introuvable.", { status: 404 });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Photo inaccessible." },
      { status: athleteNewsErrorStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
