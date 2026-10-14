import { NextResponse } from "next/server";
import {
  listAdminOperationalCalendar,
  type AdminOperationalCalendar,
} from "@/lib/admin-operational-calendar";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
  type GetCreativeAdminAccess,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  getAccess: GetCreativeAdminAccess;
  listCalendar: (input: {
    clerkUserId: string;
    workspaceId: string;
  }) => Promise<AdminOperationalCalendar>;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getDefaultCreativeAdminAccess,
  listCalendar: listAdminOperationalCalendar,
};

export const createAdminCalendarHandler = (
  dependencies: HandlerDependencies = defaultDependencies,
) => async (request: Request) => {
  try {
    const access = await requireCreativeAdminContext(request, dependencies.getAccess);
    if ("response" in access) return access.response;
    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const calendar = await dependencies.listCalendar(access.context);
    return NextResponse.json(calendar, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const diagnostic = error && typeof error === "object"
      ? error as { code?: unknown; constraint?: unknown; name?: unknown }
      : null;
    console.error("[admin_calendar][get_failed]", {
      code: typeof diagnostic?.code === "string" ? diagnostic.code : null,
      constraint: typeof diagnostic?.constraint === "string" ? diagnostic.constraint : null,
      type: typeof diagnostic?.name === "string" ? diagnostic.name : typeof error,
    });
    return NextResponse.json(
      { error: "Impossible de charger le calendrier opérationnel." },
      { status: 500 },
    );
  }
};

export const GET = createAdminCalendarHandler();
