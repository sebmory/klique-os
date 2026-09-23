import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  AthleteMembershipProspectOrderError,
  cancelAthleteMembershipProspectOrder,
  createAthleteMembershipProspectOrder,
  getCurrentAthleteMembershipProspectOrder,
  type AthleteMembershipProspectOrder,
  type AthleteMembershipProspectOrderCreation,
  type AthleteMembershipProspectOrderView,
} from "@/lib/athlete-membership-prospect-orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getSessionUserId: () => Promise<string | null>;
  getCurrent: (request: Request) => Promise<AthleteMembershipProspectOrderView | null>;
  create: (
    request: Request,
    input: { planCode: string; fullName: string; phone?: string; termsAccepted: boolean },
  ) => Promise<AthleteMembershipProspectOrderCreation>;
  cancel: (request: Request, orderId: string) => Promise<AthleteMembershipProspectOrder>;
};

const defaultDependencies: HandlerDependencies = {
  async getSessionUserId() {
    const { userId } = await auth();
    return userId;
  },
  getCurrent: getCurrentAthleteMembershipProspectOrder,
  create: createAthleteMembershipProspectOrder,
  cancel: cancelAthleteMembershipProspectOrder,
};

class ProspectOrderRouteError extends Error {}

const planCodes = new Set(["essential", "impact", "signature"]);
const usefulStatuses = new Set(["pending_payment", "paid_awaiting_form"]);

const requireSession = async (dependencies: HandlerDependencies): Promise<NextResponse | null> => {
  const userId = await dependencies.getSessionUserId();
  return userId?.trim()
    ? null
    : NextResponse.json({ error: "Authentification requise." }, { status: 401 });
};

const rejectQuery = (request: Request): void => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) throw new ProspectOrderRouteError();
};

const rejectBody = async (request: Request): Promise<void> => {
  if ((await request.text()).length > 0) throw new ProspectOrderRouteError();
};

const parseCreateBody = async (request: Request) => {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProspectOrderRouteError();

  const record = body as Record<string, unknown>;
  const allowedKeys = new Set(["planCode", "fullName", "phone", "termsAccepted"]);
  if (
    Object.keys(record).some((key) => !allowedKeys.has(key))
    || Object.keys(record).length < 3
    || Object.keys(record).length > 4
    || typeof record.planCode !== "string"
    || !planCodes.has(record.planCode)
    || typeof record.fullName !== "string"
    || !record.fullName.trim()
    || record.termsAccepted !== true
    || ("phone" in record && typeof record.phone !== "string")
  ) {
    throw new ProspectOrderRouteError();
  }

  return {
    planCode: record.planCode,
    fullName: record.fullName,
    ...(typeof record.phone === "string" ? { phone: record.phone } : {}),
    termsAccepted: true,
  };
};

const publicOrder = (order: AthleteMembershipProspectOrder | AthleteMembershipProspectOrderView) => ({
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
  ...("statusMessage" in order && order.statusMessage ? { statusMessage: order.statusMessage } : {}),
  ...("twintPaymentUrl" in order && order.twintPaymentUrl ? { twintPaymentUrl: order.twintPaymentUrl } : {}),
});

const errorResponse = (error: unknown, operation: "get" | "create" | "cancel"): NextResponse => {
  if (error instanceof ProspectOrderRouteError) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (error instanceof AthleteMembershipProspectOrderError) {
    const status = error.code === "unauthorized"
      ? 401
      : error.code === "forbidden"
        ? 403
        : error.code === "not_found" || (operation === "create" && error.code === "validation")
          ? 404
          : error.code === "conflict" || error.code === "expired"
            ? 409
            : error.code === "configuration"
              ? 500
              : 400;
    return NextResponse.json(
      { error: status === 500 ? "Une erreur interne est survenue." : error.message },
      { status },
    );
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAthleteMembershipProspectOrderHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const sessionError = await requireSession(dependencies);
      if (sessionError) return sessionError;
      rejectQuery(request);
      const order = await dependencies.getCurrent(request);
      return NextResponse.json({
        order: order && usefulStatuses.has(order.status) ? publicOrder(order) : null,
      });
    } catch (error) {
      return errorResponse(error, "get");
    }
  },

  async POST(request: Request) {
    try {
      const sessionError = await requireSession(dependencies);
      if (sessionError) return sessionError;
      rejectQuery(request);
      const input = await parseCreateBody(request);
      const order = await dependencies.create(request, input);
      return NextResponse.json(
        { order: publicOrder(order) },
        { status: order.creationOutcome === "created" ? 201 : 200 },
      );
    } catch (error) {
      return errorResponse(error, "create");
    }
  },

  async DELETE(request: Request) {
    try {
      const sessionError = await requireSession(dependencies);
      if (sessionError) return sessionError;
      rejectQuery(request);
      await rejectBody(request);
      const current = await dependencies.getCurrent(request);
      if (!current || current.status !== "pending_payment") {
        throw new AthleteMembershipProspectOrderError(
          "conflict",
          "Aucune commande en attente de paiement ne peut être annulée.",
        );
      }
      const order = await dependencies.cancel(request, current.id);
      return NextResponse.json({ order: publicOrder(order) });
    } catch (error) {
      return errorResponse(error, "cancel");
    }
  },
});

const handlers = createAthleteMembershipProspectOrderHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;