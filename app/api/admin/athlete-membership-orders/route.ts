import { NextResponse } from "next/server";
import {
  AthleteMembershipOrderError,
  listAdminAthleteMembershipOrders,
  type AdminAthleteMembershipOrder,
  type AdminAthleteMembershipOrderFilters,
} from "@/lib/athlete-membership-orders";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminAccess = {
  clerkUserId?: string | null;
  role?: string;
  status?: string;
  workspaceId?: string | null;
} | null;

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<AdminAccess>;
  list: (
    request: Request,
    filters: AdminAthleteMembershipOrderFilters,
  ) => Promise<AdminAthleteMembershipOrder[]>;
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
  list: listAdminAthleteMembershipOrders,
};

class AdminAthleteMembershipOrderRouteError extends Error {}

const filterNames = ["status", "athleteId", "planCode"] as const;
const statuses = new Set(["pending", "paid", "cancelled", "expired"]);
const planCodes = new Set(["essential", "impact", "signature"]);

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

const parseFilters = (request: Request): AdminAthleteMembershipOrderFilters => {
  const searchParams = new URL(request.url).searchParams;
  if ([...searchParams.keys()].some((key) => !filterNames.includes(key as typeof filterNames[number]))) {
    throw new AdminAthleteMembershipOrderRouteError();
  }

  const values = Object.fromEntries(filterNames.map((name) => [name, searchParams.getAll(name)]));
  for (const name of filterNames) {
    if (values[name].length > 1 || (values[name].length === 1 && !values[name][0].trim())) {
      throw new AdminAthleteMembershipOrderRouteError();
    }
  }

  const status = values.status[0];
  const planCode = values.planCode[0];
  if ((status && !statuses.has(status)) || (planCode && !planCodes.has(planCode))) {
    throw new AdminAthleteMembershipOrderRouteError();
  }

  return {
    ...(status ? { status: status as AdminAthleteMembershipOrderFilters["status"] } : {}),
    ...(values.athleteId[0] ? { athleteId: values.athleteId[0].trim() } : {}),
    ...(planCode ? { planCode: planCode as AdminAthleteMembershipOrderFilters["planCode"] } : {}),
  };
};

const publicOrder = (order: AdminAthleteMembershipOrder) => ({
  id: order.id,
  publicReference: order.publicReference,
  athleteId: order.athleteId,
  athleteName: order.athleteName,
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
  if (error instanceof AdminAthleteMembershipOrderRouteError) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (error instanceof AthleteMembershipOrderError) {
    const status = error.code === "forbidden" ? 403 : error.code === "validation" ? 400 : 500;
    const message = status === 500 ? "Une erreur interne est survenue." : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAdminAthleteMembershipOrderHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const accessError = await requireAdmin(request, dependencies);
      if (accessError) return accessError;
      const filters = parseFilters(request);
      const orders = await dependencies.list(request, filters);
      return NextResponse.json({ orders: orders.map(publicOrder) });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

const handlers = createAdminAthleteMembershipOrderHandlers();
export const GET = handlers.GET;