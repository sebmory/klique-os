import { NextResponse } from "next/server";
import { listActiveAssignmentCreatives } from "@/lib/athlete-service-creative-assignments";
import {
  confirmAthleteSessionFinally,
  createProductionBriefFromAthleteSession,
  listAdminAthleteSessionRequests,
  parseAthleteSessionProductionInput,
  transitionAthleteSessionRequestAsAdmin,
} from "@/lib/athlete-session-requests";
import { listCreativeAvailability } from "@/lib/creative-availability";
import { transitionProductionCreativeBrief } from "@/lib/admin-production-creative";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
} from "@/lib/creatives/admin-route";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedStatuses = new Set([
  "draft", "submitted", "admin_review", "accepted", "refused", "changes_requested",
  "production_linked", "proposed_to_creatives", "candidate_received", "assigned",
  "creative_agreed", "confirmed", "completed", "cancelled",
]);

const loadAthleteNames = async () => {
  const athletes = await getAthletesFromGoogleSheets();
  return new Map(athletes.map((athlete) => [athlete.key, athlete.name]));
};

export async function GET(request: Request) {
  try {
    const access = await requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);
    if ("response" in access) return access.response;
    const params = new URL(request.url).searchParams;
    const allowed = ["status", "type", "region", "athleteId", "dateFrom", "dateTo"];
    if ([...params.keys()].some((key) => !allowed.includes(key))) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const status = params.get("status");
    const type = params.get("type");
    if (status && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }
    if (type && !["match_competition", "media_day"].includes(type)) {
      return NextResponse.json({ error: "Type invalide." }, { status: 400 });
    }
    const athleteNames = await loadAthleteNames();
    const allRequests = await listAdminAthleteSessionRequests({
      workspaceId: access.context.workspaceId,
      athleteNames,
    });
    const dateFrom = params.get("dateFrom");
    const dateTo = params.get("dateTo");
    const requests = allRequests.filter((item) => {
      const requestDate = item.eventStartsAt?.slice(0, 10)
        ?? item.periods[0]?.startsAt.slice(0, 10)
        ?? null;
      return (!status || item.workflowStatus === status)
        && (!type || item.requestType === type)
        && (!params.get("region") || item.region === params.get("region"))
        && (!params.get("athleteId") || item.athleteId === params.get("athleteId"))
        && (!dateFrom || Boolean(requestDate && requestDate >= dateFrom))
        && (!dateTo || Boolean(requestDate && requestDate <= dateTo));
    });
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
    const [creatives, availability] = await Promise.all([
      listActiveAssignmentCreatives({ workspaceId: access.context.workspaceId }),
      listCreativeAvailability({
        workspaceId: access.context.workspaceId,
        from: today,
        to: nextYear,
      }),
    ]);
    return NextResponse.json({ requests, creatives, availability }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[admin_session_requests][list_failed]", error);
    return NextResponse.json(
      { error: "Impossible de charger les demandes de séances." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);
    if ("response" in access) return access.response;
    const body = await request.json() as Record<string, unknown>;
    const requestId = String(body.requestId ?? "");
    const action = String(body.action ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "");
    if (["start_review", "accept", "refuse", "request_changes"].includes(action)) {
      const outcome = await transitionAthleteSessionRequestAsAdmin({
        ...access.context,
        requestId,
        action: action as "start_review" | "accept" | "refuse" | "request_changes",
        reason: typeof body.reason === "string" ? body.reason : undefined,
        idempotencyKey,
      });
      if (outcome === "not_found") {
        return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
      }
      if (outcome === "conflict") {
        return NextResponse.json({ error: "Transition impossible dans l’état actuel." }, { status: 409 });
      }
      return NextResponse.json({ ok: true, unchanged: outcome === "unchanged" });
    }
    if (action === "create_production") {
      const athleteNames = await loadAthleteNames();
      const requests = await listAdminAthleteSessionRequests({
        workspaceId: access.context.workspaceId,
        athleteNames,
      });
      const target = requests.find((item) => item.id === requestId);
      if (!target) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
      const result = await createProductionBriefFromAthleteSession({
        ...access.context,
        requestId,
        athleteName: target.athleteName ?? target.athleteId,
        input: parseAthleteSessionProductionInput(body.production),
      });
      if (result.outcome === "conflict") {
        return NextResponse.json(
          { error: "La demande doit être acceptée avant la création Production." },
          { status: 409 },
        );
      }
      return NextResponse.json({
        ok: true,
        briefId: result.briefId,
        unchanged: result.outcome === "unchanged",
      });
    }
    if (action === "publish_production" || action === "assign_creative") {
      const athleteNames = await loadAthleteNames();
      const requests = await listAdminAthleteSessionRequests({
        workspaceId: access.context.workspaceId,
        athleteNames,
      });
      const target = requests.find((item) => item.id === requestId);
      if (!target?.productionBriefId) {
        return NextResponse.json({ error: "Brief Production introuvable." }, { status: 404 });
      }
      if (
        action === "publish_production"
        && ["proposed_to_creatives", "candidate_received", "assigned", "creative_agreed", "confirmed", "completed"].includes(target.workflowStatus)
      ) {
        return NextResponse.json({ ok: true, unchanged: true });
      }
      const creativeProfileId = String(body.creativeProfileId ?? "");
      if (
        action === "assign_creative"
        && target.assignedCreativeProfileId === creativeProfileId
      ) {
        return NextResponse.json({ ok: true, unchanged: true });
      }
      const outcome = await transitionProductionCreativeBrief(access.context, {
        briefId: target.productionBriefId,
        action: action === "publish_production" ? "publish" : "assign",
        creativeProfileId: action === "assign_creative" ? creativeProfileId : undefined,
      });
      if (outcome !== "changed") {
        return NextResponse.json(
          { error: outcome === "not_found" ? "Brief Production introuvable." : "Transition Production impossible." },
          { status: outcome === "not_found" ? 404 : 409 },
        );
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "final_confirm") {
      const outcome = await confirmAthleteSessionFinally({
        ...access.context,
        requestId,
        idempotencyKey,
      });
      if (outcome === "not_found") {
        return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
      }
      if (outcome === "creative_pending") {
        return NextResponse.json(
          { error: "Le créatif doit d’abord accepter les conditions." },
          { status: 409 },
        );
      }
      if (outcome === "date_required") {
        return NextResponse.json(
          { error: "Fixez d’abord la date définitive dans les conditions Production." },
          { status: 409 },
        );
      }
      if (outcome === "conflict") {
        return NextResponse.json(
          { error: "Le créatif a déjà une mission confirmée à cette date." },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, unchanged: outcome === "unchanged" });
    }
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  } catch (error) {
    console.error("[admin_session_requests][mutation_failed]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action impossible." },
      { status: 400 },
    );
  }
}
