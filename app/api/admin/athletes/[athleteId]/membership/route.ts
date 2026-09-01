import { NextRequest, NextResponse } from "next/server";
import {
  AthleteMembershipActiveConflictError,
  AthleteMembershipPlanChangeError,
  AthleteMembershipValidationError,
  createAthleteMembershipAsAdmin,
  getCurrentAthleteMembership,
  isAthleteMembershipKind,
  isAthleteMembershipPaymentMode,
  isAthleteMembershipStatus,
  updateAthleteMembershipAsAdmin,
  type AthleteMembershipAdminInput,
} from "@/lib/athlete-memberships";
import { listActiveAthleteMembershipPlans } from "@/lib/athlete-credits";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ athleteId: string }> };

const authorizeAdmin = async (request: NextRequest, context: RouteContext) => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const { athleteId: rawAthleteId } = await context.params;
  const athleteId = rawAthleteId.trim();

  if (access?.role !== "admin" || access.status !== "active" || !workspaceId) return null;
  if (!athleteId) return null;

  const athletes = await getAthletesFromGoogleSheets();
  const athleteIndex = athletes.findIndex((athlete) => athlete.key === athleteId);
  if (athleteIndex < 0) return null;

  return { workspaceId, athleteId, athleteIndex, athlete: athletes[athleteIndex] };
};

const readAdminInput = (body: Record<string, unknown>): AthleteMembershipAdminInput => {
  if (!isAthleteMembershipKind(body.membershipKind)) {
    throw new AthleteMembershipValidationError("Type d’adhésion invalide.");
  }
  if (!isAthleteMembershipStatus(body.status)) {
    throw new AthleteMembershipValidationError("Statut d’adhésion invalide.");
  }
  if (typeof body.autoRenew !== "boolean") {
    throw new AthleteMembershipValidationError("Le renouvellement automatique est invalide.");
  }

  const paymentMode = body.paymentMode === null || body.paymentMode === "" ? null : body.paymentMode;
  if (paymentMode !== null && !isAthleteMembershipPaymentMode(paymentMode)) {
    throw new AthleteMembershipValidationError("Le mode de paiement est invalide.");
  }

  return {
    membershipKind: body.membershipKind,
    planCode: typeof body.planCode === "string" ? body.planCode : null,
    status: body.status,
    startsAt: typeof body.startsAt === "string" ? body.startsAt : "",
    endsAt: typeof body.endsAt === "string" && body.endsAt.trim() ? body.endsAt : null,
    autoRenew: body.autoRenew,
    paymentMode,
  };
};

const errorResponse = (error: unknown) => {
  if (error instanceof AthleteMembershipValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof AthleteMembershipActiveConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof AthleteMembershipPlanChangeError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "Impossible de gérer cette adhésion pour le moment." }, { status: 500 });
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authorized = await authorizeAdmin(request, context);
    if (!authorized) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

    const [membership, plans] = await Promise.all([
      getCurrentAthleteMembership({
        workspaceId: authorized.workspaceId,
        athleteId: authorized.athleteId,
        historical: {
          startDate: authorized.athlete.adhesionDate,
          athleteIndex: authorized.athleteIndex,
        },
      }),
      listActiveAthleteMembershipPlans(),
    ]);
    return NextResponse.json({ membership, plans });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const authorized = await authorizeAdmin(request, context);
    if (!authorized) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

    const body = (await request.json()) as Record<string, unknown>;
    if (body.membershipKind === "subscription" && body.paymentMode === "monthly_12") {
      throw new AthleteMembershipValidationError("L’offre Athlète V1 requiert un paiement annuel en une fois.");
    }
    const membership = await createAthleteMembershipAsAdmin({
      workspaceId: authorized.workspaceId,
      athleteId: authorized.athleteId,
      input: readAdminInput(body),
    });
    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authorized = await authorizeAdmin(request, context);
    if (!authorized) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

    const body = (await request.json()) as Record<string, unknown>;
    const membershipId = typeof body.membershipId === "string" ? body.membershipId.trim() : "";
    if (!membershipId) {
      throw new AthleteMembershipValidationError("L’identifiant de l’adhésion est obligatoire.");
    }

    const membership = await updateAthleteMembershipAsAdmin({
      id: membershipId,
      workspaceId: authorized.workspaceId,
      athleteId: authorized.athleteId,
      input: readAdminInput(body),
    });
    if (!membership) return NextResponse.json({ error: "Adhésion introuvable." }, { status: 404 });
    return NextResponse.json({ membership });
  } catch (error) {
    return errorResponse(error);
  }
}