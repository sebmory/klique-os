import { NextRequest, NextResponse } from "next/server";
import {
  cancelAthleteIncludedServiceRealization,
  listAthleteAdminServiceRealizations,
  type AthleteAdminServiceRealization,
  type CancelAthleteIncludedServiceRealizationInput,
  type CancelAthleteIncludedServiceRealizationResult,
} from "@/lib/athlete-membership-service-realizations";
import {
  getAthleteMembershipServiceSummary,
  type AthleteMembershipServiceSummary,
} from "@/lib/athlete-membership-service-summary";
import { readAthleteMembershipsFromNeon } from "@/lib/athlete-memberships";
import {
  athleteRealizationErrorResponse,
  getAthleteRealizationAdminAccess,
} from "@/app/api/admin/athletes/[athleteId]/membership/realizations/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ athleteId: string; realizationId: string }> };
type RefreshInput = Pick<CancelAthleteIncludedServiceRealizationInput, "workspaceId" | "athleteId" | "membershipId">;
type HandlerDependencies = {
  getAdminAccess: typeof getAthleteRealizationAdminAccess;
  cancelRealization: (input: CancelAthleteIncludedServiceRealizationInput) => Promise<CancelAthleteIncludedServiceRealizationResult>;
  refresh: (input: RefreshInput) => Promise<{
    serviceSummary: AthleteMembershipServiceSummary;
    realizations: AthleteAdminServiceRealization[];
  }>;
};

const defaultDependencies: HandlerDependencies = {
  getAdminAccess: getAthleteRealizationAdminAccess,
  cancelRealization: cancelAthleteIncludedServiceRealization,
  async refresh(input) {
    const memberships = await readAthleteMembershipsFromNeon(input.workspaceId, input.athleteId);
    const membership = memberships.find((record) => (
      record.id === input.membershipId
      && record.workspaceId === input.workspaceId
      && record.athleteId === input.athleteId
    ));
    if (!membership) throw new Error("L’adhésion annulée ne peut pas être rechargée.");
    const [serviceSummary, realizations] = await Promise.all([
      getAthleteMembershipServiceSummary({ ...input, membership }),
      listAthleteAdminServiceRealizations(input),
    ]);
    return { serviceSummary, realizations };
  },
};

export const createAthleteRealizationCancellationHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async POST(request: NextRequest, context: RouteContext) {
    try {
      const params = await context.params;
      const athleteId = params.athleteId.trim();
      const access = await dependencies.getAdminAccess(request, athleteId);
      if (
        access.role !== "admin" || access.status !== "active"
        || !access.workspaceId || !access.clerkUserId || !athleteId || !access.athleteExists
      ) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }
      const body: unknown = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).some((key) => !["membershipId", "reason"].includes(key))
        || !("membershipId" in body) || typeof body.membershipId !== "string"
        || !("reason" in body) || typeof body.reason !== "string") {
        return NextResponse.json({ error: "Données invalides." }, { status: 400 });
      }
      const scope = {
        workspaceId: access.workspaceId,
        athleteId,
        membershipId: body.membershipId.trim(),
      };
      const result = await dependencies.cancelRealization({
        ...scope,
        realizationId: params.realizationId,
        reason: body.reason,
        adminClerkUserId: access.clerkUserId,
      });
      const payload = {
        requestId: result.requestId,
        cancellation: result.cancellation,
        unchanged: result.outcome === "unchanged",
      };
      try {
        return NextResponse.json({ ...payload, ...await dependencies.refresh(scope) });
      } catch (error) {
        console.error("[athlete_service_realization] cancellation refresh failed", error);
        return NextResponse.json({
          ...payload,
          refreshError: "Annulation enregistrée, mais le rafraîchissement a échoué. Rechargez l’adhésion.",
        });
      }
    } catch (error) {
      return athleteRealizationErrorResponse(error);
    }
  },
});

export const POST = createAthleteRealizationCancellationHandlers().POST;
