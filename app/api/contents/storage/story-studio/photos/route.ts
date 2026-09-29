import { NextRequest, NextResponse } from "next/server";
import { del, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { StoryStudioPhotoRepository } from "@/lib/story-studio/photo-repository";
import {
  createStoryStudioPhotoUploadIntent,
  StoryStudioPhotoValidationError,
  validateStoryStudioPhotoBytes,
  verifyStoryStudioPhotoUploadIntent,
} from "@/lib/story-studio/photo-service";
import { MAX_STORY_STUDIO_PHOTO_BYTES } from "@/types/story-studio-photo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const normalizeAthleteId = (value: unknown): string | null => {
  const athleteId = String(value ?? "").trim();
  return athleteId || null;
};

export async function GET(request: NextRequest) {
  try {
    const access = await requireContentAccess(request);
    const athleteId = normalizeAthleteId(request.nextUrl.searchParams.get("athleteId"));
    const photos = await StoryStudioPhotoRepository.list(athleteId, access);
    return NextResponse.json({ ok: true, photos });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de lister les photos Story Studio." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireContentAccess(request.clone());
    const body = await request.json() as Record<string, unknown>;

    if (body.type === "blob.generate-client-token") {
      const result = await handleUpload({
        request,
        body: body as unknown as HandleUploadBody,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const intent = verifyStoryStudioPhotoUploadIntent(clientPayload ?? "", access);
          if (pathname !== intent.pathname) {
            throw new StoryStudioPhotoValidationError("Chemin d'upload non autorisé.");
          }
          return {
            allowedContentTypes: [intent.contentType],
            maximumSizeInBytes: MAX_STORY_STUDIO_PHOTO_BYTES,
            addRandomSuffix: false,
            tokenPayload: clientPayload,
          };
        },
      });
      return NextResponse.json(result);
    }

    if (body.action === "create-upload-intent") {
      const intent = createStoryStudioPhotoUploadIntent({
        athleteId: normalizeAthleteId(body.athleteId),
        assetKind: body.assetKind === "brandKitLogo"
          ? "brandKitLogo"
          : body.assetKind === "subjectLayer" ? "subjectLayer" : "photo",
        contentType: String(body.contentType ?? ""),
        sizeBytes: Number(body.sizeBytes),
      }, access);
      return NextResponse.json({ ok: true, ...intent });
    }

    if (body.action === "register-upload") {
      const intent = verifyStoryStudioPhotoUploadIntent(String(body.uploadIntent ?? ""), access);
      const submittedBlob = body.blob as { url?: unknown; pathname?: unknown } | undefined;
      const url = String(submittedBlob?.url ?? "");
      const pathname = String(submittedBlob?.pathname ?? "");
      if (pathname !== intent.pathname) {
        throw new StoryStudioPhotoValidationError("Chemin du Blob non autorisé.");
      }

      const blobHead = await head(url);
      if (
        blobHead.url !== url
        || blobHead.pathname !== intent.pathname
        || blobHead.contentType !== intent.contentType
        || blobHead.size !== intent.sizeBytes
      ) {
        throw new StoryStudioPhotoValidationError("Les métadonnées du Blob ne correspondent pas à l'upload autorisé.");
      }
      const blobResponse = await fetch(blobHead.url, { cache: "no-store" });
      if (!blobResponse.ok) throw new StoryStudioPhotoValidationError("Le Blob uploadé est inaccessible.");
      const validated = validateStoryStudioPhotoBytes(
        new Uint8Array(await blobResponse.arrayBuffer()),
        blobHead.contentType,
        blobHead.size,
        intent.assetKind,
      );

      try {
        const photo = await StoryStudioPhotoRepository.create({
          athleteId: intent.athleteId,
          blob: {
            url: blobHead.url,
            pathname: blobHead.pathname,
            ...validated,
          },
        }, access);
        return NextResponse.json({ ok: true, photo }, { status: 201 });
      } catch (persistenceError) {
        await del(blobHead.url);
        throw persistenceError;
      }
    }

    return NextResponse.json({ ok: false, message: "Action d'upload Story Studio invalide." }, { status: 400 });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof StoryStudioPhotoValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Impossible d'importer la photo Story Studio." },
      { status: 500 }
    );
  }
}