import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import {
  ContentStorageValidationError,
  validateStoredInterviewResultWriteBody,
} from "@/lib/content-storage/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, session, expiresAt } = validateStoredInterviewResultWriteBody(body);
    const stored = await ContentStorageRepository.createSession(sessionId, session, expiresAt);

    return NextResponse.json({
      ok: true,
      workspaceId: stored.workspaceId,
      sessionId: stored.sessionId,
      expiresAt: stored.expiresAt,
      session: stored.session,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ContentStorageValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de creer la session." },
      { status: 500 }
    );
  }
}
