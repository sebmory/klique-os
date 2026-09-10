import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { ContentAccessError, contentAccessErrorResponse } from "@/lib/content-storage/access";
import {
  MediaDayForbiddenError,
  MediaDayNotFoundError,
  MediaDayValidationError,
  createMediaDay,
  deleteMediaDay,
  listMediaDays,
  respondToMediaDay,
  updateMediaDay,
  type MediaDayAccessContext,
} from "@/lib/media-days/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// L identite, le workspace et l athleteId proviennent uniquement de la session Clerk.
const requireMediaDayAccess = async (request: Request): Promise<MediaDayAccessContext> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";

  if (!clerkUserId) {
    throw new ContentAccessError("UNAUTHORIZED");
  }

  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const role = access?.role ?? "";
  const athleteId = access?.athleteId?.trim() || null;

  const isAllowedRole = role === "admin" || (role === "athlete" && Boolean(athleteId));

  if (access?.status !== "active" || !workspaceId || !isAllowedRole) {
    throw new ContentAccessError("FORBIDDEN");
  }

  return {
    clerkUserId,
    workspaceId,
    role: role as MediaDayAccessContext["role"],
    isAdmin: role === "admin",
    athleteId,
  };
};

const errorResponse = (error: unknown) => {
  const accessResponse = contentAccessErrorResponse(error);
  if (accessResponse) return accessResponse;

  if (error instanceof MediaDayValidationError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  if (error instanceof MediaDayForbiddenError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 403 });
  }
  if (error instanceof MediaDayNotFoundError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 404 });
  }

  console.error(`[media_days] ${error instanceof Error ? error.message : String(error)}`);
  return NextResponse.json({ ok: false, message: "Impossible de traiter les journees media." }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    const access = await requireMediaDayAccess(request);
    const mediaDays = await listMediaDays(access);
    return NextResponse.json({ ok: true, mediaDays });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireMediaDayAccess(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const mediaDay = await createMediaDay(access, {
      title: body.title,
      description: body.description,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      location: body.location,
      capacity: body.capacity,
      status: body.status,
      athletes: body.athletes,
    });

    return NextResponse.json({ ok: true, mediaDay }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireMediaDayAccess(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const mediaDayId = String(body.mediaDayId ?? "").trim();
    if (!mediaDayId) {
      return NextResponse.json({ ok: false, message: "mediaDayId requis." }, { status: 400 });
    }

    if (body.action === "athlete_response") {
      const mediaDay = await respondToMediaDay(access, mediaDayId, body.response);
      return NextResponse.json({ ok: true, mediaDay });
    }

    const mediaDay = await updateMediaDay(access, mediaDayId, {
      title: body.title,
      description: body.description,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      location: body.location,
      capacity: body.capacity,
      status: body.status,
      athletes: body.athletes,
    });

    return NextResponse.json({ ok: true, mediaDay });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireMediaDayAccess(request);
    const mediaDayId = new URL(request.url).searchParams.get("mediaDayId")?.trim() ?? "";
    if (!mediaDayId) {
      return NextResponse.json({ ok: false, message: "mediaDayId requis." }, { status: 400 });
    }

    await deleteMediaDay(access, mediaDayId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
