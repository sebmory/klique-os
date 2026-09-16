import { NextResponse } from "next/server";
import { loadPartnerBenefits } from "@/lib/partner-benefits/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const benefits = await loadPartnerBenefits(request);
    return NextResponse.json({ benefits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load benefits" }, { status: 500 });
  }
}