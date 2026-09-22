import { NextResponse } from "next/server";
import { partnerBenefitReservationErrorResponse } from "@/app/api/partner/benefit-reservations/route";
import {
  PartnerBenefitReservationError,
  cancelPartnerBenefitReservation,
  markPartnerBenefitReservationUsed,
  type PartnerBenefitReservation,
} from "@/lib/partner-benefits/partner-reservation-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type PartnerReservationAction = "mark_used" | "cancel";

type HandlerDependencies = {
  markUsed: (request: Request, reservationId: unknown) => Promise<PartnerBenefitReservation>;
  cancel: (request: Request, reservationId: unknown) => Promise<PartnerBenefitReservation>;
};

const defaultDependencies: HandlerDependencies = {
  markUsed: markPartnerBenefitReservationUsed,
  cancel: cancelPartnerBenefitReservation,
};

const rejectQueryFields = (request: Request): void => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new PartnerBenefitReservationError("validation", "La query ne doit contenir aucun champ.");
  }
};

const parseAction = async (request: Request): Promise<PartnerReservationAction> => {
  const body = await request.json().catch(() => null);
  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !("action" in body)
    || (body.action !== "mark_used" && body.action !== "cancel")
  ) {
    throw new PartnerBenefitReservationError(
      "validation",
      "Le payload attendu est strictement { action: 'mark_used' } ou { action: 'cancel' }.",
    );
  }
  return body.action;
};

export const createPartnerBenefitReservationMutationHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async PATCH(request: Request, { params }: RouteContext) {
    try {
      rejectQueryFields(request);
      const action = await parseAction(request);
      const { id } = await params;
      const reservation = action === "mark_used"
        ? await dependencies.markUsed(request, id)
        : await dependencies.cancel(request, id);
      return NextResponse.json({ reservation });
    } catch (error) {
      return partnerBenefitReservationErrorResponse(error);
    }
  },
});

const handlers = createPartnerBenefitReservationMutationHandlers();
export const PATCH = handlers.PATCH;