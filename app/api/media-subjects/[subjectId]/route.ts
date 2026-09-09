import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { getMediaSubjectById } from "@/lib/media-subjects/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ subjectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const access = await requireContentAccess(request);
    const { subjectId } = await context.params;
    const subject = await getMediaSubjectById(access, subjectId);

    if (!subject) {
      return NextResponse.json({ ok: false, message: "Sujet introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, subject });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error(`[media_subjects] ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, message: "Impossible de lire le sujet media." }, { status: 500 });
  }
}
