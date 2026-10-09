import { NextResponse } from "next/server";
import {
  approveCreativeApplication,
  type ApproveCreativeApplicationResult,
} from "@/lib/creatives/admin-application-service";
import {
  creativeAdminErrorResponse,
  getDefaultCreativeAdminAccess,
  parseEmptyJsonBody,
  rejectQueryParameters,
  requireApplicationId,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";
import {
  invalidatePublicKliqueStats,
  PUBLIC_KLIQUE_STATS_WORKSPACE_ID,
} from "@/lib/public-klique-stats-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ applicationId: string }>;
};

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  approve: (
    workspaceId: string,
    applicationId: string,
    approvedByClerkUserId: string,
  ) => Promise<ApproveCreativeApplicationResult>;
  invalidateStats?: () => void;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  approve: approveCreativeApplication,
  invalidateStats: invalidatePublicKliqueStats,
};

export const createAdminCreativeApplicationApproveHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async POST(request: Request, context: RouteContext) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      rejectQueryParameters(request);
      const { applicationId: rawApplicationId } = await context.params;
      const applicationId = requireApplicationId(rawApplicationId);
      await parseEmptyJsonBody(request);
      const result = await dependencies.approve(
        access.context.workspaceId,
        applicationId,
        access.context.clerkUserId,
      );
      if (
        access.context.workspaceId === PUBLIC_KLIQUE_STATS_WORKSPACE_ID
        && !result.alreadyApproved
        && result.profile.status === "active"
      ) {
        dependencies.invalidateStats?.();
      }
      return NextResponse.json(result);
    } catch (error) {
      return creativeAdminErrorResponse(error);
    }
  },
});

const handlers = createAdminCreativeApplicationApproveHandlers();
export const POST = handlers.POST;
