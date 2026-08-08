import { NextResponse } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de variante manquant." }, { status: 400 });
    }

    const stored = await ContentStorageRepository.getVariant(id);
    if (!stored) {
      return NextResponse.json({ ok: false, message: "Variante introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      workspaceId: stored.workspaceId,
      variant: stored.variant,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lire la variante." },
      { status: 500 }
    );
  }
}
