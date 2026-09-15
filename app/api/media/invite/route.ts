import { NextResponse } from "next/server";
import { inviteMediaToKlique } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusByReason: Record<string, number> = {
  forbidden: 403,
  invalid_email: 400,
  invalid_media: 400,
  media_not_found: 404,
  already_invited: 409,
  already_active: 409,
  clerk_error: 502,
};

const messageByReason: Record<string, string> = {
  forbidden: "Accès refusé.",
  invalid_email: "Adresse email invalide.",
  invalid_media: "Identifiant Média invalide.",
  media_not_found: "Organisation Média active introuvable.",
  already_invited: "Une invitation est déjà en attente pour cette adresse.",
  already_active: "Cette adresse dispose déjà d’un accès média actif.",
  clerk_error: "L’invitation n’a pas pu être envoyée.",
};

const mediaIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const allowedFields = new Set(["email", "mediaId"]);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!isRecord(body) || !Object.keys(body).every((key) => allowedFields.has(key))) {
      return NextResponse.json({ ok: false, error: "Payload invalide." }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const mediaId = typeof body.mediaId === "string" ? body.mediaId.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json({ ok: false, error: "Adresse email requise." }, { status: 400 });
    }
    if (!mediaIdPattern.test(mediaId)) {
      return NextResponse.json({ ok: false, error: messageByReason.invalid_media }, { status: 400 });
    }

    const result = await inviteMediaToKlique(request, email, mediaId);

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
