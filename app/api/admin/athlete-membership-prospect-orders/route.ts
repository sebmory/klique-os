import { NextResponse } from "next/server";
import {
  AthleteMembershipProspectOrderError,
  listAdminAthleteMembershipProspectOrders,
  type AdminAthleteMembershipProspectOrder,
  type AdminAthleteMembershipProspectOrderFilters,
} from "@/lib/athlete-membership-prospect-orders";
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
    filters: AdminAthleteMembershipProspectOrderFilters,
  ) => Promise<AdminAthleteMembershipProspectOrder[]>;
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
  list: listAdminAthleteMembershipProspectOrders,
};

class AdminAthleteMembershipProspectOrderRouteError extends Error {}

const filterNames = ["status", "email", "planCode"] as const;
const statuses = new Set(["pending_payment", "paid_awaiting_form", "activated", "cancelled", "expired"]);
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

const parseFilters = (request: Request): AdminAthleteMembershipProspectOrderFilters => {
  const searchParams = new URL(request.url).searchParams;
  if ([...searchParams.keys()].some((key) => !filterNames.includes(key as typeof filterNames[number]))) {
    throw new AdminAthleteMembershipProspectOrderRouteError();
  }

  const values = Object.fromEntries(filterNames.map((name) => [name, searchParams.getAll(name)]));
  for (const name of filterNames) {
    if (values[name].length > 1 || (values[name].length === 1 && !values[name][0].trim())) {
      throw new AdminAthleteMembershipProspectOrderRouteError();
    }
  }

  const status = values.status[0];
  const planCode = values.planCode[0];
  if ((status && !statuses.has(status)) || (planCode && !planCodes.has(planCode))) {
    throw new AdminAthleteMembershipProspectOrderRouteError();
  }

  return {
    ...(status ? { status: status as AdminAthleteMembershipProspectOrderFilters["status"] } : {}),
    ...(values.email[0] ? { email: values.email[0].trim() } : {}),
    ...(planCode ? { planCode: planCode as AdminAthleteMembershipProspectOrderFilters["planCode"] } : {}),
  };
};

const publicOrder = (order: AdminAthleteMembershipProspectOrder) => ({
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
  termsVersion: order.termsVersion,
  termsAcceptedAt: order.termsAcceptedAt,
  expiresAt: order.expiresAt,
  paidAt: order.paidAt,
  cancelledAt: order.cancelledAt,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof AdminAthleteMembershipProspectOrderRouteError) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (error instanceof AthleteMembershipProspectOrderError) {
    const status = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : error.code === "validation" ? 400 : 500;
    const message = status === 500 ? "Une erreur interne est survenue." : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAdminAthleteMembershipProspectOrderHandlers = (
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

const handlers = createAdminAthleteMembershipProspectOrderHandlers();
export const GET = handlers.GET;