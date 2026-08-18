import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import {
  ContentStorageValidationError,
  validateContentDocumentWriteBody,
} from "@/lib/content-storage/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const drafts = await ContentStorageRepository.listDrafts(access);

    return NextResponse.json({
      ok: true,
      drafts: drafts.map((draft) => ({
        document: draft.document,
        version: draft.version,
        workspaceId: draft.workspaceId,
      })),
    });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lister les brouillons." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const body = await request.json();
    const document = validateContentDocumentWriteBody(body);
    const draft = await ContentStorageRepository.createDraft(document, access);

    return NextResponse.json({
      ok: true,
      workspaceId: draft.workspaceId,
      version: draft.version,
      document: draft.document,
    }, { status: 201 });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof ContentStorageValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de creer le brouillon." },
      { status: 500 }
    );
  }
}
