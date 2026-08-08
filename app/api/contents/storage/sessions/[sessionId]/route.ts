import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    if (!sessionId?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de session manquant." }, { status: 400 });
    }

    const stored = await ContentStorageRepository.getSession(sessionId);
    if (!stored) {
      return NextResponse.json({ ok: false, message: "Session introuvable." }, { status: 404 });
    }

    const expired = new Date(stored.expiresAt).getTime() < Date.now();
    if (expired) {
      return NextResponse.json({ ok: false, message: "Session expiree." }, { status: 410 });
    }

    return NextResponse.json({
      ok: true,
      workspaceId: stored.workspaceId,
      sessionId: stored.sessionId,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      session: stored.session,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lire la session." },
      { status: 500 }
    );
  }
}
