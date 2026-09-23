import { NextResponse } from "next/server";
import {
  AthleteMembershipOrderError,
  confirmAthleteMembershipOrder,
  type ConfirmedAthleteMembershipOrder,
} from "@/lib/athlete-membership-orders";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

type AdminAccess = {
  clerkUserId?: string | null;
  role?: string;
  status?: string;
  workspaceId?: string | null;
} | null;

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AdminAccess>;
  confirm: (request: Request, orderId: string) => Promise<ConfirmedAthleteMembershipOrder>;
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
    };
  },
  confirm: confirmAthleteMembershipOrder,
};

class AdminAthleteMembershipOrderConfirmationRouteError extends Error {}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireAdmin = async (
  request: Request,
  dependencies: HandlerDependencies,
): Promise<NextResponse | null> => {
  const access = await dependencies.getAccess(request);
  if (!access?.clerkUserId?.trim()) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (access.role !== "admin" || access.status !== "active" || !access.workspaceId?.trim()) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  return null;
};

const validateRequest = async (request: Request, context: RouteContext): Promise<string> => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new AdminAthleteMembershipOrderConfirmationRouteError();
  }
  const { orderId: rawOrderId } = await context.params;
  const orderId = rawOrderId.trim();
  if (!uuidPattern.test(orderId)) {
    throw new AdminAthleteMembershipOrderConfirmationRouteError();
  }

  const text = await request.text();
  if (!text.trim()) return orderId;
  const body: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch {
      throw new AdminAthleteMembershipOrderConfirmationRouteError();
    }
  })();
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new AdminAthleteMembershipOrderConfirmationRouteError();
  }
  return orderId;
};

const publicOrder = (order: ConfirmedAthleteMembershipOrder["order"]) => ({
  id: order.id,
  publicReference: order.publicReference,
  athleteId: order.athleteId,
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
});

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof AdminAthleteMembershipOrderConfirmationRouteError) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (error instanceof AthleteMembershipOrderError) {
    const status = error.code === "forbidden"
      ? 403
      : error.code === "validation"
        ? 400
        : error.code === "not_found"
          ? 404
          : error.code === "conflict" || error.code === "expired"
            ? 409
            : 500;
    const message = status === 500 ? "Une erreur interne est survenue." : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAdminAthleteMembershipOrderConfirmationHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async POST(request: Request, context: RouteContext) {
    try {
      const accessError = await requireAdmin(request, dependencies);
      if (accessError) return accessError;
      const orderId = await validateRequest(request, context);
      const result = await dependencies.confirm(request, orderId);
      return NextResponse.json({
        order: publicOrder(result.order),
        membershipId: result.membershipId,
        alreadyPaid: result.alreadyPaid,
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

const handlers = createAdminAthleteMembershipOrderConfirmationHandlers();
export const POST = handlers.POST;