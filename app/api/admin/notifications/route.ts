import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import {
  NotificationValidationError,
  createNotificationsForRecipients,
  findActiveClerkUserIdsByRoles,
  type NotificationRecipientRole,
} from "@/lib/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestedRecipientRole = NotificationRecipientRole | "all";

const recipientRoles: readonly NotificationRecipientRole[] = ["athlete", "media", "partner_expert"];

const normalizeText = (value: unknown): string => typeof value === "string" ? value.trim() : "";

const parseRecipientRoles = (value: unknown): NotificationRecipientRole[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;

  const requestedRoles = value.map((role) => normalizeText(role) as RequestedRecipientRole);
  if (requestedRoles.some((role) => role !== "all" && !recipientRoles.includes(role))) return null;
  if (requestedRoles.includes("all")) return [...recipientRoles];
  return [...new Set(requestedRoles as NotificationRecipientRole[])];
};

const isInternalHref = (value: string): boolean => value.startsWith("/") && !value.startsWith("//");

export async function POST(request: Request) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
    if (!clerkUserId) {
      return NextResponse.json({ ok: false, message: "Authentification requise." }, { status: 401 });
    }

    const access = profile?.userAccess ?? null;
    const workspaceId = access?.workspaceId?.trim() ?? "";
    if (access?.role !== "admin" || access.status !== "active" || !workspaceId) {
      return NextResponse.json({ ok: false, message: "Accès refusé." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const title = normalizeText(payload.title);
    if (!title) {
      return NextResponse.json({ ok: false, message: "Le titre est obligatoire." }, { status: 400 });
    }

    if (payload.body !== undefined && payload.body !== null && typeof payload.body !== "string") {
      return NextResponse.json({ ok: false, message: "Le contenu est invalide." }, { status: 400 });
    }
    const body = payload.body === undefined || payload.body === null ? null : payload.body.trim() || null;

    const actionHref = normalizeText(payload.actionHref);
    if (!actionHref || !isInternalHref(actionHref)) {
      return NextResponse.json({ ok: false, message: "Le lien doit être un chemin interne." }, { status: 400 });
    }

    const roles = parseRecipientRoles(payload.recipientRoles);
    if (!roles) {
      return NextResponse.json({ ok: false, message: "Les rôles destinataires sont invalides." }, { status: 400 });
    }

    const recipientClerkUserIds = [
      ...new Set((await findActiveClerkUserIdsByRoles(workspaceId, roles)).map((userId) => userId.trim()).filter(Boolean)),
    ];
    const announcementId = `${clerkUserId}:${randomUUID()}`;
    if (recipientClerkUserIds.length > 0) {
      await createNotificationsForRecipients({
        workspaceId,
        recipientClerkUserIds,
        type: "manual_announcement",
        title,
        body,
        actionHref,
        sourceType: "manual_announcement",
        sourceId: announcementId,
      });
    }

    return NextResponse.json({
      ok: true,
      announcementId,
      recipientCount: recipientClerkUserIds.length,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof NotificationValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error(`[admin_notifications] ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, message: "Impossible d’envoyer la notification." }, { status: 500 });
  }
}