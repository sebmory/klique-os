import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile, type ClerkUserAccessRole } from "@/lib/clerk-access/service";
import { ContentAccessError, contentAccessErrorResponse } from "@/lib/content-storage/access";
import {
  NotificationValidationError,
  listCurrentUserNotifications,
  markCurrentUserNotificationRead,
  type NotificationAccessContext,
} from "@/lib/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notificationRoles: readonly ClerkUserAccessRole[] = ["admin", "athlete", "media", "partner_expert"];

const requireNotificationAccess = async (request: Request): Promise<NotificationAccessContext> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";

  if (!clerkUserId) {
    throw new ContentAccessError("UNAUTHORIZED");
  }

  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const role = access?.role ?? "";

  if (
    access?.status !== "active"
    || !workspaceId
    || !notificationRoles.includes(role as ClerkUserAccessRole)
  ) {
    throw new ContentAccessError("FORBIDDEN");
  }

  return { workspaceId, clerkUserId };
};

const errorResponse = (error: unknown) => {
  const accessResponse = contentAccessErrorResponse(error);
  if (accessResponse) return accessResponse;

  if (error instanceof NotificationValidationError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  console.error(`[notifications] ${error instanceof Error ? error.message : String(error)}`);
  return NextResponse.json(
    { ok: false, message: "Impossible de traiter les notifications." },
    { status: 500 },
  );
};

export async function GET(request: Request) {
  try {
    const access = await requireNotificationAccess(request);
    const result = await listCurrentUserNotifications(access);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireNotificationAccess(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : "";
    if (!notificationId) {
      return NextResponse.json({ ok: false, message: "notificationId requis." }, { status: 400 });
    }

    const notification = await markCurrentUserNotificationRead(access, notificationId);
    if (!notification) {
      return NextResponse.json({ ok: false, message: "Notification introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, notification });
  } catch (error) {
    return errorResponse(error);
  }
}