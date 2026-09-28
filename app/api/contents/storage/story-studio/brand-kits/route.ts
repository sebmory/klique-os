import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import {
  StoryStudioBrandKitAssetError,
  StoryStudioBrandKitRepository,
} from "@/lib/story-studio/brand-kit-repository";
import {
  StoryStudioBrandKitValidationError,
  validateStoryStudioBrandKitInput,
} from "@/lib/story-studio/brand-kit-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "23505";

export async function GET(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const brandKits = await StoryStudioBrandKitRepository.list(access);
    return NextResponse.json({ ok: true, brandKits });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ ok: false, message: "Impossible de lister les Brand Kits." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const input = validateStoryStudioBrandKitInput(await request.json());
    const brandKit = await StoryStudioBrandKitRepository.create(input, access);
    return NextResponse.json({ ok: true, brandKit }, { status: 201 });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof StoryStudioBrandKitValidationError || error instanceof StoryStudioBrandKitAssetError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json({ ok: false, message: "Un Brand Kit porte deja ce nom." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: "Impossible de creer le Brand Kit." }, { status: 500 });
  }
}