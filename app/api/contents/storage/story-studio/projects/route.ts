import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { StoryStudioProjectRepository } from "@/lib/story-studio/repository";
import {
  StoryStudioValidationError,
  validateStoryStudioProjectPayload,
} from "@/lib/story-studio/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requireNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new StoryStudioValidationError(`${fieldName} doit etre une chaine non vide.`);
  }
  return value.trim();
};

const validateCreateOrGetBody = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoryStudioValidationError("Le corps de la requete doit etre un objet.");
  }

  const body = value as Record<string, unknown>;
  if (body.athleteId !== null && body.athleteId !== undefined
    && (typeof body.athleteId !== "string" || !body.athleteId.trim())) {
    throw new StoryStudioValidationError("athleteId doit etre une chaine non vide ou null.");
  }

  return {
    sourcePackId: requireNonEmptyString(body.sourcePackId, "sourcePackId"),
    sourceStoriesVariantId: requireNonEmptyString(body.sourceStoriesVariantId, "sourceStoriesVariantId"),
    sourceDocumentId: requireNonEmptyString(body.sourceDocumentId, "sourceDocumentId"),
    athleteId: typeof body.athleteId === "string" ? body.athleteId.trim() : null,
    payload: validateStoryStudioProjectPayload(body.payload),
  };
};

export async function POST(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const input = validateCreateOrGetBody(await request.json());
    const project = await StoryStudioProjectRepository.createOrGet(input, access);
    if (!project) {
      return NextResponse.json(
        { ok: false, message: "Projet Story Studio inaccessible pour cette variante Stories." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof StoryStudioValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible d'ouvrir le projet Story Studio." },
      { status: 500 }
    );
  }
}