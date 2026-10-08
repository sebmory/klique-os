import { NextRequest, NextResponse } from "next/server";
import {
  AthleteIncludedServiceRealizationError,
  recordAthleteIncludedServiceRealization,
  type RecordAthleteIncludedServiceRealizationInput,
  type RecordAthleteIncludedServiceRealizationResult,
} from "@/lib/athlete-membership-service-realizations";
import type { AthleteCreditType } from "@/lib/athlete-credits";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ athleteId: string }> };

type HandlerDependencies = {
  getAdminAccess: (request: NextRequest, athleteId: string) => Promise<{
    clerkUserId: string;
    role: string | undefined;
    status: string | undefined;
    workspaceId: string;
    athleteExists: boolean;
  }>;
  recordRealization: (
    input: RecordAthleteIncludedServiceRealizationInput,
  ) => Promise<RecordAthleteIncludedServiceRealizationResult>;
};

const defaultDependencies: HandlerDependencies = {
  async getAdminAccess(request, athleteId) {
    const profile = await getCurrentUserAccessProfile(request);
    const role = profile?.userAccess?.role;
    const status = profile?.userAccess?.status;
    const workspaceId = profile?.userAccess?.workspaceId?.trim() ?? "";
    const clerkUserId = profile?.clerkUser.id?.trim() ?? "";
    const canCheckAthlete = role === "admin" && status === "active" && Boolean(workspaceId && clerkUserId);
    const athletes = canCheckAthlete ? await getAthletesFromGoogleSheets() : [];
    return {
      clerkUserId,
      role,
      status,
      workspaceId,
      athleteExists: athletes.some((athlete) => athlete.key === athleteId),
    };
  },
  recordRealization: recordAthleteIncludedServiceRealization,
};

const errorResponse = (error: unknown) => {
  if (error instanceof AthleteIncludedServiceRealizationError) {
    const status = error.code === "not_found"
      ? 404
      : error.code === "inactive" || error.code === "insufficient_rights"
        ? 409
        : error.code === "transaction"
          ? 500
          : 400;
    return NextResponse.json({
      error: error.message,
      code: error.code === "transaction" ? "transaction_failed" : error.code,
    }, { status });
  }
  return NextResponse.json(
    { error: "Impossible d’enregistrer cette réalisation pour le moment." },
    { status: 500 },
  );
};

export const createAthleteIncludedServiceRealizationHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async POST(request: NextRequest, context: RouteContext) {
    try {
      const { athleteId: rawAthleteId } = await context.params;
      const athleteId = rawAthleteId.trim();
      const access = await dependencies.getAdminAccess(request, athleteId);
      if (
        access.role !== "admin"
        || access.status !== "active"
        || !access.workspaceId
        || !access.clerkUserId
        || !athleteId
        || !access.athleteExists
      ) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || Object.keys(body).some((key) => (
        !["realizationId", "membershipId", "creditType", "occurredAt", "note"].includes(key)
      ))) {
        return NextResponse.json({ error: "Données invalides." }, { status: 400 });
      }

      const result = await dependencies.recordRealization({
        realizationId: typeof body.realizationId === "string" ? body.realizationId : "",
        workspaceId: access.workspaceId,
        athleteId,
        membershipId: typeof body.membershipId === "string" ? body.membershipId : "",
        creditType: body.creditType as AthleteCreditType,
        occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : "",
        note: typeof body.note === "string" || body.note === null ? body.note : undefined,
        adminClerkUserId: access.clerkUserId,
      });
      return NextResponse.json(
        { requestId: result.requestId, unchanged: result.outcome === "unchanged" },
        { status: result.outcome === "created" ? 201 : 200 },
      );
    } catch (error) {
      return errorResponse(error);
    }
  },
});

const handlers = createAthleteIncludedServiceRealizationHandlers();
export const POST = handlers.POST;
