import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import {
  ContentStorageValidationError,
  validateContentDocumentUpdateBody,
} from "@/lib/content-storage/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de document manquant." }, { status: 400 });
    }

    const draft = await ContentStorageRepository.getDraft(id);
    if (!draft) {
      return NextResponse.json({ ok: false, message: "Brouillon introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      workspaceId: draft.workspaceId,
      version: draft.version,
      document: draft.document,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lire le brouillon." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de document manquant." }, { status: 400 });
    }

    const body = await request.json();
    const { document, expectedVersion } = validateContentDocumentUpdateBody(body);
    if (document.id !== id) {
      return NextResponse.json({ ok: false, message: "L identifiant du document ne correspond pas a la route." }, { status: 400 });
    }

    const result = await ContentStorageRepository.updateDraft(id, document, expectedVersion);
    if (result.status === "not_found") {
      return NextResponse.json({ ok: false, message: "Brouillon introuvable." }, { status: 404 });
    }
    if (result.status === "version_conflict") {
      return NextResponse.json(
        {
          ok: false,
          message: "Conflit de version du brouillon.",
          currentVersion: result.currentVersion,
          currentDocument: result.current.document,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      workspaceId: result.draft.workspaceId,
      version: result.draft.version,
      document: result.draft.document,
    });
  } catch (error) {
    if (error instanceof ContentStorageValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de mettre a jour le brouillon." },
      { status: 500 }
    );
  }
}
