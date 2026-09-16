import { NextResponse } from "next/server";
import { loadPartnerCommunityOpportunities } from "@/lib/hub-opportunities/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const opportunities = await loadPartnerCommunityOpportunities(request);
    return NextResponse.json({ opportunities });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load opportunities" }, { status: 500 });
  }
}