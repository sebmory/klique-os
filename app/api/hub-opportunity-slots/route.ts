import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createHubOpportunitySlot,
  isSlotRequestStatus,
  isSlotStatus,
  loadHubOpportunitySlots,
  markHubOpportunitySlotRequestSeen,
  requestHubOpportunitySlot,
  updateHubOpportunitySlotRequestStatus,
  updateHubOpportunitySlotStatus,
} from "@/lib/hub-opportunity-slots/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = (error: unknown) => {
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
  if (message === "InvalidInput") {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }
  if (message === "SlotFull") {
    return NextResponse.json({ error: "Le créneau est complet." }, { status: 409 });
  }
  if (message === "Conflict") {
    return NextResponse.json({ error: "Une demande confirmée existe déjà." }, { status: 409 });
  }

  console.error("Failed to handle hub opportunity slots", error);
  return NextResponse.json({ error: "Unable to handle opportunity slots" }, { status: 500 });
};

export async function GET(request: NextRequest) {
  try {
    const opportunityId = request.nextUrl.searchParams.get("opportunityId");
    const payload = await loadHubOpportunitySlots(request, opportunityId);
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  try {
    const body = (await request.json()) as {
      action?: unknown;
      opportunityId?: unknown;
      slotId?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      capacity?: unknown;
    };

    if (body.action === "request-slot") {
      const slotRequest = await requestHubOpportunitySlot(request, String(body.slotId ?? ""), userId ?? null);
      return NextResponse.json({ request: slotRequest }, { status: 201 });
    }

    const slot = await createHubOpportunitySlot(request, {
      opportunityId: String(body.opportunityId ?? ""),
      startsAt: String(body.startsAt ?? ""),
      endsAt: String(body.endsAt ?? ""),
      capacity: Number(body.capacity),
    });

    return NextResponse.json({ slot }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { slotId?: unknown; requestId?: unknown; status?: unknown; action?: unknown };

    if (body.action === "mark-seen") {
      const slotRequest = await markHubOpportunitySlotRequestSeen(request, String(body.requestId ?? ""));
      return NextResponse.json({ request: slotRequest });
    }

    const requestId = String(body.requestId ?? "").trim();
    if (requestId) {
      if (!isSlotRequestStatus(body.status) || body.status === "requested") {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
      }

      const slotRequest = await updateHubOpportunitySlotRequestStatus(request, requestId, body.status);
      return NextResponse.json({ request: slotRequest });
    }

    const slotId = String(body.slotId ?? "").trim();
    if (!slotId) {
      return NextResponse.json({ error: "slotId ou requestId est obligatoire." }, { status: 400 });
    }

    if (!isSlotStatus(body.status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const slot = await updateHubOpportunitySlotStatus(request, slotId, body.status);
    return NextResponse.json({ slot });
  } catch (error) {
    return errorResponse(error);
  }
}
