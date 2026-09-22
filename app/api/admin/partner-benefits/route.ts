import { NextResponse } from "next/server";
import {
  PartnerBenefitAdminError,
  createAdminPartnerBenefit,
  deactivateAdminPartnerBenefit,
  listAdminPartnerBenefits,
  updateAdminPartnerBenefit,
  type AdminPartnerBenefit,
  type CreatePartnerBenefitInput,
  type UpdatePartnerBenefitInput,
} from "@/lib/partner-benefits/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  list: (request: Request, partnerId?: unknown) => Promise<AdminPartnerBenefit[]>;
  create: (request: Request, input: CreatePartnerBenefitInput) => Promise<AdminPartnerBenefit>;
  update: (
    request: Request,
    partnerId: unknown,
    benefitId: unknown,
    input: UpdatePartnerBenefitInput,
  ) => Promise<AdminPartnerBenefit>;
  deactivate: (request: Request, partnerId: unknown, benefitId: unknown) => Promise<AdminPartnerBenefit>;
};

const defaultDependencies: HandlerDependencies = {
  list: listAdminPartnerBenefits,
  create: createAdminPartnerBenefit,
  update: updateAdminPartnerBenefit,
  deactivate: deactivateAdminPartnerBenefit,
};

const POST_FIELDS = [
  "partnerId",
  "title",
  "details",
  "usagePolicy",
  "validFrom",
  "expiresAt",
  "status",
] as const;
const UPDATE_FIELDS = ["title", "details", "usagePolicy", "validFrom", "expiresAt", "status"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = async (request: Request): Promise<Record<string, unknown>> => {
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    throw new PartnerBenefitAdminError("validation", "Le payload JSON doit être un objet.");
  }
  return body;
};

const requireExactFields = (
  body: Record<string, unknown>,
  allowedFields: readonly string[],
  requiredFields: readonly string[],
): void => {
  const keys = Object.keys(body);
  const unexpected = keys.filter((key) => !allowedFields.includes(key));
  const missing = requiredFields.filter((key) => !Object.prototype.hasOwnProperty.call(body, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new PartnerBenefitAdminError("validation", "Le payload contient des champs absents ou non autorisés.");
  }
};

const getSingleQueryValue = (url: URL, name: string, required: boolean): string | undefined => {
  const values = url.searchParams.getAll(name);
  if (values.length > 1 || (required && values.length !== 1)) {
    throw new PartnerBenefitAdminError("validation", `${name} est invalide.`);
  }
  const value = values[0]?.trim();
  if (required && !value) {
    throw new PartnerBenefitAdminError("validation", `${name} est requis.`);
  }
  return value || undefined;
};

const rejectUnexpectedQueryFields = (url: URL, allowedFields: readonly string[]): void => {
  if ([...url.searchParams.keys()].some((key) => !allowedFields.includes(key))) {
    throw new PartnerBenefitAdminError("validation", "La query contient un champ non autorisé.");
  }
};

const isConflictError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : null;
  if (code === "23505" || code === "23P01" || code === "40001") return true;
  return "cause" in error && isConflictError(error.cause);
};

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof PartnerBenefitAdminError) {
    const status = error.code === "forbidden"
      ? 403
      : error.code === "partner_not_found" || error.code === "not_found"
        ? 404
        : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (isConflictError(error)) {
    return NextResponse.json(
      { error: "Un avantage en conflit existe déjà.", code: "conflict" },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
};

export const createAdminPartnerBenefitHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const url = new URL(request.url);
      rejectUnexpectedQueryFields(url, ["partnerId"]);
      const partnerId = getSingleQueryValue(url, "partnerId", false);
      const benefits = await dependencies.list(request, partnerId);
      return NextResponse.json({ benefits });
    } catch (error) {
      return errorResponse(error);
    }
  },

  async POST(request: Request) {
    try {
      const url = new URL(request.url);
      rejectUnexpectedQueryFields(url, []);
      const body = await parseJsonObject(request);
      requireExactFields(body, POST_FIELDS, POST_FIELDS);
      const benefit = await dependencies.create(request, {
        partnerId: body.partnerId,
        title: body.title,
        details: body.details,
        usagePolicy: body.usagePolicy,
        validFrom: body.validFrom,
        expiresAt: body.expiresAt,
        status: body.status,
      });
      return NextResponse.json({ benefit }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  },

  async PATCH(request: Request) {
    try {
      const url = new URL(request.url);
      rejectUnexpectedQueryFields(url, ["partnerId", "benefitId"]);
      const partnerId = getSingleQueryValue(url, "partnerId", true);
      const benefitId = getSingleQueryValue(url, "benefitId", true);
      const body = await parseJsonObject(request);

      if (body.action === "deactivate") {
        requireExactFields(body, ["action"], ["action"]);
        const benefit = await dependencies.deactivate(request, partnerId, benefitId);
        return NextResponse.json({ benefit });
      }

      requireExactFields(body, UPDATE_FIELDS, []);
      if (Object.keys(body).length === 0) {
        throw new PartnerBenefitAdminError("validation", "Au moins un champ modifiable est requis.");
      }
      const benefit = await dependencies.update(request, partnerId, benefitId, body);
      return NextResponse.json({ benefit });
    } catch (error) {
      return errorResponse(error);
    }
  },
});

const handlers = createAdminPartnerBenefitHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;