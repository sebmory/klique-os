import { NextRequest, NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import {
  ContentStorageValidationError,
  validateContentVariantWriteBody,
} from "@/lib/content-storage/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sourceDocumentId = request.nextUrl.searchParams.get("sourceDocumentId")?.trim() || "";
    if (!sourceDocumentId) {
      return NextResponse.json({ ok: false, message: "sourceDocumentId est obligatoire." }, { status: 400 });
    }

    const variants = await ContentStorageRepository.listVariantsBySourceDocumentId(sourceDocumentId);
    return NextResponse.json({ ok: true, sourceDocumentId, variants });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lister les variantes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const variant = validateContentVariantWriteBody(body);
    const stored = await ContentStorageRepository.createVariant(variant);

    return NextResponse.json({
      ok: true,
      workspaceId: stored.workspaceId,
      variant: stored.variant,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ContentStorageValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de creer la variante." },
      { status: 500 }
    );
  }
}
