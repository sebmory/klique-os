import { NextResponse } from "next/server";
import {
  parseAthleteServiceMissionInput,
  AthleteServiceMissionValidationError,
  type AthleteServiceMissionInput,
  type AthleteServiceMissionRecord,
} from "@/lib/athlete-service-mission-domain";
import {
  cancelAthleteServiceMission,
  listAthleteServiceMissions,
  saveAthleteServiceMission,
  type AthleteServiceMissionMutationResult,
} from "@/lib/athlete-service-missions";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  listMissions: (input: {
    workspaceId: string;
    requestId?: string;
    athleteId?: string;
  }) => Promise<AthleteServiceMissionRecord[]>;
  saveMission: (input: {
    workspaceId: string;
    requestId: string;
    mission: AthleteServiceMissionInput;
    idempotencyKey: string;
    authoredByClerkUserId: string;
  }) => Promise<AthleteServiceMissionMutationResult>;
  cancelMission: (input: {
    workspaceId: string;
    requestId: string;
    idempotencyKey: string;
    authoredByClerkUserId: string;
  }) => Promise<AthleteServiceMissionMutationResult>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listMissions: listAthleteServiceMissions,
  saveMission: saveAthleteServiceMission,
  cancelMission: cancelAthleteServiceMission,
};

const readJson = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new AthleteServiceMissionValidationError("Requête invalide.");
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AthleteServiceMissionValidationError("Requête invalide.");
  }
  return body as Record<string, unknown>;
};

const parseMutationBody = async (request: Request) => {
  const body = await readJson(request);
  if (
    typeof body.requestId !== "string"
    || typeof body.idempotencyKey !== "string"
    || (body.action !== "save" && body.action !== "cancel")
  ) {
    throw new AthleteServiceMissionValidationError("Requête invalide.");
  }
  if (body.action === "cancel") {
    if (
      Object.keys(body).length !== 3
      || Object.keys(body).some((key) => !["action", "requestId", "idempotencyKey"].includes(key))
    ) {
      throw new AthleteServiceMissionValidationError("Requête invalide.");
    }
    return {
      action: "cancel" as const,
      requestId: body.requestId,
      idempotencyKey: body.idempotencyKey,
    };
  }
  if (
    Object.keys(body).length !== 4
    || Object.keys(body).some((key) => !["action", "requestId", "idempotencyKey", "mission"].includes(key))
  ) {
    throw new AthleteServiceMissionValidationError("Requête invalide.");
  }
  return {
    action: "save" as const,
    requestId: body.requestId,
    idempotencyKey: body.idempotencyKey,
    mission: parseAthleteServiceMissionInput(body.mission),
  };
};

const mutationResponse = (result: AthleteServiceMissionMutationResult): NextResponse => {
  if (result.outcome === "missing_request") {
    return NextResponse.json({ error: "Demande de prestation introuvable." }, { status: 404 });
  }
  if (result.outcome === "missing_mission") {
    return NextResponse.json({ error: "Fiche mission introuvable." }, { status: 404 });
  }
  if (result.outcome === "cancelled") {
    return NextResponse.json(
      { error: "Une mission annulée ne peut plus être modifiée." },
      { status: 409 },
    );
  }
  if (result.outcome === "idempotency_conflict") {
    return NextResponse.json(
      { error: "Cette opération a déjà été utilisée avec un autre contenu." },
      { status: 409 },
    );
  }
  return NextResponse.json({
    record: result.record,
    unchanged: result.outcome === "unchanged",
  });
};

export const createAdminAthleteServiceMissionHandlers = (
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
        || (!requestId && !athleteId)
      ) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const records = await dependencies.listMissions({
        workspaceId: access.context.workspaceId,
        ...(requestId ? { requestId } : {}),
        ...(athleteId ? { athleteId } : {}),
      });
      return NextResponse.json({ records }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if (
        error instanceof AthleteServiceMissionValidationError
        || (error instanceof Error && /UUID|requis/.test(error.message))
      ) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      return NextResponse.json(
        { error: "Impossible de charger les fiches mission." },
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
      const body = await parseMutationBody(request);
      const common = {
        workspaceId: access.context.workspaceId,
        requestId: body.requestId,
        idempotencyKey: body.idempotencyKey,
        authoredByClerkUserId: access.context.clerkUserId,
      };
      const result = body.action === "save"
        ? await dependencies.saveMission({ ...common, mission: body.mission })
        : await dependencies.cancelMission(common);
      return mutationResponse(result);
    } catch (error) {
      if (
        error instanceof AthleteServiceMissionValidationError
        || (error instanceof Error && /UUID|requis/.test(error.message))
      ) {
        return NextResponse.json(
          { error: error instanceof AthleteServiceMissionValidationError ? error.message : "Requête invalide." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Impossible de modifier la fiche mission." },
        { status: 500 },
      );
    }
  },
});

const handlers = createAdminAthleteServiceMissionHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
