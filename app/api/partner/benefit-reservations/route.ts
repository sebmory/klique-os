import { NextResponse } from "next/server";
import {
  PartnerBenefitReservationError,
  listPartnerBenefitReservations,
  type PartnerBenefitReservationGroups,
} from "@/lib/partner-benefits/partner-reservation-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  list: (request: Request) => Promise<PartnerBenefitReservationGroups>;
};

const defaultDependencies: HandlerDependencies = {
  list: listPartnerBenefitReservations,
};

const rejectQueryFields = (request: Request): void => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new PartnerBenefitReservationError("validation", "La query ne doit contenir aucun champ.");
  }
};

const isDatabaseConflict = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : null;
  if (code === "23505" || code === "40001") return true;
  return "cause" in error && isDatabaseConflict(error.cause);
};

export const partnerBenefitReservationErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof PartnerBenefitReservationError) {
    const status = error.code === "forbidden"
      ? 403
      : error.code === "not_found"
        ? 404
        : error.code === "terminal" || error.code === "conflict"
          ? 409
          : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (isDatabaseConflict(error)) {
    return NextResponse.json(
      { error: "Une transition concurrente a empêché l’opération.", code: "conflict" },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createPartnerBenefitReservationListHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      rejectQueryFields(request);
      const reservations = await dependencies.list(request);
      return NextResponse.json({ reservations });
    } catch (error) {
      return partnerBenefitReservationErrorResponse(error);
    }
  },
});

const handlers = createPartnerBenefitReservationListHandlers();
export const GET = handlers.GET;