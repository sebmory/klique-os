import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de variante manquant." }, { status: 400 });
    }

    const stored = await ContentStorageRepository.getVariant(id, access);
    if (!stored) {
      return NextResponse.json({ ok: false, message: "Variante introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      workspaceId: stored.workspaceId,
      variant: stored.variant,
    });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lire la variante." },
      { status: 500 }
    );
  }
}
