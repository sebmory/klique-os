import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { getHubResourceById } from "@/lib/hub-resources/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sert le PDF stocke en prive uniquement si l'appelant a le droit de voir la ressource (meme regle que la page detail),
// une URL Blob publique ne suffisant pas a elle seule a proteger un document reserve.
export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const { userId } = await auth();
  const resource = await getHubResourceById(request, resourceId, userId ?? null);

  if (!resource || !resource.url) {
    return NextResponse.json({ error: "Ressource introuvable." }, { status: 404 });
  }

  try {
    const blob = await get(resource.url, { access: "private" });
    if (!blob || blob.statusCode !== 200) {
      return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    }
    const safeTitle = resource.title.replace(/["\r\n]/g, "").slice(0, 150) || "document";
    return new NextResponse(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": blob.blob.contentType || "application/pdf",
        "Content-Disposition": `inline; filename="${safeTitle}.pdf"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch {
    // Repli pour un lien externe ou un ancien blob public deja stocke tel quel dans la ressource.
    return NextResponse.redirect(resource.url);
  }
}
