import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import {
  StoryStudioFrameModelBrandKitError,
  StoryStudioFrameModelRepository,
} from "@/lib/story-studio/frame-model-repository";
import {
  StoryStudioFrameModelValidationError,
  validateStoryStudioFrameModelInput,
} from "@/lib/story-studio/frame-model-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isUniqueViolation = (error: unknown): boolean => (
  typeof error === "object" && error !== null && "code" in error && error.code === "23505"
);

export async function GET(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const frameModels = await StoryStudioFrameModelRepository.list(access);
    return NextResponse.json({ ok: true, frameModels });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ ok: false, message: "Impossible de lister les modeles de frame." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const input = validateStoryStudioFrameModelInput(await request.json());
    const frameModel = await StoryStudioFrameModelRepository.create(input, access);
    return NextResponse.json({ ok: true, frameModel }, { status: 201 });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (
      error instanceof StoryStudioFrameModelValidationError
      || error instanceof StoryStudioFrameModelBrandKitError
      || error instanceof SyntaxError
    ) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json({ ok: false, message: "Un modele porte deja ce nom." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: "Impossible de creer le modele de frame." }, { status: 500 });
  }
}