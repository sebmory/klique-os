import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { ContentAccessError, contentAccessErrorResponse } from "@/lib/content-storage/access";
import {
  MediaRequestForbiddenError,
  MediaRequestNotFoundError,
  MediaRequestValidationError,
  createMediaRequest,
  listMediaRequests,
  updateMediaRequestAthleteConsent,
  updateMediaRequestStatus,
  type MediaRequestAccessContext,
} from "@/lib/media-requests/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// L identite du demandeur (userId, email, mediaId, athleteId) provient uniquement de la session Clerk.
const requireMediaRequestAccess = async (request: Request): Promise<MediaRequestAccessContext> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";

  if (!clerkUserId) {
    throw new ContentAccessError("UNAUTHORIZED");
  }

  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const role = access?.role ?? "";
  const athleteId = access?.athleteId?.trim() || null;

  const isAllowedRole =
    role === "admin" || role === "media" || (role === "athlete" && Boolean(athleteId));

  if (access?.status !== "active" || !workspaceId || !isAllowedRole) {
    throw new ContentAccessError("FORBIDDEN");
  }

  return {
    clerkUserId,
    workspaceId,
    role: role as MediaRequestAccessContext["role"],
    isAdmin: role === "admin",
    email: access.email?.trim() || profile?.clerkUser?.email?.trim() || null,
    mediaId: access.mediaId?.trim() || null,
    athleteId,
  };
};

const errorResponse = (error: unknown) => {
  const accessResponse = contentAccessErrorResponse(error);
  if (accessResponse) return accessResponse;

  if (error instanceof MediaRequestValidationError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  if (error instanceof MediaRequestForbiddenError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 403 });
  }
  if (error instanceof MediaRequestNotFoundError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 404 });
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[media_requests] ${message}`);
  return NextResponse.json({ ok: false, message: "Impossible de traiter les demandes media." }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    const access = await requireMediaRequestAccess(request);
    const requests = await listMediaRequests(access);
    return NextResponse.json({ ok: true, requests });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireMediaRequestAccess(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const mediaRequest = await createMediaRequest(access, {
      subjectId: body.subjectId,
      requestType: body.requestType,
      message: body.message,
      deadline: body.deadline,
      athleteIds: body.athleteIds,
    });

    return NextResponse.json({ ok: true, request: mediaRequest }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireMediaRequestAccess(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const requestId = String(body.requestId ?? "").trim();
    if (!requestId) {
      return NextResponse.json({ ok: false, message: "requestId requis." }, { status: 400 });
    }

    if (body.action === "athlete_consent") {
      const mediaRequest = await updateMediaRequestAthleteConsent(access, requestId, body.consent);
      return NextResponse.json({ ok: true, request: mediaRequest });
    }

    const mediaRequest = await updateMediaRequestStatus(access, requestId, {
      status: body.status,
      adminNote: body.adminNote,
    });

    return NextResponse.json({ ok: true, request: mediaRequest });
  } catch (error) {
    return errorResponse(error);
  }
}
