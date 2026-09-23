import { NextResponse } from "next/server";
import {
  AthleteMembershipOrderError,
  cancelAthleteMembershipOrder,
  createAthleteMembershipOrder,
  getCurrentAthleteMembershipOrder,
  type AthleteMembershipOrder,
  type AthleteMembershipOrderCreation,
  type AthleteMembershipOrderView,
} from "@/lib/athlete-membership-orders";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AthleteAccess = {
  clerkUserId?: string | null;
  role?: string;
  status?: string;
  workspaceId?: string | null;
  athleteId?: string | null;
} | null;

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AthleteAccess>;
  getCurrent: (request: Request) => Promise<AthleteMembershipOrderView | null>;
  create: (
    request: Request,
    input: { planCode: string },
  ) => Promise<AthleteMembershipOrderCreation>;
  cancel: (request: Request) => Promise<AthleteMembershipOrder>;
};

const defaultDependencies: HandlerDependencies = {
  async getAccess(request) {
    const profile = await getCurrentUserAccessProfile(request);
    if (!profile) return null;
    return {
      clerkUserId: profile.clerkUser.id,
      role: profile.userAccess?.role,
      status: profile.userAccess?.status,
      workspaceId: profile.userAccess?.workspaceId,
      athleteId: profile.userAccess?.athleteId,
    };
  },
  getCurrent: getCurrentAthleteMembershipOrder,
  create: createAthleteMembershipOrder,
  cancel: cancelAthleteMembershipOrder,
};

class AthleteMembershipOrderRouteError extends Error {}

const planCodes = new Set(["essential", "impact", "signature"]);

const requireAthleteAccess = async (
  request: Request,
  dependencies: HandlerDependencies,
): Promise<NextResponse | null> => {
  const access = await dependencies.getAccess(request);
  if (!access?.clerkUserId?.trim()) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (
    access.role !== "athlete"
    || access.status !== "active"
    || !access.workspaceId?.trim()
    || !access.athleteId?.trim()
  ) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  return null;
};

const rejectQuery = (request: Request): void => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new AthleteMembershipOrderRouteError();
  }
};

const rejectBody = async (request: Request): Promise<void> => {
  if ((await request.text()).length > 0) {
    throw new AthleteMembershipOrderRouteError();
  }
};

const parseCreateBody = async (request: Request): Promise<{ planCode: string }> => {
  const body: unknown = await request.json().catch(() => null);
  if (
    !body
    || typeof body !== "object"
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !("planCode" in body)
    || typeof body.planCode !== "string"
    || !planCodes.has(body.planCode)
  ) {
    throw new AthleteMembershipOrderRouteError();
  }
  return { planCode: body.planCode };
};

const publicOrder = (order: AthleteMembershipOrder | AthleteMembershipOrderView) => ({
  id: order.id,
  workspaceId: order.workspaceId,
  athleteId: order.athleteId,
  publicReference: order.publicReference,
  planCode: order.planCode,
  planName: order.planName,
  annualPriceChf: order.annualPriceChf,
  durationMonths: order.durationMonths,
  productionCredits: order.productionCredits,
  customContentCredits: order.customContentCredits,
  videoAllowed: order.videoAllowed,
  paymentMethod: order.paymentMethod,
  status: order.status,
  membershipId: order.membershipId,
  expiresAt: order.expiresAt,
  paidAt: order.paidAt,
  cancelledAt: order.cancelledAt,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  ...("twintPaymentUrl" in order ? { twintPaymentUrl: order.twintPaymentUrl } : {}),
});

const errorResponse = (error: unknown, operation: "get" | "create" | "cancel"): NextResponse => {
  if (error instanceof AthleteMembershipOrderRouteError) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (error instanceof AthleteMembershipOrderError) {
    const status = error.code === "forbidden"
      ? 403
      : error.code === "conflict" || error.code === "expired"
        ? 409
        : error.code === "not_found" || (operation === "create" && error.code === "validation")
          ? 404
          : error.code === "configuration"
            ? 500
            : 400;
    const message = status === 500 ? "Une erreur interne est survenue." : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAthleteMembershipOrderHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const accessError = await requireAthleteAccess(request, dependencies);
      if (accessError) return accessError;
      rejectQuery(request);
      const order = await dependencies.getCurrent(request);
      return NextResponse.json({ order: order ? publicOrder(order) : null });
    } catch (error) {
      return errorResponse(error, "get");
    }
  },

  async POST(request: Request) {
    try {
      const accessError = await requireAthleteAccess(request, dependencies);
      if (accessError) return accessError;
      rejectQuery(request);
      const input = await parseCreateBody(request);
      const result = await dependencies.create(request, input);
      const status = result.creationOutcome === "created" ? 201 : 200;
      return NextResponse.json({ order: publicOrder(result) }, { status });
    } catch (error) {
      return errorResponse(error, "create");
    }
  },

  async DELETE(request: Request) {
    try {
      const accessError = await requireAthleteAccess(request, dependencies);
      if (accessError) return accessError;
      rejectQuery(request);
      await rejectBody(request);
      const order = await dependencies.cancel(request);
      return NextResponse.json({ order: publicOrder(order) });
    } catch (error) {
      return errorResponse(error, "cancel");
    }
  },
});

const handlers = createAthleteMembershipOrderHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;