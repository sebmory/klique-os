import { NextResponse } from "next/server";
import { getPartnerCommunityResourceById } from "@/lib/hub-resources/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  try {
    const { resourceId } = await params;
    const resource = await getPartnerCommunityResourceById(request, resourceId);
    return NextResponse.json({ resource });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "NotFound") {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to load resource" }, { status: 500 });
  }
}