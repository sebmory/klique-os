import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  addCommunityComment,
  createCommunityPublication,
  deleteCommunityPublication,
  loadCommunityPublications,
  toggleCommunityReaction,
  updateCommunityPublication,
} from "@/lib/hub-community/service";

const communityErrorResponse = (error: unknown, fallbackMessage: string) => {
  const message = (error as Error).message;

  if (message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "Forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (message === "NotFound") {
    return NextResponse.json({ error: "NotFound" }, { status: 404 });
  }
  if (message === "InvalidInput") {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
};

export async function GET(request: Request) {
  const { userId } = await auth();
  try {
    const publications = await loadCommunityPublications(userId ?? null, request);
    return NextResponse.json({ publications });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Failed to load community publications", error);
    return NextResponse.json({ error: "Unable to load community feed" }, { status: 500 });
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
    const message = (error as Error).message;
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Failed to mutate community feed", error);
    return NextResponse.json({ error: "Unable to save community update" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const publication = await updateCommunityPublication(request, String(body?.publicationId ?? ""), {
      title: body?.title,
      content: body?.content,
    });
    return NextResponse.json({ publication });
  } catch (error) {
    return communityErrorResponse(error, "Unable to update publication");
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const result = await deleteCommunityPublication(request, String(body?.publicationId ?? ""));
    return NextResponse.json(result);
  } catch (error) {
    return communityErrorResponse(error, "Unable to delete publication");
  }
}
