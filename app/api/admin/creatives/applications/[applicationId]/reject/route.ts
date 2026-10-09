import { NextResponse } from "next/server";
import {
  rejectCreativeApplication,
  type RejectCreativeApplicationResult,
} from "@/lib/creatives/admin-application-service";
import {
  creativeAdminErrorResponse,
  getDefaultCreativeAdminAccess,
  parseRejectJsonBody,
  rejectQueryParameters,
  requireApplicationId,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ applicationId: string }>;
};

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  reject: (
    workspaceId: string,
    applicationId: string,
    rejectedByClerkUserId: string,
    reason: string,
  ) => Promise<RejectCreativeApplicationResult>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  reject: rejectCreativeApplication,
};

export const createAdminCreativeApplicationRejectHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async POST(request: Request, context: RouteContext) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      rejectQueryParameters(request);
      const { applicationId: rawApplicationId } = await context.params;
      const applicationId = requireApplicationId(rawApplicationId);
      const reason = await parseRejectJsonBody(request);
      const result = await dependencies.reject(
        access.context.workspaceId,
        applicationId,
        access.context.clerkUserId,
        reason,
      );
      return NextResponse.json(result);
    } catch (error) {
      return creativeAdminErrorResponse(error);
    }
  },
});

const handlers = createAdminCreativeApplicationRejectHandlers();
export const POST = handlers.POST;
