import { NextResponse } from "next/server";
import {
  activateAthleteMembershipProspectOrder,
  AthleteMembershipProspectOrderError,
  type ActivatedAthleteMembershipProspectOrder,
} from "@/lib/athlete-membership-prospect-orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

type HandlerDependencies = {
  activate: (
    request: Request,
    input: { orderId: string; athleteId: string },
  ) => Promise<ActivatedAthleteMembershipProspectOrder>;
};

const defaultDependencies: HandlerDependencies = {
  activate: activateAthleteMembershipProspectOrder,
};

class AdminAthleteMembershipProspectOrderActivationRouteError extends Error {}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateRequest = async (
  request: Request,
  context: RouteContext,
): Promise<{ orderId: string; athleteId: string }> => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }

  const { orderId } = await context.params;
  if (!uuidPattern.test(orderId)) {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }

  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }
  const text = await request.text();
  if (!text.trim()) {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "athleteId") {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }
  const athleteId = (body as { athleteId?: unknown }).athleteId;
  if (
    typeof athleteId !== "string"
    || !athleteId
    || athleteId !== athleteId.trim()
    || athleteId.length > 200
    || /[\u0000-\u001f\u007f]/.test(athleteId)
  ) {
    throw new AdminAthleteMembershipProspectOrderActivationRouteError();
  }
  return { orderId, athleteId };
};

const publicOrder = (order: ActivatedAthleteMembershipProspectOrder["order"]) => ({
  id: order.id,
  publicReference: order.publicReference,
  verifiedEmail: order.verifiedEmail,
  fullName: order.fullName,
  phone: order.phone,
  planCode: order.planCode,
  planName: order.planName,
  annualPriceChf: order.annualPriceChf,
  durationMonths: order.durationMonths,
  productionCredits: order.productionCredits,
  customContentCredits: order.customContentCredits,
  videoAllowed: order.videoAllowed,
  paymentMethod: order.paymentMethod,
  status: order.status,
  athleteId: order.athleteId,
  membershipId: order.membershipId,
  termsVersion: order.termsVersion,
  termsAcceptedAt: order.termsAcceptedAt,
  expiresAt: order.expiresAt,
  paidAt: order.paidAt,
  cancelledAt: order.cancelledAt,
  activatedAt: order.activatedAt,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

const publicMembership = (membership: ActivatedAthleteMembershipProspectOrder["membership"]) => ({
  id: membership.id,
  athleteId: membership.athleteId,
  membershipKind: membership.membershipKind,
  planCode: membership.planCode,
  status: membership.status,
  startsAt: membership.startsAt,
  endsAt: membership.endsAt,
  autoRenew: membership.autoRenew,
  paymentInstallments: membership.paymentInstallments,
  source: membership.source,
  createdAt: membership.createdAt,
  updatedAt: membership.updatedAt,
});

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof AdminAthleteMembershipProspectOrderActivationRouteError) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (error instanceof AthleteMembershipProspectOrderError) {
    const status = error.code === "validation"
      ? 400
      : error.code === "unauthorized"
        ? 401
        : error.code === "forbidden"
          ? 403
          : error.code === "not_found"
            ? 404
            : error.code === "conflict" || error.code === "expired"
              ? 409
              : 500;
    return NextResponse.json(
      { error: status === 500 ? "Une erreur interne est survenue." : error.message },
      { status },
    );
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAdminAthleteMembershipProspectOrderActivationHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async POST(request: Request, context: RouteContext) {
    try {
      const input = await validateRequest(request, context);
      const result = await dependencies.activate(request, input);
      return NextResponse.json({
        order: publicOrder(result.order),
        membership: publicMembership(result.membership),
        alreadyActivated: result.alreadyActivated,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

const handlers = createAdminAthleteMembershipProspectOrderActivationHandlers();
export const POST = handlers.POST;