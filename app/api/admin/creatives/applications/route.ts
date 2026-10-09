import { NextResponse } from "next/server";
import { listCreativeApplicationsForAdmin } from "@/lib/creatives/admin-application-service";
import {
  creativeAdminErrorResponse,
  getDefaultCreativeAdminAccess,
  rejectQueryParameters,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  listApplications: (
    workspaceId: string,
  ) => ReturnType<typeof listCreativeApplicationsForAdmin>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listApplications: listCreativeApplicationsForAdmin,
};

export const createAdminCreativeApplicationsHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      rejectQueryParameters(request);
      const applications = await dependencies.listApplications(access.context.workspaceId);
      return NextResponse.json({ applications }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return creativeAdminErrorResponse(error);
    }
  },
});

const handlers = createAdminCreativeApplicationsHandlers();
export const GET = handlers.GET;
