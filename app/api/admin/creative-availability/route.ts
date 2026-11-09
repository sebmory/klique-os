import { NextResponse } from "next/server";
import {
  deleteCreativeAvailability,
  listCreativeAvailability,
  parseCreativeAvailabilityInput,
  saveCreativeAvailability,
  type CreativeAvailabilityMissionType,
} from "@/lib/creative-availability";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
} from "@/lib/creatives/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requireAdmin = (request: Request) =>
  requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);

export async function GET(request: Request) {
  try {
    const access = await requireAdmin(request);
    if ("response" in access) return access.response;
    const params = new URL(request.url).searchParams;
    const allowed = ["from", "to", "creativeProfileId", "region", "missionType"];
    if ([...params.keys()].some((key) => !allowed.includes(key))) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
    const missionType = params.get("missionType");
    if (missionType && !["match_competition", "media_day"].includes(missionType)) {
      return NextResponse.json({ error: "Type de mission invalide." }, { status: 400 });
    }
    const calendar = await listCreativeAvailability({
      workspaceId: access.context.workspaceId,
      from: params.get("from") ?? today,
      to: params.get("to") ?? nextYear,
      creativeProfileId: params.get("creativeProfileId") ?? undefined,
      region: params.get("region") ?? undefined,
      missionType: missionType as CreativeAvailabilityMissionType | undefined,
    });
    return NextResponse.json(calendar, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[admin_creative_availability][list_failed]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chargement impossible." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin(request);
    if ("response" in access) return access.response;
    const body = await request.json() as Record<string, unknown>;
    const creativeProfileId = String(body.creativeProfileId ?? "");
    const input = parseCreativeAvailabilityInput(body.availability);
    const id = await saveCreativeAvailability({
      workspaceId: access.context.workspaceId,
      creativeProfileId,
      actorClerkUserId: access.context.clerkUserId,
      input,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const duplicate = error && typeof error === "object" && (error as { code?: string }).code === "23505";
    return NextResponse.json(
      { error: duplicate ? "Cette disponibilité existe déjà." : error instanceof Error ? error.message : "Enregistrement impossible." },
      { status: duplicate ? 409 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdmin(request);
    if ("response" in access) return access.response;
    const body = await request.json() as Record<string, unknown>;
    const id = await saveCreativeAvailability({
      workspaceId: access.context.workspaceId,
      creativeProfileId: String(body.creativeProfileId ?? ""),
      actorClerkUserId: access.context.clerkUserId,
      ruleId: String(body.ruleId ?? ""),
      input: parseCreativeAvailabilityInput(body.availability),
    });
    return NextResponse.json({ id });
  } catch (error) {
    const duplicate = error && typeof error === "object" && (error as { code?: string }).code === "23505";
    return NextResponse.json(
      { error: duplicate ? "Cette disponibilité existe déjà." : error instanceof Error ? error.message : "Modification impossible." },
      { status: duplicate ? 409 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await requireAdmin(request);
  if ("response" in access) return access.response;
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => !["ruleId", "creativeProfileId"].includes(key))) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const deleted = await deleteCreativeAvailability({
    workspaceId: access.context.workspaceId,
    creativeProfileId: params.get("creativeProfileId") ?? "",
    ruleId: params.get("ruleId") ?? "",
  });
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Disponibilité introuvable." }, { status: 404 });
}
