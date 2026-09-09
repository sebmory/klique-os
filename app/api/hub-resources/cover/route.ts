import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  MAX_HUB_RESOURCE_COVER_BYTES,
  isAllowedHubResourceCoverContentType,
  uploadHubResourceCover,
} from "@/lib/hub-resources/cover-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const accessProfile = await getCurrentUserAccessProfile(request);
    const access = accessProfile?.userAccess ?? null;
    if (!accessProfile?.clerkUser?.id || access?.role !== "admin" || access.status !== "active") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Le fichier image est obligatoire." }, { status: 400 });
    }

    if (!isAllowedHubResourceCoverContentType(file.type)) {
      return NextResponse.json(
        { error: "Type d'image non autorisé. Formats acceptés: JPEG, PNG." },
        { status: 400 }
      );
    }

    if (file.size > MAX_HUB_RESOURCE_COVER_BYTES) {
      return NextResponse.json({ error: "Image trop volumineuse. Taille maximale: 4 Mo." }, { status: 400 });
    }

    const { url } = await uploadHubResourceCover(file);

    return NextResponse.json({ ok: true, url }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'uploader la couverture." },
      { status: 500 }
    );
  }
}
