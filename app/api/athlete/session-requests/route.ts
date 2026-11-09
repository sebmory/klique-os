import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  createAthleteSessionRequest,
  listAthleteSessionRequests,
  mutateAthleteSessionRequest,
  parseAthleteSessionRequestInput,
} from "@/lib/athlete-session-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const resolveAthleteSessionIdentity = (profile: {
  clerkUser?: { id?: string | null } | null;
  userAccess?: {
    role?: string | null;
    status?: string | null;
    workspaceId?: string | null;
    athleteId?: string | null;
  } | null;
} | null) => {
  const access = profile?.userAccess;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const athleteId = access?.athleteId?.trim() ?? "";
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
  if (
    access?.role !== "athlete"
    || access.status !== "active"
    || !workspaceId
    || !athleteId
    || !clerkUserId
  ) {
    return null;
  }
  return { workspaceId, athleteId, clerkUserId };
};

const getIdentity = async (request: Request) =>
  resolveAthleteSessionIdentity(await getCurrentUserAccessProfile(request));

const failure = (error: unknown) => {
  console.error("[athlete_session_requests][failed]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Impossible de traiter la demande." },
    { status: 400 },
  );
};

export async function GET(request: Request) {
  try {
    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const identity = await getIdentity(request);
    if (!identity) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const requests = await listAthleteSessionRequests(identity);
    return NextResponse.json({ requests }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity(request);
    if (!identity) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const input = parseAthleteSessionRequestInput(await request.json());
    const sessionRequest = await createAthleteSessionRequest({ ...identity, input });
    return NextResponse.json({ request: sessionRequest }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await getIdentity(request);
    if (!identity) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = body.action === "cancel" || body.action === "respond_complement"
      ? body.action
      : null;
    if (!action) return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    const outcome = await mutateAthleteSessionRequest({
      ...identity,
      requestId: String(body.requestId ?? ""),
      action,
      complement: typeof body.complement === "string" ? body.complement : undefined,
      idempotencyKey: String(body.idempotencyKey ?? ""),
    });
    if (outcome === "not_found") {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }
    if (outcome === "conflict") {
      return NextResponse.json(
        { error: "Cette action n’est plus possible dans l’état actuel." },
        { status: 409 },
      );
    }
    const requests = await listAthleteSessionRequests(identity);
    return NextResponse.json({
      request: requests.find((item) => item.id === body.requestId) ?? null,
      unchanged: outcome === "unchanged",
    });
  } catch (error) {
    return failure(error);
  }
}
