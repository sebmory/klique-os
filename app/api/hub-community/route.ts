import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { addCommunityComment, createCommunityPublication, loadCommunityPublications, toggleCommunityReaction } from "@/lib/hub-community/service";

export async function GET(request: Request) {
  const { userId } = await auth();
  try {
    const publications = await loadCommunityPublications(userId ?? null, request);
    return NextResponse.json({ publications });
  } catch (error) {
    console.error("Failed to load community publications", error);
    return NextResponse.json({ publications: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body?.action === "react") {
      const publication = await toggleCommunityReaction(String(body.publicationId), request);
      return NextResponse.json({ publication });
    }

    if (body?.action === "comment") {
      const publication = await addCommunityComment(String(body.publicationId), request, String(body.text ?? ""));
      return NextResponse.json({ publication });
    }

    const publication = await createCommunityPublication(request, {
      title: body?.title,
      content: body?.content,
      type: body?.type,
    });
    return NextResponse.json({ publication });
  } catch (error) {
    console.error("Failed to mutate community feed", error);
    return NextResponse.json({ error: "Unable to save community update" }, { status: 500 });
  }
}
