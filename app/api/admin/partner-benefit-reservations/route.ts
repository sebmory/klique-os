import { NextResponse } from "next/server";
import {
  PartnerBenefitReservationAuditError,
  listAdminPartnerBenefitReservationAudit,
  type PartnerBenefitReservationAuditFilters,
  type PartnerBenefitReservationAuditRecord,
} from "@/lib/partner-benefits/admin-reservation-audit-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  list: (
    request: Request,
    filters: PartnerBenefitReservationAuditFilters,
  ) => Promise<PartnerBenefitReservationAuditRecord[]>;
};

const defaultDependencies: HandlerDependencies = {
  list: listAdminPartnerBenefitReservationAudit,
};

const FILTER_NAMES = ["partnerId", "athleteId", "benefitId", "status"] as const;

const parseFilters = (request: Request): PartnerBenefitReservationAuditFilters => {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !FILTER_NAMES.includes(key as typeof FILTER_NAMES[number]))) {
    throw new PartnerBenefitReservationAuditError("validation", "La query contient un champ non autorisé.");
  }

  const filters: PartnerBenefitReservationAuditFilters = {};
  for (const name of FILTER_NAMES) {
    const values = url.searchParams.getAll(name);
    if (values.length > 1) {
      throw new PartnerBenefitReservationAuditError("validation", `${name} ne peut être fourni qu’une fois.`);
    }
    if (values.length === 1) {
      const value = values[0].trim();
      if (!value) throw new PartnerBenefitReservationAuditError("validation", `${name} ne peut pas être vide.`);
      filters[name] = value;
    }
  }
  return filters;
};

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof PartnerBenefitReservationAuditError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.code === "forbidden" ? 403 : 400 },
    );
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAdminPartnerBenefitReservationAuditHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const filters = parseFilters(request);
      const reservations = await dependencies.list(request, filters);
      return NextResponse.json({ reservations });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

const handlers = createAdminPartnerBenefitReservationAuditHandlers();
export const GET = handlers.GET;