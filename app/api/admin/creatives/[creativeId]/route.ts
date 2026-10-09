import { NextResponse } from "next/server";
import {
  CreativeProfileAdminError,
  updateCreativeProfileForAdmin,
} from "@/lib/creatives/admin-profile-service";
import {
  creativeAdminErrorResponse,
  getDefaultCreativeAdminAccess,
  rejectQueryParameters,
  requireApplicationId,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";
import {
  creativeStatuses,
  creativeTypes,
  type CreativeProfile,
  type UpdateCreativeProfileInput,
} from "@/types/creative";
import {
  invalidatePublicKliqueStats,
  PUBLIC_KLIQUE_STATS_WORKSPACE_ID,
} from "@/lib/public-klique-stats-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ creativeId: string }>;
};

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  updateProfile: (
    workspaceId: string,
    creativeId: string,
    input: UpdateCreativeProfileInput,
  ) => Promise<CreativeProfile>;
  invalidateStats?: () => void;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  updateProfile: updateCreativeProfileForAdmin,
  invalidateStats: invalidatePublicKliqueStats,
};

const allowedFields = new Set([
  "displayName",
  "creativeType",
  "contactEmail",
  "phone",
  "websiteUrl",
  "portfolioUrl",
  "instagram",
  "city",
  "country",
  "coverageAreas",
  "specialties",
  "bio",
  "status",
]);

const nullableTextFields = [
  "phone",
  "websiteUrl",
  "portfolioUrl",
  "instagram",
  "city",
  "country",
  "bio",
] as const;

const parseBody = async (request: Request): Promise<UpdateCreativeProfileInput> => {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new CreativeProfileAdminError("validation", "Requête invalide.");
  }
  const body = await request.json().catch(() => null);
  if (
    !body
    || typeof body !== "object"
    || Array.isArray(body)
    || Object.keys(body).length === 0
    || !Object.keys(body).every((key) => allowedFields.has(key))
  ) {
    throw new CreativeProfileAdminError("validation", "Requête invalide.");
  }
  const record = body as Record<string, unknown>;
  if (Object.hasOwn(record, "displayName") && typeof record.displayName !== "string") {
    throw new CreativeProfileAdminError("validation", "Requête invalide.");
  }
  if (Object.hasOwn(record, "contactEmail") && typeof record.contactEmail !== "string") {
    throw new CreativeProfileAdminError("validation", "Requête invalide.");
  }
  if (
    Object.hasOwn(record, "creativeType")
    && (
      typeof record.creativeType !== "string"
      || !creativeTypes.includes(record.creativeType as typeof creativeTypes[number])
    )
  ) {
    throw new CreativeProfileAdminError("validation", "Requête invalide.");
  }
  if (
    Object.hasOwn(record, "status")
    && (
      typeof record.status !== "string"
      || !creativeStatuses.includes(record.status as typeof creativeStatuses[number])
    )
  ) {
    throw new CreativeProfileAdminError("validation", "Requête invalide.");
  }
  for (const field of nullableTextFields) {
    if (
      Object.hasOwn(record, field)
      && record[field] !== null
      && typeof record[field] !== "string"
    ) {
      throw new CreativeProfileAdminError("validation", "Requête invalide.");
    }
  }
  for (const field of ["coverageAreas", "specialties"] as const) {
    if (
      Object.hasOwn(record, field)
      && (
        !Array.isArray(record[field])
        || record[field].some((entry) => typeof entry !== "string")
      )
    ) {
      throw new CreativeProfileAdminError("validation", "Requête invalide.");
    }
  }
  return body as UpdateCreativeProfileInput;
};

export const createAdminCreativeProfileHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async PATCH(request: Request, context: RouteContext) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      rejectQueryParameters(request);
      const { creativeId: rawCreativeId } = await context.params;
      const creativeId = requireApplicationId(rawCreativeId);
      const input = await parseBody(request);
      const profile = await dependencies.updateProfile(
        access.context.workspaceId,
        creativeId,
        input,
      );
      if (
        access.context.workspaceId === PUBLIC_KLIQUE_STATS_WORKSPACE_ID
        && Object.hasOwn(input, "status")
      ) {
        dependencies.invalidateStats?.();
      }
      return NextResponse.json({ profile });
    } catch (error) {
      return creativeAdminErrorResponse(error);
    }
  },
});

const handlers = createAdminCreativeProfileHandlers();
export const PATCH = handlers.PATCH;
