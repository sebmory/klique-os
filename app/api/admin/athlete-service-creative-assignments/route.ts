import { NextResponse } from "next/server";
import {
  changeAthleteServiceCreativeAssignment,
  listActiveAssignmentCreatives,
  listAthleteServiceCreativeAssignments,
  type AssignmentCreativeSummary,
  type AthleteServiceCreativeAssignment,
  type AthleteServiceCreativeAssignmentResult,
} from "@/lib/athlete-service-creative-assignments";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  listCreatives: (input: { workspaceId: string }) => Promise<AssignmentCreativeSummary[]>;
  listAssignments: (input: {
    workspaceId: string;
    requestId?: string;
    athleteId?: string;
  }) => Promise<AthleteServiceCreativeAssignment[]>;
  changeAssignment: (input: {
    workspaceId: string;
    requestId: string;
    creativeProfileId: string | null;
    idempotencyKey: string;
    authoredByClerkUserId: string;
  }) => Promise<AthleteServiceCreativeAssignmentResult>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listCreatives: listActiveAssignmentCreatives,
  listAssignments: listAthleteServiceCreativeAssignments,
  changeAssignment: changeAthleteServiceCreativeAssignment,
};

const readPatchBody = async (request: Request) => {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("invalid_input");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_input");
  const keys = Object.keys(body);
  if (
    keys.some((key) => !["requestId", "creativeProfileId", "idempotencyKey"].includes(key))
    || keys.length !== 3
    || typeof body.requestId !== "string"
    || (body.creativeProfileId !== null && typeof body.creativeProfileId !== "string")
    || typeof body.idempotencyKey !== "string"
  ) {
    throw new Error("invalid_input");
  }
  return {
    requestId: body.requestId,
    creativeProfileId: body.creativeProfileId as string | null,
    idempotencyKey: body.idempotencyKey,
  };
};

export const createAdminAthleteServiceCreativeAssignmentHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      const searchParams = new URL(request.url).searchParams;
      const requestId = searchParams.get("requestId")?.trim();
      const athleteId = searchParams.get("athleteId")?.trim();
      if (
        [...searchParams.keys()].some((key) => key !== "requestId" && key !== "athleteId")
        || (requestId && athleteId)
      ) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const [creatives, assignments] = await Promise.all([
        dependencies.listCreatives({ workspaceId: access.context.workspaceId }),
        dependencies.listAssignments({
          workspaceId: access.context.workspaceId,
          ...(requestId ? { requestId } : {}),
          ...(athleteId ? { athleteId } : {}),
        }),
      ]);
      return NextResponse.json({ creatives, assignments }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if (error instanceof Error && /UUID|requis/.test(error.message)) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      return NextResponse.json(
        { error: "Impossible de charger les affectations créatives." },
        { status: 500 },
      );
    }
  },
  async PATCH(request: Request) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      if ([...new URL(request.url).searchParams.keys()].length > 0) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const body = await readPatchBody(request);
      const result = await dependencies.changeAssignment({
        workspaceId: access.context.workspaceId,
        requestId: body.requestId,
        creativeProfileId: body.creativeProfileId,
        idempotencyKey: body.idempotencyKey,
        authoredByClerkUserId: access.context.clerkUserId,
      });
      if (result.outcome === "missing_request") {
        return NextResponse.json({ error: "Demande de prestation introuvable." }, { status: 404 });
      }
      if (result.outcome === "invalid_creative") {
        return NextResponse.json(
          { error: "Le créatif doit être actif et appartenir au workspace." },
          { status: 409 },
        );
      }
      if (result.outcome === "idempotency_conflict") {
        return NextResponse.json(
          { error: "Cette opération a déjà été utilisée avec une autre affectation." },
          { status: 409 },
        );
      }
      return NextResponse.json({
        assignment: result.assignment,
        unchanged: result.outcome === "unchanged",
      });
    } catch (error) {
      if (error instanceof Error && (error.message === "invalid_input" || /UUID|requis/.test(error.message))) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      return NextResponse.json(
        { error: "Impossible de modifier l’affectation créative." },
        { status: 500 },
      );
    }
  },
});

const handlers = createAdminAthleteServiceCreativeAssignmentHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
