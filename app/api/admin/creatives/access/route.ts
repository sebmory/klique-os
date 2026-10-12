import { NextResponse } from "next/server";
import {
  getCreativeAccessState,
  inviteCreativeProfileToKlique,
  revokeCreativeProfileAccess,
} from "@/lib/clerk-access/service";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  getState: typeof getCreativeAccessState;
  invite: typeof inviteCreativeProfileToKlique;
  revoke: typeof revokeCreativeProfileAccess;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  getState: getCreativeAccessState,
  invite: inviteCreativeProfileToKlique,
  revoke: revokeCreativeProfileAccess,
};

const reasonStatus: Record<string, number> = {
  forbidden: 403,
  creative_not_found: 404,
  inactive_profile: 409,
  already_active: 409,
  already_invited: 409,
  not_invited: 409,
  missing_email: 422,
  invalid_email: 422,
  clerk_error: 502,
};

const reasonMessage: Record<string, string> = {
  forbidden: "Accès refusé.",
  creative_not_found: "Fiche créative introuvable.",
  inactive_profile: "Une fiche inactive ne peut pas être invitée.",
  already_active: "Cet accès créatif est déjà actif.",
  already_invited: "Une invitation est déjà en attente.",
  not_invited: "Aucun accès créatif ne peut être révoqué.",
  missing_email: "La fiche créative ne contient aucune adresse e-mail.",
  invalid_email: "L’adresse e-mail de la fiche créative est invalide.",
  clerk_error: "L’opération Clerk a échoué.",
};

const readProfileId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const createAdminCreativeAccessHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    const access = await requireCreativeAdminContext(request, dependencies.getAccess);
    if ("response" in access) return access.response;
    const searchParams = new URL(request.url).searchParams;
    const creativeProfileId = readProfileId(searchParams.get("creativeProfileId"));
    if (
      !creativeProfileId
      || [...searchParams.keys()].some((key) => key !== "creativeProfileId")
    ) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    try {
      const state = await dependencies.getState(access.context.workspaceId, creativeProfileId);
      return NextResponse.json(state, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch {
      return NextResponse.json(
        { error: "Impossible de charger l’état d’accès." },
        { status: 500 },
      );
    }
  },

  async POST(request: Request) {
    try {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const creativeProfileId = readProfileId(body?.creativeProfileId);
      if (
        !body
        || !creativeProfileId
        || !Object.keys(body).every((key) => ["creativeProfileId", "resend"].includes(key))
      ) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const result = await dependencies.invite(request, creativeProfileId, {
        resend: body.resend === true,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.message ?? reasonMessage[result.reason], reason: result.reason },
          { status: reasonStatus[result.reason] ?? 400 },
        );
      }
      return NextResponse.json({
        state: result.clerkInvitationId.startsWith("existing:") ? "active" : "invited",
        email: result.email,
      }, { status: 201 });
    } catch {
      return NextResponse.json({ error: "Impossible d’envoyer l’invitation." }, { status: 500 });
    }
  },

  async DELETE(request: Request) {
    try {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const creativeProfileId = readProfileId(body?.creativeProfileId);
      if (!body || !creativeProfileId || Object.keys(body).length !== 1) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const result = await dependencies.revoke(request, creativeProfileId);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.message ?? reasonMessage[result.reason], reason: result.reason },
          { status: reasonStatus[result.reason] ?? 400 },
        );
      }
      return NextResponse.json({ state: "revoked" });
    } catch {
      return NextResponse.json({ error: "Impossible de révoquer l’accès." }, { status: 500 });
    }
  },
});

const handlers = createAdminCreativeAccessHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
