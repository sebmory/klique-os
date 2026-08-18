import { NextRequest, NextResponse } from "next/server";
import { evaluateBusinessAccess, getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  contactRequestMessageMaxLength,
  contactRequestSubjectMaxLength,
  createContactRequest,
  isContactRequestCategory,
  isContactRequestStatus,
  listContactRequests,
  updateContactRequestStatus,
} from "@/lib/contact-requests/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const access = profile?.userAccess ?? null;
    const ownAthleteId = access?.athleteId?.trim() ?? "";
    const workspaceId = access?.workspaceId?.trim() ?? "";

    if (access?.role !== "athlete" || !ownAthleteId || !workspaceId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const accessCheck = await evaluateBusinessAccess(request, {
      action: "read:own-profile",
      targetAthleteId: ownAthleteId,
    });

    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as {
      category?: unknown;
      subject?: unknown;
      message?: unknown;
    };

    if (!isContactRequestCategory(body.category)) {
      return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
    }

    const subject = String(body.subject ?? "").trim();
    if (!subject) {
      return NextResponse.json({ error: "Le sujet est obligatoire." }, { status: 400 });
    }
    if (subject.length > contactRequestSubjectMaxLength) {
      return NextResponse.json(
        { error: `Le sujet ne peut pas dépasser ${contactRequestSubjectMaxLength} caractères.` },
        { status: 400 },
      );
    }

    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Le message est obligatoire." }, { status: 400 });
    }
    if (message.length > contactRequestMessageMaxLength) {
      return NextResponse.json(
        { error: `Le message ne peut pas dépasser ${contactRequestMessageMaxLength} caractères.` },
        { status: 400 },
      );
    }

    const contactRequest = await createContactRequest({
      workspaceId,
      athleteId: ownAthleteId,
      category: body.category,
      subject,
      message,
    });

    return NextResponse.json({ contactRequest }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de créer la demande." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const profile = await getCurrentUserAccessProfile(request);
    const workspaceId = profile?.userAccess?.workspaceId?.trim() ?? "";
    if (!workspaceId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const contactRequests = await listContactRequests(workspaceId);
    return NextResponse.json({ contactRequests });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de récupérer les demandes." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const profile = await getCurrentUserAccessProfile(request);
    const workspaceId = profile?.userAccess?.workspaceId?.trim() ?? "";
    if (!workspaceId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as { id?: unknown; status?: unknown };

    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id est obligatoire." }, { status: 400 });
    }

    if (!isContactRequestStatus(body.status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const contactRequest = await updateContactRequestStatus(id, body.status, workspaceId);
    if (!contactRequest) {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }

    return NextResponse.json({ contactRequest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de mettre à jour la demande." },
      { status: 500 },
    );
  }
}
