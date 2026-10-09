import { NextResponse } from "next/server";
import {
  createManualCreativeProfileForAdmin,
  CreativeProfileAdminError,
  listCreativeProfilesForAdmin,
} from "@/lib/creatives/admin-profile-service";
import {
  creativeAdminErrorResponse,
  getDefaultCreativeAdminAccess,
  rejectQueryParameters,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";
import {
  creativeStatuses,
  creativeTypes,
  type CreateManualCreativeProfileInput,
  type CreativeProfile,
} from "@/types/creative";
import {
  invalidatePublicKliqueStats,
  PUBLIC_KLIQUE_STATS_WORKSPACE_ID,
} from "@/lib/public-klique-stats-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  listProfiles: (workspaceId: string) => Promise<CreativeProfile[]>;
  createManualProfile?: (
    workspaceId: string,
    approvedByClerkUserId: string,
    input: CreateManualCreativeProfileInput,
  ) => Promise<CreativeProfile>;
  invalidateStats?: () => void;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listProfiles: listCreativeProfilesForAdmin,
  createManualProfile: createManualCreativeProfileForAdmin,
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

const requiredTextFields = ["displayName", "contactEmail"] as const;
const nullableTextFields = [
  "phone",
  "websiteUrl",
  "portfolioUrl",
  "instagram",
  "city",
  "country",
  "bio",
] as const;

const parseCreateBody = async (request: Request): Promise<CreateManualCreativeProfileInput> => {
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
    || !Object.keys(body).every((key) => allowedFields.has(key))
  ) {
    throw new CreativeProfileAdminError("validation", "Requête invalide.");
  }
  const record = body as Record<string, unknown>;
  for (const field of requiredTextFields) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      throw new CreativeProfileAdminError("validation", "Requête invalide.");
    }
  }
  if (
    typeof record.creativeType !== "string"
    || !creativeTypes.includes(record.creativeType as typeof creativeTypes[number])
    || typeof record.status !== "string"
    || !creativeStatuses.includes(record.status as typeof creativeStatuses[number])
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
  return {
    displayName: record.displayName as string,
    creativeType: record.creativeType as CreateManualCreativeProfileInput["creativeType"],
    contactEmail: record.contactEmail as string,
    phone: (record.phone as string | null | undefined) ?? null,
    websiteUrl: (record.websiteUrl as string | null | undefined) ?? null,
    portfolioUrl: (record.portfolioUrl as string | null | undefined) ?? null,
    instagram: (record.instagram as string | null | undefined) ?? null,
    city: (record.city as string | null | undefined) ?? null,
    country: (record.country as string | null | undefined) ?? null,
    coverageAreas: (record.coverageAreas as string[] | undefined) ?? [],
    specialties: (record.specialties as string[] | undefined) ?? [],
    bio: (record.bio as string | null | undefined) ?? null,
    status: record.status as CreateManualCreativeProfileInput["status"],
  };
};

export const createAdminCreativeProfilesHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      rejectQueryParameters(request);
      const profiles = await dependencies.listProfiles(access.context.workspaceId);
      return NextResponse.json({ profiles }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return creativeAdminErrorResponse(error);
    }
  },
  async POST(request: Request) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      rejectQueryParameters(request);
      const input = await parseCreateBody(request);
      if (!dependencies.createManualProfile) {
        throw new CreativeProfileAdminError(
          "dependency",
          "La création de fiche créative est indisponible.",
        );
      }
      const profile = await dependencies.createManualProfile(
        access.context.workspaceId,
        access.context.clerkUserId,
        input,
      );
      if (
        access.context.workspaceId === PUBLIC_KLIQUE_STATS_WORKSPACE_ID
        && profile.status === "active"
      ) {
        dependencies.invalidateStats?.();
      }
      return NextResponse.json({ profile }, { status: 201 });
    } catch (error) {
      return creativeAdminErrorResponse(error);
    }
  },
});

const handlers = createAdminCreativeProfilesHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
