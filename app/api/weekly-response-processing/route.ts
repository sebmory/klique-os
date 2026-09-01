import { NextRequest, NextResponse } from "next/server";
import { evaluateBusinessAccess, getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  listProcessedMonthlyResponses,
  listProcessedWeeklyResponses,
  markMonthlyResponseProcessed,
  markWeeklyResponseProcessed,
} from "@/lib/weekly-response-processing/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const getAdminContext = async (request: NextRequest) => {
  const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
  if (!accessCheck.allowed) return null;

  const profile = await getCurrentUserAccessProfile(request);
  const workspaceId = profile?.userAccess?.workspaceId?.trim() ?? "";
  const clerkUserId = profile?.userAccess?.clerkUserId?.trim() ?? "";
  return workspaceId && clerkUserId ? { workspaceId, clerkUserId } : null;
};

export async function GET(request: NextRequest) {
  try {
    const context = await getAdminContext(request);
    if (!context) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

    const responseType = request.nextUrl.searchParams.get("responseType") === "monthly" ? "monthly" : "weekly";
    const processedResponses = responseType === "monthly"
      ? await listProcessedMonthlyResponses(context.workspaceId)
      : await listProcessedWeeklyResponses(context.workspaceId);
    return NextResponse.json({ processedResponses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de récupérer les réponses traitées." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAdminContext(request);
    if (!context) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

    const body = (await request.json()) as { athleteId?: unknown; responseTimestamp?: unknown; responseType?: unknown };
    const athleteId = String(body.athleteId ?? "").trim();
    const responseTimestamp = String(body.responseTimestamp ?? "").trim();
    if (!athleteId || !responseTimestamp) {
      return NextResponse.json({ error: "athleteId et responseTimestamp sont obligatoires." }, { status: 400 });
    }

    const markProcessed = body.responseType === "monthly" ? markMonthlyResponseProcessed : markWeeklyResponseProcessed;
    const processedResponse = await markProcessed({
      workspaceId: context.workspaceId,
      athleteId,
      responseTimestamp,
      processedByClerkUserId: context.clerkUserId,
    });
    return NextResponse.json({ processedResponse }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de traiter la réponse." },
      { status: 500 },
    );
  }
}