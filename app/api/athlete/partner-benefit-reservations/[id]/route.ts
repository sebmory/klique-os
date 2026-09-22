import { NextResponse } from "next/server";
import { athletePartnerBenefitErrorResponse } from "@/app/api/athlete/partner-benefits/route";
import {
  AthletePartnerBenefitError,
  cancelAthletePartnerBenefitReservation,
  type AthletePartnerBenefitReservation,
} from "@/lib/partner-benefits/athlete-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type HandlerDependencies = {
  cancel: (request: Request, reservationId: unknown) => Promise<AthletePartnerBenefitReservation>;
};

const defaultDependencies: HandlerDependencies = {
  cancel: cancelAthletePartnerBenefitReservation,
};

const parseCancellationPayload = async (request: Request): Promise<void> => {
  const body = await request.json().catch(() => null);
  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !("action" in body)
    || body.action !== "cancel"
  ) {
    throw new AthletePartnerBenefitError("validation", "Le payload attendu est strictement { action: 'cancel' }.");
  }
};

const rejectQueryFields = (request: Request): void => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new AthletePartnerBenefitError("validation", "La query ne doit contenir aucun champ.");
  }
};

export const createAthletePartnerBenefitReservationHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async PATCH(request: Request, { params }: RouteContext) {
    try {
      rejectQueryFields(request);
      await parseCancellationPayload(request);
      const { id } = await params;
      const reservation = await dependencies.cancel(request, id);
      return NextResponse.json({ reservation });
    } catch (error) {
      return athletePartnerBenefitErrorResponse(error);
    }
  },
});

const handlers = createAthletePartnerBenefitReservationHandlers();
export const PATCH = handlers.PATCH;