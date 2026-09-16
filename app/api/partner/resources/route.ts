import { NextResponse } from "next/server";
import { loadPartnerCommunityResources } from "@/lib/hub-resources/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const resources = await loadPartnerCommunityResources(request);
    return NextResponse.json({ resources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load resources" }, { status: 500 });
  }
}