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
import {
  parseAdminCreativeMissionReviewInput,
  reviewAdminCreativeMissionDelivery,
  type AdminCreativeMissionReviewResult,
} from "@/lib/creative-mission-admin-review";

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
  reviewDelivery?: (input: {
    workspaceId: string;
    requestId: string;
    action: "changes_requested" | "completed";
    note: string | null;
    idempotencyKey: string;
    clerkUserId: string;
  }) => Promise<AdminCreativeMissionReviewResult>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listMissions: listAthleteServiceMissions,
  saveMission: saveAthleteServiceMission,
  cancelMission: cancelAthleteServiceMission,
  reviewDelivery: reviewAdminCreativeMissionDelivery,
};

export const logAdminMissionReadError = (error: unknown): void => {
  const diagnostic = error && typeof error === "object"
    ? error as { code?: unknown; constraint?: unknown; name?: unknown }
    : null;
  console.error("[admin_athlete_service_missions][get_failed]", {
    code: typeof diagnostic?.code === "string" ? diagnostic.code : null,
    constraint: typeof diagnostic?.constraint === "string" ? diagnostic.constraint : null,
    type: typeof diagnostic?.name === "string" ? diagnostic.name : typeof error,
  });
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
  if (body.action === "changes_requested" || body.action === "completed") {
    return {
      kind: "review" as const,
      ...parseAdminCreativeMissionReviewInput(body),
    };
  }
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
      kind: "mission" as const,
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
    kind: "mission" as const,
    action: "save" as const,
    requestId: body.requestId,
    idempotencyKey: body.idempotencyKey,
    mission: parseAthleteServiceMissionInput(body.mission),
  };
};

const reviewResponse = (result: AdminCreativeMissionReviewResult): NextResponse => {
  if (result.outcome === "changed" || result.outcome === "unchanged") {
    return NextResponse.json({ ok: true, unchanged: result.outcome === "unchanged" });
  }
  if (result.outcome === "mission_not_found") {
    return NextResponse.json({ error: "Mission créative introuvable." }, { status: 404 });
  }
  if (result.outcome === "pack_not_supported") {
    return NextResponse.json(
      { error: "Cette prestation comporte plusieurs livraisons et ne peut pas être validée ici." },
      { status: 409 },
    );
  }
  if (result.outcome === "insufficient_rights") {
    return NextResponse.json({ error: "Les droits disponibles sont insuffisants." }, { status: 409 });
  }
  if (result.outcome === "ineligible") {
    return NextResponse.json({ error: "L’adhésion active ne permet plus cette clôture." }, { status: 409 });
  }
  if (result.outcome === "idempotency_conflict") {
    return NextResponse.json(
      { error: "Cette opération a déjà été utilisée avec un autre contenu." },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: "La mission, la livraison ou la demande n’est plus dans un état compatible." },
    { status: 409 },
  );
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
      logAdminMissionReadError(error);
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
      if (body.kind === "review") {
        const reviewDelivery = dependencies.reviewDelivery ?? reviewAdminCreativeMissionDelivery;
        const result = await reviewDelivery({
          workspaceId: access.context.workspaceId,
          requestId: body.requestId,
          action: body.action,
          note: body.note,
          idempotencyKey: body.idempotencyKey,
          clerkUserId: access.context.clerkUserId,
        });
        return reviewResponse(result);
      }
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
        || (error instanceof Error && /UUID|requis|obligatoire|invalide|dépasser/.test(error.message))
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
