import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import {
  ContentStorageValidationError,
  validateContentDocumentWriteBody,
} from "@/lib/content-storage/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const document = validateContentDocumentWriteBody(body);
    const draft = await ContentStorageRepository.createDraft(document);

    return NextResponse.json({
      ok: true,
      workspaceId: draft.workspaceId,
      version: draft.version,
      document: draft.document,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ContentStorageValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de creer le brouillon." },
      { status: 500 }
    );
  }
}
