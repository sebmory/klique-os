import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createHubOpportunity,
  deleteHubOpportunity,
  loadHubOpportunities,
  toggleHubOpportunityInterest,
  updateHubOpportunity,
} from "@/lib/hub-opportunities/service";

const mutationErrorResponse = (error: unknown, fallbackMessage: string) => {
  const message = (error as Error).message;

  if (message === "Forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const payload = await loadHubOpportunities(request, userId ?? null);
    return NextResponse.json(payload);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Failed to load hub opportunities", error);
    return NextResponse.json({ error: "Unable to load opportunities" }, { status: 500 });
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
    return mutationErrorResponse(error, "Unable to save opportunity");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    const opportunity = await updateHubOpportunity(request, String(body?.opportunityId ?? ""), {
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
    });

    return NextResponse.json({ opportunity });
  } catch (error) {
    return mutationErrorResponse(error, "Unable to update opportunity");
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const result = await deleteHubOpportunity(request, String(body?.opportunityId ?? ""));
    return NextResponse.json(result);
  } catch (error) {
    return mutationErrorResponse(error, "Unable to delete opportunity");
  }
}
