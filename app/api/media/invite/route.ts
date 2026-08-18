import { NextResponse } from "next/server";
import { inviteMediaToKlique } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusByReason: Record<string, number> = {
  forbidden: 403,
  invalid_email: 400,
  already_invited: 409,
  already_active: 409,
  clerk_error: 502,
};

const messageByReason: Record<string, string> = {
  forbidden: "Accès refusé.",
  invalid_email: "Adresse email invalide.",
  already_invited: "Une invitation est déjà en attente pour cette adresse.",
  already_active: "Cette adresse dispose déjà d’un accès média actif.",
  clerk_error: "L’invitation n’a pas pu être envoyée.",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const result = await inviteMediaToKlique(request, String(body?.email ?? ""));

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message || messageByReason[result.reason] || "Invitation impossible." },
        { status: statusByReason[result.reason] ?? 400 },
      );
    }

    return NextResponse.json({ ok: true, invitationId: result.invitationId, email: result.email }, { status: 201 });
  } catch (error) {
    console.error("[media_invite] Failed to invite media", error);
    return NextResponse.json({ ok: false, error: "Invitation impossible." }, { status: 500 });
  }
}
