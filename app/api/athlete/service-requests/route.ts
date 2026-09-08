import { NextResponse } from "next/server";
import {
  AthleteServiceRequestError,
  confirmAthleteServiceRequestAsMember,
  createAthleteServiceRequest,
  listAthleteServiceRequests,
  parseAthleteServiceRequestInput,
  type AthleteServiceRequestInput,
  type AthleteServiceRequestMemberConfirmationResult,
  type PublicAthleteServiceRequest,
} from "@/lib/athlete-service-requests";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AthleteAccess = {
  role?: string;
  status?: string;
  workspaceId?: string | null;
  athleteId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AthleteAccess | null>;
  listRequests: (identity: { workspaceId: string; athleteId: string }) => Promise<PublicAthleteServiceRequest[]>;
  createRequest: (input: {
    workspaceId: string;
    athleteId: string;
    input: AthleteServiceRequestInput;
  }) => Promise<PublicAthleteServiceRequest>;
  confirmRequest: (input: {
    workspaceId: string;
    athleteId: string;
    requestId: string;
  }) => Promise<AthleteServiceRequestMemberConfirmationResult>;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    return profile?.userAccess ?? null;
  },
  listRequests: listAthleteServiceRequests,
  createRequest: createAthleteServiceRequest,
  confirmRequest: confirmAthleteServiceRequestAsMember,
};

const getAthleteIdentity = (access: AthleteAccess | null) => {
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const athleteId = access?.athleteId?.trim() ?? "";
  if (access?.role !== "athlete" || access.status !== "active" || !workspaceId || !athleteId) {
    return null;
  }
  return { workspaceId, athleteId };
};

const errorResponse = (error: unknown) => {
  if (error instanceof AthleteServiceRequestError) {
    const status = error.code === "inactive_product" ? 404 : error.code === "insufficient_rights" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(
    { error: "Impossible de traiter la demande de service pour le moment." },
    { status: 500 },
  );
};

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createAthleteServiceRequestHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const identity = getAthleteIdentity(await dependencies.getAccess(request));
      if (!identity) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

      const requests = await dependencies.listRequests(identity);
      return NextResponse.json({ requests });
    } catch (error) {
      return errorResponse(error);
    }
  },
  async POST(request: Request) {
    try {
      const identity = getAthleteIdentity(await dependencies.getAccess(request));
      if (!identity) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Données invalides." }, { status: 400 });
      }
      const input = parseAthleteServiceRequestInput(body);
      const serviceRequest = await dependencies.createRequest({ ...identity, input });
      return NextResponse.json({ request: serviceRequest }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  },
  async PATCH(request: Request) {
    try {
      const identity = getAthleteIdentity(await dependencies.getAccess(request));
      if (!identity) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
      if (body?.action !== "confirm" || !requestIdPattern.test(requestId)) {
        return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
      }

      const result = await dependencies.confirmRequest({ ...identity, requestId });
      if (result.outcome === "missing") {
        return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
      }
      if (result.outcome === "conflict") {
        return NextResponse.json({ error: "Cette demande ne peut plus être confirmée." }, { status: 409 });
      }
      if (result.outcome === "insufficient_rights") {
        return NextResponse.json({ error: "Vos droits disponibles sont insuffisants pour confirmer cette demande." }, { status: 409 });
      }
      if (result.outcome === "ineligible") {
        return NextResponse.json({ error: "Votre adhésion ou votre plan ne permet plus de confirmer cette demande." }, { status: 409 });
      }
      return NextResponse.json({ request: result.request, unchanged: result.outcome === "unchanged" });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

const handlers = createAthleteServiceRequestHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
