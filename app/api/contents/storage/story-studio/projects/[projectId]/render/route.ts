import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { renderStoryStudioProjectPng } from "@/lib/story-studio/png-renderer";
import { StoryStudioProjectRepository } from "@/lib/story-studio/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
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

    const rendered = await renderStoryStudioProjectPng(project);
    return new Response(rendered.bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${rendered.filename}"`,
        "X-Story-Studio-Renderer": rendered.placeholder ? "stub" : "production",
      },
    });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de rendre le projet Story Studio." },
      { status: 500 }
    );
  }
}