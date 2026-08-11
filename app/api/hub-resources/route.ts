import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHubResource, deleteHubResource, loadHubResources, updateHubResource } from "@/lib/hub-resources/service";

export async function GET(request: Request) {
  const { userId } = await auth();
  try {
    const payload = await loadHubResources(request, userId ?? null);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load hub resources", error);
    return NextResponse.json({ resources: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = {
      title: String(body?.title ?? ""),
      category: String(body?.category ?? "Autre"),
      author: String(body?.author ?? "KLIQUE"),
      type: String(body?.type ?? "Article"),
      description: String(body?.description ?? ""),
      content: String(body?.content ?? ""),
      status: String(body?.status ?? "draft"),
      date: String(body?.date ?? ""),
    };

    if (body?.action === "delete") {
      const result = await deleteHubResource(request, String(body.resourceId ?? ""), userId);
      return NextResponse.json(result);
    }

    if (body?.resourceId) {
      const resource = await updateHubResource(request, String(body.resourceId), input, userId);
      return NextResponse.json({ resource });
    }

    const resource = await createHubResource(request, input, userId);
    return NextResponse.json({ resource });
  } catch (error) {
    console.error("Failed to mutate hub resources", error);
    if ((error as Error).message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).message === "NotFound") {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to save resource" }, { status: 500 });
  }
}
