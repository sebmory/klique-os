import { NextResponse } from "next/server";
import { getCurrentUserCreativeAccessProfile } from "@/lib/clerk-access/service";
import {
  listCreativePortalMissions,
  parseCreativeMissionResponseInput,
  respondToCreativeMission,
  type CreativePortalMission,
  type CreativeMissionResponseMutationOutcome,
} from "@/lib/creative-missions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreativeAccess = {
  workspaceId: string;
  creativeProfileId: string;
  clerkUserId: string;
  status: string;
  creativeProfileStatus: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<CreativeAccess | null>;
  listMissions: (input: {
    workspaceId: string;
    creativeProfileId: string;
  }) => Promise<CreativePortalMission[]>;
  respond: (input: {
    workspaceId: string;
    creativeProfileId: string;
    clerkUserId: string;
    reference: string;
    action: "accepted" | "refused";
    note: string | null;
    idempotencyKey: string;
  }) => Promise<CreativeMissionResponseMutationOutcome>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getCurrentUserCreativeAccessProfile,
  listMissions: listCreativePortalMissions,
  respond: respondToCreativeMission,
};

export const logUnexpectedCreativeMissionPostError = (error: unknown): void => {
  const databaseError = error && typeof error === "object"
    ? error as { code?: unknown; constraint?: unknown }
    : null;
  console.error("[creative_missions][post_failed]", {
    code: typeof databaseError?.code === "string" ? databaseError.code : null,
    constraint: typeof databaseError?.constraint === "string"
      ? databaseError.constraint
      : null,
  });
};

const requireActiveAccess = async (
  request: Request,
  getAccess: HandlerDependencies["getAccess"],
): Promise<CreativeAccess | NextResponse> => {
  const access = await getAccess(request);
  if (!access) {
    return NextResponse.json({ error: "Authentification créative requise." }, { status: 401 });
  }
  if (access.status !== "active" || access.creativeProfileStatus !== "active") {
    return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
  }
  return access;
};

const errorForOutcome = (outcome: CreativeMissionResponseMutationOutcome): NextResponse => {
  if (outcome === "mission_not_found") {
    return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
  }
  if (outcome === "assignment_changed") {
    return NextResponse.json(
      { error: "Cette mission ne vous est plus affectée." },
      { status: 409 },
    );
  }
  if (outcome === "mission_cancelled") {
    return NextResponse.json(
      { error: "Une mission annulée ne peut plus être acceptée." },
      { status: 409 },
    );
  }
  if (outcome === "idempotency_conflict") {
    return NextResponse.json(
      { error: "Cette opération a déjà été utilisée avec un autre contenu." },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
};

export const createCreativeMissionHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      if ([...new URL(request.url).searchParams.keys()].length > 0) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const access = await requireActiveAccess(request, dependencies.getAccess);
      if (access instanceof NextResponse) return access;
      const missions = await dependencies.listMissions({
        workspaceId: access.workspaceId,
        creativeProfileId: access.creativeProfileId,
      });
      return NextResponse.json({ missions }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch {
      return NextResponse.json(
        { error: "Impossible de charger les missions." },
        { status: 500 },
      );
    }
  },

  async POST(request: Request) {
    try {
      if (
        request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase()
        !== "application/json"
      ) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const access = await requireActiveAccess(request, dependencies.getAccess);
      if (access instanceof NextResponse) return access;
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const { reference, ...responseInput } = body as Record<string, unknown>;
      if (typeof reference !== "string") {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const parsed = parseCreativeMissionResponseInput(responseInput);
      const outcome = await dependencies.respond({
        workspaceId: access.workspaceId,
        creativeProfileId: access.creativeProfileId,
        clerkUserId: access.clerkUserId,
        reference,
        ...parsed,
      });
      if (outcome !== "changed" && outcome !== "unchanged") {
        return errorForOutcome(outcome);
      }
      return NextResponse.json({ ok: true, unchanged: outcome === "unchanged" });
    } catch (error) {
      if (error instanceof Error && /invalide|obligatoire|dépasser|UUID/.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      logUnexpectedCreativeMissionPostError(error);
      return NextResponse.json(
        { error: "Impossible d’enregistrer la réponse." },
        { status: 500 },
      );
    }
  },
});

const handlers = createCreativeMissionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
