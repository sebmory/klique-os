import { NextRequest, NextResponse } from "next/server";
import {
  evaluateBusinessAccess,
  getPartnerAccessState,
  invitePartnerToKlique,
} from "@/lib/clerk-access/service";
import {
  getEcosystemPartnersFrom06Partenaires,
  isPartnerUuid,
  resolvePartnerReference,
} from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusByReason: Record<string, number> = {
  forbidden: 403,
  partner_not_found: 404,
  missing_email: 422,
  invalid_email: 422,
  already_active: 409,
  already_invited: 409,
  clerk_error: 502,
};

const messageByReason: Record<string, string> = {
  forbidden: "Accès refusé.",
  partner_not_found: "Fiche partenaire introuvable.",
  missing_email: "Aucune adresse email enregistrée sur cette fiche.",
  invalid_email: "L'adresse email enregistrée n'est pas valide.",
  already_active: "Ce partenaire dispose déjà d'un accès actif.",
  already_invited: "Une invitation est déjà en attente pour ce partenaire ou cette adresse.",
  clerk_error: "Échec de l'invitation Clerk.",
};

const resolvePartnerIdentity = async (value: unknown) => {
  const partners = await getEcosystemPartnersFrom06Partenaires();
  const partner = resolvePartnerReference(partners, value);
  if (!partner) {
    throw new Error(`Fiche partenaire introuvable dans 06_Partenaires : ${String(value ?? "").trim() || "référence absente"}.`);
  }
  const row = partner.row ?? null;

  return {
    row,
    identity: {
      partnerId: partner.id,
      email: partner.email.trim(),
      legacyPartnerIds: [
        ...(row === null ? [] : [`row-${row}`, String(row)]),
        partner.name,
      ],
    },
  };
};

const errorWithRow = (error: unknown, fallback: string, row: number | null): string => {
  const message = error instanceof Error ? error.message : fallback;
  if (row === null || /ligne\s/i.test(message)) return message;
  return `${message} Ligne 06_Partenaires recherchée : ${row}.`;
};

export async function GET(request: NextRequest) {
  let searchedRow: number | null = null;
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const rowReference = request.nextUrl.searchParams.get("row") ?? request.nextUrl.searchParams.get("partnerId");
    if (!rowReference) {
      return NextResponse.json({ error: "La référence partenaire est obligatoire." }, { status: 400 });
    }

    const { row, identity } = await resolvePartnerIdentity(rowReference);
    searchedRow = row;
    const state = await getPartnerAccessState(identity);
    return NextResponse.json({ ok: true, partnerId: identity.partnerId, ...state });
  } catch (error) {
    return NextResponse.json(
      {
        error: errorWithRow(error, "Impossible de récupérer l'état d'invitation.", searchedRow),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let searchedRow: number | null = null;
  try {
    const body = (await request.json()) as { row?: unknown; partnerId?: unknown; resend?: unknown };
    const rowReference = body.row ?? body.partnerId;
    if (rowReference === undefined || rowReference === null || String(rowReference).trim() === "") {
      return NextResponse.json({ error: "La référence partenaire est obligatoire." }, { status: 400 });
    }

    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { row, identity } = await resolvePartnerIdentity(rowReference);
    searchedRow = row;
    if (!isPartnerUuid(identity.partnerId)) {
      return NextResponse.json(
        { error: `Partner ID UUID manquant dans 06_Partenaires${row === null ? "." : ` à la ligne ${row}.`}` },
        { status: 409 },
      );
    }
    const result = await invitePartnerToKlique(request, identity, { resend: body.resend === true });
    if (!result.ok) {
      const message = result.message || messageByReason[result.reason];
      return NextResponse.json(
        { ok: false, reason: result.reason, error: `${message} Ligne 06_Partenaires : ${searchedRow}.` },
        { status: statusByReason[result.reason] ?? 400 },
      );
    }

    if (!result.clerkInvitationId) {
      return NextResponse.json(
        { ok: false, reason: "clerk_error", error: `Clerk n'a retourné aucun identifiant d'invitation. Ligne 06_Partenaires : ${searchedRow}.` },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        partnerId: result.partnerId,
        email: result.email,
        clerkInvitationId: result.clerkInvitationId,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: errorWithRow(error, "Impossible d'envoyer l'invitation.", searchedRow),
      },
      { status: 500 },
    );
  }
}