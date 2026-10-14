import { NextResponse } from "next/server";
import {
  listAdminCreativeMissions,
  type AdminCreativeMissionListItem,
} from "@/lib/admin-creative-missions";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  listMissions: (input: { workspaceId: string }) => Promise<AdminCreativeMissionListItem[]>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listMissions: listAdminCreativeMissions,
};

export const createAdminMissionListHandler = (
  dependencies: HandlerDependencies = defaultDependencies,
) => async (request: Request) => {
  try {
    const access = await requireCreativeAdminContext(request, dependencies.getAccess);
    if ("response" in access) return access.response;
    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const missions = await dependencies.listMissions({
      workspaceId: access.context.workspaceId,
    });
    return NextResponse.json({ missions }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const diagnostic = error && typeof error === "object"
      ? error as { code?: unknown; constraint?: unknown; name?: unknown }
      : null;
    console.error("[admin_missions][get_failed]", {
      code: typeof diagnostic?.code === "string" ? diagnostic.code : null,
      constraint: typeof diagnostic?.constraint === "string" ? diagnostic.constraint : null,
      type: typeof diagnostic?.name === "string" ? diagnostic.name : typeof error,
    });
    return NextResponse.json(
      { error: "Impossible de charger les missions créatives." },
      { status: 500 },
    );
  }
};

export const GET = createAdminMissionListHandler();

