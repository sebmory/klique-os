import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHubOpportunity, loadHubOpportunities, toggleHubOpportunityInterest } from "@/lib/hub-opportunities/service";

export async function GET(request: Request) {
  const { userId } = await auth();
  try {
    const payload = await loadHubOpportunities(request, userId ?? null);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load hub opportunities", error);
    return NextResponse.json({ opportunities: [], currentUserInterestIds: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body?.action === "toggle-interest") {
      const result = await toggleHubOpportunityInterest(request, String(body.opportunityId ?? ""), userId);
      return NextResponse.json(result);
    }

    const opportunity = await createHubOpportunity(request, {
      title: String(body?.title ?? ""),
      type: String(body?.type ?? "Autre"),
      organization: String(body?.organization ?? ""),
      targetAudience: String(body?.targetAudience ?? ""),
      sportOrDomain: String(body?.sportOrDomain ?? ""),
      location: String(body?.location ?? ""),
      date: String(body?.date ?? ""),
      deadline: String(body?.deadline ?? ""),
      description: String(body?.description ?? ""),
      requirements: String(body?.requirements ?? ""),
      practicalInfo: String(body?.practicalInfo ?? ""),
      status: String(body?.status ?? "Brouillon"),
    }, userId);

    return NextResponse.json({ opportunity });
  } catch (error) {
    console.error("Failed to mutate hub opportunities", error);
    if ((error as Error).message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to save opportunity" }, { status: 500 });
  }
}
