import { NextResponse } from "next/server";
import { loadPartnerCommunityPublications } from "@/lib/hub-community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const publications = await loadPartnerCommunityPublications(request);
    return NextResponse.json({ publications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load community feed" }, { status: 500 });
  }
}