import { NextResponse } from "next/server";
import {
  listCanonicalCreativeMissions,
  type CanonicalCreativeMissionListResult,
} from "@/lib/canonical-creative-missions";
import {
  closeAdminOperationalMission,
  createAdminOperationalMission,
  listOperationalCreativeCandidates,
  parseOperationalMissionDraftInput,
  updateAdminOperationalMission,
  type OperationalCreativeCandidate,
} from "@/lib/operational-creative-missions";
import {
  createProductionCreativeBriefFromCanonicalMission,
  transitionProductionCreativeBrief,
} from "@/lib/admin-production-creative";
import {
  createProductionBriefFromAthleteSession,
  listAdminAthleteSessionRequests,
  parseAthleteSessionProductionInput,
  transitionAthleteSessionRequestAsAdmin,
} from "@/lib/athlete-session-requests";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  listMissions: (input: { workspaceId: string }) => Promise<CanonicalCreativeMissionListResult>;
  listCandidates: (input: {
    workspaceId: string;
    from: string;
    to: string;
  }) => Promise<OperationalCreativeCandidate[]>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listMissions: listCanonicalCreativeMissions,
  listCandidates: listOperationalCreativeCandidates,
};

export const createAdminMissionListHandler = (
  dependencyOverrides: Partial<HandlerDependencies> = {},
) => async (request: Request) => {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  try {
    const access = await requireCreativeAdminContext(request, dependencies.getAccess);
    if ("response" in access) return access.response;
    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
    const [result, candidates] = await Promise.all([
      dependencies.listMissions({
        workspaceId: access.context.workspaceId,
      }),
      dependencies.listCandidates({
        workspaceId: access.context.workspaceId,
        from,
        to,
      }),
    ]);
    return NextResponse.json({ ...result, candidates }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const diagnostic = error && typeof error === "object"
      ? error as { code?: unknown; constraint?: unknown; name?: unknown }
      : null;
    console.error("[admin_missions][get_failed]", {
      code: typeof diagnostic?.code === "string" ? diagnostic.code : null,
      constraint: typeof diagnostic?.constraint === "string" ? diagnostic.constraint : null,
      type: typeof diagnostic?.name === "string" ? diagnostic.name : typeof error,
    });
    return NextResponse.json(
      { error: "Impossible de charger les missions créatives." },
      { status: 500 },
    );
  }
};

export const GET = createAdminMissionListHandler();

const mutationError = (
  error: unknown,
  label: string,
) => {
  console.error(`[admin_missions][${label}]`, {
    type: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : null,
  });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Action impossible." },
    { status: 400 },
  );
};

export async function POST(request: Request) {
  try {
    const access = await requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);
    if ("response" in access) return access.response;
    const input = parseOperationalMissionDraftInput(await request.json());
    const result = await createAdminOperationalMission({
      ...access.context,
      input,
    });
    return NextResponse.json(result, { status: result.outcome === "changed" ? 201 : 200 });
  } catch (error) {
    return mutationError(error, "create_failed");
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);
    if ("response" in access) return access.response;
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const missionId = String(body.missionId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "");

    if (action === "update") {
      const input = parseOperationalMissionDraftInput(body.mission);
      const outcome = await updateAdminOperationalMission({
        ...access.context,
        missionId,
        input,
      });
      return NextResponse.json({ outcome }, {
        status: outcome === "not_found" ? 404 : outcome === "conflict" ? 409 : 200,
      });
    }

    if (action === "close") {
      const outcome = await closeAdminOperationalMission({
        ...access.context,
        missionId,
        reason: String(body.reason ?? ""),
        idempotencyKey,
      });
      return NextResponse.json({ outcome }, {
        status: outcome === "not_found" ? 404 : outcome === "conflict" ? 409 : 200,
      });
    }

    if (["organize_request", "request_complement", "close_request"].includes(action)) {
      const sourceAction = action === "organize_request"
        ? "accept"
        : action === "request_complement"
          ? "request_changes"
          : "refuse";
      const outcome = await transitionAthleteSessionRequestAsAdmin({
        ...access.context,
        requestId: String(body.requestId ?? ""),
        action: sourceAction,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        idempotencyKey,
      });
      return NextResponse.json({ outcome }, {
        status: outcome === "not_found" ? 404 : outcome === "conflict" ? 409 : 200,
      });
    }

    if (action === "propose_admin") {
      const prepared = await createProductionCreativeBriefFromCanonicalMission(
        access.context,
        {
          missionId,
          recipientIds: Array.isArray(body.recipientIds)
            ? body.recipientIds.map(String)
            : [],
        },
      );
      if (!prepared.briefId) {
        const message = prepared.outcome === "invalid_recipients"
          ? "Un créatif sélectionné est introuvable ou inactif."
          : prepared.outcome === "not_found"
            ? "Mission introuvable."
            : "Complétez la région, le contexte, les livrables et les conditions avant de proposer.";
        return NextResponse.json({ error: message }, {
          status: prepared.outcome === "not_found" ? 404 : 409,
        });
      }
      if (prepared.status === "draft") {
        const outcome = await transitionProductionCreativeBrief(access.context, {
          briefId: prepared.briefId,
          action: "publish",
        });
        if (outcome !== "changed") {
          return NextResponse.json({ error: "La proposition n’a pas pu être publiée." }, {
            status: outcome === "not_found" ? 404 : 409,
          });
        }
      }
      return NextResponse.json({
        outcome: prepared.outcome,
        briefId: prepared.briefId,
      });
    }

    if (action === "propose_athlete") {
      const requestId = String(body.requestId ?? "");
      const target = (await listAdminAthleteSessionRequests({
        workspaceId: access.context.workspaceId,
      })).find((item) => item.id === requestId);
      if (!target) {
        return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
      }
      const prepared = await createProductionBriefFromAthleteSession({
        ...access.context,
        requestId,
        athleteName: target.athleteName ?? target.athleteId,
        input: parseAthleteSessionProductionInput(body.production),
      });
      if (!prepared.briefId) {
        return NextResponse.json(
          { error: "La demande doit être organisée avant la proposition." },
          { status: 409 },
        );
      }
      const outcome = await transitionProductionCreativeBrief(access.context, {
        briefId: prepared.briefId,
        action: "publish",
      });
      if (outcome !== "changed" && prepared.outcome !== "unchanged") {
        return NextResponse.json({ error: "La proposition n’a pas pu être publiée." }, {
          status: outcome === "not_found" ? 404 : 409,
        });
      }
      return NextResponse.json({ outcome: prepared.outcome, briefId: prepared.briefId });
    }

    if (action === "assign") {
      const outcome = await transitionProductionCreativeBrief(access.context, {
        briefId: String(body.briefId ?? ""),
        action: "assign",
        creativeProfileId: String(body.creativeProfileId ?? ""),
      });
      return NextResponse.json({ outcome }, {
        status: outcome === "not_found" ? 404 : outcome === "conflict" ? 409 : 200,
      });
    }

    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  } catch (error) {
    return mutationError(error, "mutation_failed");
  }
}
