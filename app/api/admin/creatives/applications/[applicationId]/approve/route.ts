import { NextResponse } from "next/server";
import {
  approveCreativeApplication,
  type ApproveCreativeApplicationResult,
} from "@/lib/creatives/admin-application-service";
import {
  creativeAdminErrorResponse,
  getDefaultCreativeAdminAccess,
  parseApproveJsonBody,
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
    expectedVersion: string,
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
      const body = await parseApproveJsonBody(request);
      const result = await dependencies.approve(
        access.context.workspaceId,
        applicationId,
        access.context.clerkUserId,
        body.version,
      );
      if (
        access.context.workspaceId === PUBLIC_KLIQUE_STATS_WORKSPACE_ID
        && !result.alreadyApproved
        && result.profile.status === "active"
      ) {
        dependencies.invalidateStats?.();
      }
      if (!result.sheetSynchronized) {
        console.warn("Creative application Sheets mirror pending", {
          code: "SHEET_SYNC_PENDING",
        });
      }
      return NextResponse.json({
        application: {
          applicationId: result.application.applicationId,
          moderationStatus: result.application.moderationStatus,
          creativeId: result.application.creativeId,
          moderatedAt: result.application.moderatedAt,
          moderatedBy: result.application.moderatedBy,
          moderationNotes: result.application.moderationNotes,
          version: result.application.version,
        },
        alreadyApproved: result.alreadyApproved,
        sheetSynchronized: result.sheetSynchronized,
      });
    } catch (error) {
      return creativeAdminErrorResponse(error);
    }
  },
});

const handlers = createAdminCreativeApplicationApproveHandlers();
export const POST = handlers.POST;
