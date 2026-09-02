import { NextResponse } from "next/server";
import {
  AthleteServiceRequestError,
  createAthleteServiceRequest,
  listAthleteServiceRequests,
  parseAthleteServiceRequestInput,
  type AthleteServiceRequestInput,
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
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    return profile?.userAccess ?? null;
  },
  listRequests: listAthleteServiceRequests,
  createRequest: createAthleteServiceRequest,
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
});

const handlers = createAthleteServiceRequestHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
