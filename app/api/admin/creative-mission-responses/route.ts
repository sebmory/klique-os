import { NextResponse } from "next/server";
import { getAdminCreativeMissionResponse } from "@/lib/creative-missions";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  getResponse: typeof getAdminCreativeMissionResponse;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  getResponse: getAdminCreativeMissionResponse,
};

export const createAdminCreativeMissionResponseHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await requireCreativeAdminContext(request, dependencies.getAccess);
      if ("response" in access) return access.response;
      const searchParams = new URL(request.url).searchParams;
      const requestId = searchParams.get("requestId")?.trim() ?? "";
      if (
        !requestId
        || [...searchParams.keys()].some((key) => key !== "requestId")
      ) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      const response = await dependencies.getResponse({
        workspaceId: access.context.workspaceId,
        requestId,
      });
      if (!response) {
        return NextResponse.json({ error: "Demande de prestation introuvable." }, { status: 404 });
      }
      return NextResponse.json({ response }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if (error instanceof Error && /UUID/.test(error.message)) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
      }
      return NextResponse.json(
        { error: "Impossible de charger la réponse créative." },
        { status: 500 },
      );
    }
  },
});

const handlers = createAdminCreativeMissionResponseHandlers();
export const GET = handlers.GET;
