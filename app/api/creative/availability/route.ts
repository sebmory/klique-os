import { NextResponse } from "next/server";
import { getCurrentUserCreativeAccessProfile } from "@/lib/clerk-access/service";
import {
  deleteCreativeAvailability,
  listCreativeAvailability,
  parseCreativeAvailabilityInput,
  saveCreativeAvailability,
} from "@/lib/creative-availability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const resolveCreativeAvailabilityIdentity = (access: {
  status?: string | null;
  creativeProfileStatus?: string | null;
  workspaceId?: string | null;
  creativeProfileId?: string | null;
  clerkUserId?: string | null;
} | null) => {
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const creativeProfileId = access?.creativeProfileId?.trim() ?? "";
  const clerkUserId = access?.clerkUserId?.trim() ?? "";
  if (
    !access
    || access.status !== "active"
    || access.creativeProfileStatus !== "active"
    || !workspaceId
    || !creativeProfileId
    || !clerkUserId
  ) {
    return null;
  }
  return {
    workspaceId,
    creativeProfileId,
    clerkUserId,
  };
};

const requireCreative = async (request: Request) =>
  resolveCreativeAvailabilityIdentity(await getCurrentUserCreativeAccessProfile(request));

const dateRange = (request: Request) => {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => !["from", "to"].includes(key))) {
    throw new Error("Requête invalide.");
  }
  const today = new Date().toISOString().slice(0, 10);
  const inNinetyDays = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  return { from: params.get("from") ?? today, to: params.get("to") ?? inNinetyDays };
};

export async function GET(request: Request) {
  try {
    const access = await requireCreative(request);
    if (!access) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    const range = dateRange(request);
    return NextResponse.json(
      await listCreativeAvailability({ ...range, ...access }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chargement impossible." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireCreative(request);
    if (!access) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    const input = parseCreativeAvailabilityInput(await request.json());
    const id = await saveCreativeAvailability({
      workspaceId: access.workspaceId,
      creativeProfileId: access.creativeProfileId,
      actorClerkUserId: access.clerkUserId,
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
    const access = await requireCreative(request);
    if (!access) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const ruleId = String(body.ruleId ?? "");
    const input = parseCreativeAvailabilityInput(body.availability);
    const id = await saveCreativeAvailability({
      workspaceId: access.workspaceId,
      creativeProfileId: access.creativeProfileId,
      actorClerkUserId: access.clerkUserId,
      ruleId,
      input,
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
  try {
    const access = await requireCreative(request);
    if (!access) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "ruleId")) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const deleted = await deleteCreativeAvailability({
      workspaceId: access.workspaceId,
      creativeProfileId: access.creativeProfileId,
      ruleId: params.get("ruleId") ?? "",
    });
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Disponibilité introuvable." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Suppression impossible." },
      { status: 400 },
    );
  }
}
