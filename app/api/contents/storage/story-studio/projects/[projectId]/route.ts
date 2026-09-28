import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { StoryStudioProjectRepository } from "@/lib/story-studio/repository";
import {
  StoryStudioValidationError,
  validateStoryStudioProjectPayload,
} from "@/lib/story-studio/validation";
import type { StoryStudioProjectStatus } from "@/types/story-studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ projectId: string }>;
};

const validateUpdateBody = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoryStudioValidationError("Le corps de la requete doit etre un objet.");
  }

  const body = value as Record<string, unknown>;
  if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) {
    throw new StoryStudioValidationError("expectedVersion doit etre un entier positif.");
  }
  if (body.athleteId !== null && (typeof body.athleteId !== "string" || !body.athleteId.trim())) {
    throw new StoryStudioValidationError("athleteId doit etre une chaine non vide ou null.");
  }
  if (body.status !== "draft" && body.status !== "finalized") {
    throw new StoryStudioValidationError("status doit valoir draft ou finalized.");
  }

  return {
    expectedVersion: Number(body.expectedVersion),
    athleteId: body.athleteId === null ? null : body.athleteId.trim(),
    status: body.status as StoryStudioProjectStatus,
    payload: validateStoryStudioProjectPayload(body.payload),
  };
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const { projectId } = await params;
    if (!projectId?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de projet manquant." }, { status: 400 });
    }

    const project = await StoryStudioProjectRepository.getById(projectId, access);
    if (!project) {
      return NextResponse.json({ ok: false, message: "Projet Story Studio introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lire le projet Story Studio." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const access = await requireContentAccess(request);
    const { projectId } = await params;
    if (!projectId?.trim()) {
      return NextResponse.json({ ok: false, message: "Identifiant de projet manquant." }, { status: 400 });
    }

    const input = validateUpdateBody(await request.json());
    const result = await StoryStudioProjectRepository.update({ projectId, ...input }, access);
    if (result.status === "not_found") {
      return NextResponse.json({ ok: false, message: "Projet Story Studio introuvable." }, { status: 404 });
    }
    if (result.status === "version_conflict") {
      return NextResponse.json(
        {
          ok: false,
          message: "Conflit de version du projet Story Studio.",
          currentVersion: result.currentVersion,
          currentProject: result.current,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, project: result.project });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof StoryStudioValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de mettre a jour le projet Story Studio." },
      { status: 500 }
    );
  }
}