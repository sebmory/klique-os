import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import {
  StoryStudioBrandKitAssetError,
  StoryStudioBrandKitRepository,
} from "@/lib/story-studio/brand-kit-repository";
import {
  StoryStudioBrandKitValidationError,
  validateStoryStudioBrandKitId,
  validateStoryStudioBrandKitUpdate,
} from "@/lib/story-studio/brand-kit-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ brandKitId: string }> };

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "23505";

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const brandKitId = validateStoryStudioBrandKitId((await params).brandKitId);
    const brandKit = await StoryStudioBrandKitRepository.getById(brandKitId, access);
    if (!brandKit) return NextResponse.json({ ok: false, message: "Brand Kit introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true, brandKit });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof StoryStudioBrandKitValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: "Impossible de lire le Brand Kit." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const brandKitId = validateStoryStudioBrandKitId((await params).brandKitId);
    const input = validateStoryStudioBrandKitUpdate(await request.json());
    const brandKit = await StoryStudioBrandKitRepository.update(brandKitId, input, access);
    if (!brandKit) return NextResponse.json({ ok: false, message: "Brand Kit introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true, brandKit });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof StoryStudioBrandKitValidationError || error instanceof StoryStudioBrandKitAssetError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json({ ok: false, message: "Un Brand Kit porte deja ce nom." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: "Impossible de modifier le Brand Kit." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const brandKitId = validateStoryStudioBrandKitId((await params).brandKitId);
    const result = await StoryStudioBrandKitRepository.remove(brandKitId, access);
    if (result === "not_found") return NextResponse.json({ ok: false, message: "Brand Kit introuvable." }, { status: 404 });
    if (result === "default_protected") {
      return NextResponse.json({ ok: false, message: "Le Brand Kit KLIQUE par defaut ne peut pas etre supprime." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof StoryStudioBrandKitValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: "Impossible de supprimer le Brand Kit." }, { status: 500 });
  }
}