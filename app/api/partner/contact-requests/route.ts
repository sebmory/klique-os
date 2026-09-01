import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  contactRequestMessageMaxLength,
  contactRequestSubjectMaxLength,
  createPartnerAthleteIntroduction,
} from "@/lib/contact-requests/service";
import { getEcosystemPartnersFrom06Partenaires, getPublicAthleteProfileFromGoogleSheets } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const access = profile?.userAccess ?? null;
    const partnerId = access?.partnerId?.trim() ?? "";
    const workspaceId = access?.workspaceId?.trim() ?? "";

    if (access?.role !== "partner_expert" || access.status !== "active" || !partnerId || !workspaceId) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const partnerRowMatch = partnerId.match(/^row-(\d+)$/);
    if (!partnerRowMatch) {
      return NextResponse.json({ error: "Fiche partenaire active introuvable." }, { status: 403 });
    }

    const partnerRow = Number(partnerRowMatch[1]);
    const partners = await getEcosystemPartnersFrom06Partenaires();
    const activePartner = partners.find((partner) => partner.row === partnerRow && partner.status.trim().toLowerCase() === "actif");
    if (!activePartner) {
      return NextResponse.json({ error: "Fiche partenaire active introuvable." }, { status: 403 });
    }

    const body = (await request.json()) as { athleteId?: unknown; reason?: unknown; message?: unknown };
    const athleteId = String(body.athleteId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!athleteId) return NextResponse.json({ error: "Athlète introuvable." }, { status: 404 });
    if (!reason) return NextResponse.json({ error: "Le motif est obligatoire." }, { status: 400 });
    if (reason.length > contactRequestSubjectMaxLength) {
      return NextResponse.json({ error: `Le motif ne peut pas dépasser ${contactRequestSubjectMaxLength} caractères.` }, { status: 400 });
    }
    if (message.length > contactRequestMessageMaxLength) {
      return NextResponse.json({ error: `Le message ne peut pas dépasser ${contactRequestMessageMaxLength} caractères.` }, { status: 400 });
    }

    const activeAthlete = await getPublicAthleteProfileFromGoogleSheets(athleteId);
    if (!activeAthlete) {
      return NextResponse.json({ error: "Athlète public introuvable ou non visible." }, { status: 404 });
    }

    const contactRequest = await createPartnerAthleteIntroduction({
      workspaceId,
      partnerId,
      athleteId,
      reason,
      message,
    });
    if (!contactRequest) {
      return NextResponse.json({ error: "Une demande de mise en relation est déjà en attente." }, { status: 409 });
    }

    return NextResponse.json({ contactRequest }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de créer la demande." },
      { status: 500 },
    );
  }
}