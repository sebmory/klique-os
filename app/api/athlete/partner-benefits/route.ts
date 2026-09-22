import { NextResponse } from "next/server";
import {
  AthletePartnerBenefitError,
  listAthletePartnerBenefits,
  reserveAthletePartnerBenefit,
  type AthletePartnerBenefit,
  type AthletePartnerBenefitReservation,
} from "@/lib/partner-benefits/athlete-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  list: (request: Request) => Promise<AthletePartnerBenefit[]>;
  reserve: (
    request: Request,
    input: { benefitId?: unknown },
  ) => Promise<AthletePartnerBenefitReservation>;
};

const defaultDependencies: HandlerDependencies = {
  list: listAthletePartnerBenefits,
  reserve: reserveAthletePartnerBenefit,
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const rejectQueryFields = (request: Request): void => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new AthletePartnerBenefitError("validation", "La query ne doit contenir aucun champ.");
  }
};

const parseReservationPayload = async (request: Request): Promise<{ benefitId: unknown }> => {
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body) || Object.keys(body).length !== 1 || !("benefitId" in body)) {
    throw new AthletePartnerBenefitError("validation", "Le payload attendu est strictement { benefitId }.");
  }
  return { benefitId: body.benefitId };
};

const isDatabaseConflict = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : null;
  if (code === "23505" || code === "40001") return true;
  return "cause" in error && isDatabaseConflict(error.cause);
};

export const athletePartnerBenefitErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof AthletePartnerBenefitError) {
    const status = error.code === "forbidden" || error.code === "membership_required"
      ? 403
      : error.code === "not_found"
        ? 404
        : error.code === "unavailable" || error.code === "conflict"
          ? 409
          : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (isDatabaseConflict(error)) {
    return NextResponse.json(
      { error: "Une opération concurrente a empêché la réservation.", code: "conflict" },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAthletePartnerBenefitHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      rejectQueryFields(request);
      const benefits = await dependencies.list(request);
      return NextResponse.json({ benefits });
    } catch (error) {
      return athletePartnerBenefitErrorResponse(error);
    }
  },

  async POST(request: Request) {
    try {
      rejectQueryFields(request);
      const input = await parseReservationPayload(request);
      const reservation = await dependencies.reserve(request, input);
      return NextResponse.json({ reservation }, { status: 201 });
    } catch (error) {
      return athletePartnerBenefitErrorResponse(error);
    }
  },
});

const handlers = createAthletePartnerBenefitHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;