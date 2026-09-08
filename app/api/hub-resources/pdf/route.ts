import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { evaluateBusinessAccess } from "@/lib/clerk-access/service";
import { HUB_RESOURCE_PDF_CONTENT_TYPE, MAX_HUB_RESOURCE_PDF_SIZE_BYTES } from "@/lib/hub-resources/pdf-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Upload direct navigateur -> Blob (token signe) pour ne pas passer par le corps de la fonction serverless,
// dont la limite (~4.5 Mo sur Vercel) est incompatible avec la limite de 20 Mo annoncee pour les PDF.
export async function POST(request: Request) {
  // Upload reserve a l'Admin: meme garde que les autres routes d'ecriture (write:crm).
  const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
  if (!accessCheck.allowed) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // Le type et la taille sont imposes par le token: Vercel Blob refuse toute violation cote stockage.
        allowedContentTypes: [HUB_RESOURCE_PDF_CONTENT_TYPE],
        maximumSizeInBytes: MAX_HUB_RESOURCE_PDF_SIZE_BYTES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'importer le PDF." },
      { status: 400 },
    );
  }
}

