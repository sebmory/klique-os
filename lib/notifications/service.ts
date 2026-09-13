import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type NotificationAccessContext = {
  workspaceId: string;
  clerkUserId: string;
};

export type NotificationRecord = {
  id: string;
  workspaceId: string;
  recipientClerkUserId: string;
  type: string;
  title: string;
  body: string | null;
  actionHref: string;
  readAt: string | null;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
};

export type CreateNotificationsForRecipientsInput = {
  workspaceId?: unknown;
  recipientClerkUserIds?: unknown;
  type?: unknown;
  title?: unknown;
  body?: unknown;
  actionHref?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
};

export type CurrentUserNotifications = {
  notifications: NotificationRecord[];
  unreadCount: number;
};

export type NotificationRecipientRole = "athlete" | "media" | "partner_expert";

const notificationRecipientRoles: readonly NotificationRecipientRole[] = [
  "athlete",
  "media",
  "partner_expert",
];

export class NotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationValidationError";
  }
}

const getSql = () => createContentStorageClient();

const requireText = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new NotificationValidationError(`${fieldName} doit etre une chaine non vide.`);
  }
  return value.trim();
};

const normalizeOptionalText = (value: unknown, fieldName: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new NotificationValidationError(`${fieldName} doit etre une chaine ou null.`);
  }
  return value.trim() || null;
};

const requireInternalHref = (value: unknown): string => {
  const actionHref = requireText(value, "actionHref");
  if (!actionHref.startsWith("/") || actionHref.startsWith("//")) {
    throw new NotificationValidationError("actionHref doit etre un lien interne commencant par /.");
  }
  return actionHref;
};

const normalizeRecipientClerkUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NotificationValidationError("recipientClerkUserIds doit contenir au moins un identifiant.");
  }

  const recipients = value.map((recipient, index) =>
    requireText(recipient, `recipientClerkUserIds[${index}]`),
  );
  return [...new Set(recipients)];
};

const normalizeBusinessIds = (value: unknown, fieldName: string): string[] => {
  if (!Array.isArray(value)) {
    throw new NotificationValidationError(`${fieldName} doit etre un tableau.`);
  }

  return [...new Set(value.map((entry, index) => requireText(entry, `${fieldName}[${index}]`)))];
};

const mapClerkUserIds = (rows: Record<string, unknown>[]): string[] => {
  const clerkUserIds = rows
    .map((row) => String(row.clerk_user_id ?? "").trim())
    .filter(Boolean);
  return [...new Set(clerkUserIds)];
};

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const date = value instanceof Date ? value : new Date(requireText(value, fieldName));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date Neon invalide pour ${fieldName}.`);
  }
  return date.toISOString();
};

const normalizeOptionalTimestamp = (value: unknown, fieldName: string): string | null => {
  if (value === undefined || value === null) return null;
  return normalizeTimestamp(value, fieldName);
};

const mapNotificationRow = (row: Record<string, unknown>): NotificationRecord => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  recipientClerkUserId: String(row.recipient_clerk_user_id ?? ""),
  type: String(row.type ?? ""),
  title: String(row.title ?? ""),
  body: row.body === null || row.body === undefined ? null : String(row.body),
  actionHref: String(row.action_href ?? ""),
  readAt: normalizeOptionalTimestamp(row.read_at, "read_at"),
  sourceType: row.source_type === null || row.source_type === undefined ? null : String(row.source_type),
  sourceId: row.source_id === null || row.source_id === undefined ? null : String(row.source_id),
  createdAt: normalizeTimestamp(row.created_at, "created_at"),
});

const normalizeAccess = (access: NotificationAccessContext): NotificationAccessContext => ({
  workspaceId: requireText(access.workspaceId, "workspaceId"),
  clerkUserId: requireText(access.clerkUserId, "clerkUserId"),
});

export const findActiveAdminClerkUserIds = async (workspaceIdValue: unknown): Promise<string[]> => {
  const workspaceId = requireText(workspaceIdValue, "workspaceId");
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT clerk_user_id
    FROM user_access
    WHERE workspace_id = ${workspaceId}
      AND role = 'admin'
      AND status = 'active'
      AND btrim(clerk_user_id) <> ''
    ORDER BY clerk_user_id ASC
  `;

  return mapClerkUserIds(rows as Record<string, unknown>[]);
};

export const findAllActiveMediaClerkUserIds = async (workspaceIdValue: unknown): Promise<string[]> => {
  const workspaceId = requireText(workspaceIdValue, "workspaceId");
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT clerk_user_id
    FROM user_access
    WHERE workspace_id = ${workspaceId}
      AND role = 'media'
      AND status = 'active'
      AND btrim(clerk_user_id) <> ''
    ORDER BY clerk_user_id ASC
  `;

  return mapClerkUserIds(rows as Record<string, unknown>[]);
};

export const findActiveClerkUserIdsByRoles = async (
  workspaceIdValue: unknown,
  rolesValue: unknown,
): Promise<string[]> => {
  const workspaceId = requireText(workspaceIdValue, "workspaceId");
  if (!Array.isArray(rolesValue) || rolesValue.length === 0) {
    throw new NotificationValidationError("roles doit contenir au moins un role.");
  }

  const roles = [...new Set(rolesValue.map((role, index) => {
    const normalizedRole = requireText(role, `roles[${index}]`) as NotificationRecipientRole;
    if (!notificationRecipientRoles.includes(normalizedRole)) {
      throw new NotificationValidationError(`roles[${index}] est invalide.`);
    }
    return normalizedRole;
  }))];

  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT clerk_user_id
    FROM user_access
    WHERE workspace_id = ${workspaceId}
      AND role = ANY(${roles}::text[])
      AND status = 'active'
      AND btrim(clerk_user_id) <> ''
    ORDER BY clerk_user_id ASC
  `;

  return mapClerkUserIds(rows as Record<string, unknown>[]);
};

export const findActiveAthleteClerkUserIds = async (
  workspaceIdValue: unknown,
  athleteIdsValue: unknown,
): Promise<string[]> => {
  const workspaceId = requireText(workspaceIdValue, "workspaceId");
  const athleteIds = normalizeBusinessIds(athleteIdsValue, "athleteIds");
  if (athleteIds.length === 0) return [];

  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT clerk_user_id
    FROM user_access
    WHERE workspace_id = ${workspaceId}
      AND role = 'athlete'
      AND status = 'active'
      AND athlete_id = ANY(${athleteIds}::text[])
      AND btrim(clerk_user_id) <> ''
    ORDER BY clerk_user_id ASC
  `;

  return mapClerkUserIds(rows as Record<string, unknown>[]);
};

export const findActiveMediaClerkUserIds = async (
  workspaceIdValue: unknown,
  mediaIdsValue: unknown,
): Promise<string[]> => {
  const workspaceId = requireText(workspaceIdValue, "workspaceId");
  const mediaIds = normalizeBusinessIds(mediaIdsValue, "mediaIds");
  if (mediaIds.length === 0) return [];

  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT clerk_user_id
    FROM user_access
    WHERE workspace_id = ${workspaceId}
      AND role = 'media'
      AND status = 'active'
      AND media_id = ANY(${mediaIds}::text[])
      AND btrim(clerk_user_id) <> ''
    ORDER BY clerk_user_id ASC
  `;

  return mapClerkUserIds(rows as Record<string, unknown>[]);
};

export const findActivePartnerClerkUserIds = async (
  workspaceIdValue: unknown,
  partnerIdsValue: unknown,
): Promise<string[]> => {
  const workspaceId = requireText(workspaceIdValue, "workspaceId");
  const partnerIds = normalizeBusinessIds(partnerIdsValue, "partnerIds");
  if (partnerIds.length === 0) return [];

  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT clerk_user_id
    FROM user_access
    WHERE workspace_id = ${workspaceId}
      AND role = 'partner_expert'
      AND status = 'active'
      AND partner_id = ANY(${partnerIds}::text[])
      AND btrim(clerk_user_id) <> ''
    ORDER BY clerk_user_id ASC
  `;

  return mapClerkUserIds(rows as Record<string, unknown>[]);
};

export const createNotificationsForRecipients = async (
  input: CreateNotificationsForRecipientsInput,
): Promise<NotificationRecord[]> => {
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  const recipientClerkUserIds = normalizeRecipientClerkUserIds(input.recipientClerkUserIds);
  const type = requireText(input.type, "type");
  const title = requireText(input.title, "title");
  const body = normalizeOptionalText(input.body, "body");
  const actionHref = requireInternalHref(input.actionHref);
  const sourceType = normalizeOptionalText(input.sourceType, "sourceType");
  const sourceId = normalizeOptionalText(input.sourceId, "sourceId");

  if (sourceType === null || sourceId === null) {
    throw new NotificationValidationError("sourceType et sourceId sont requis pour une creation idempotente.");
  }

  const notificationIds = recipientClerkUserIds.map(() => randomUUID());
  const sql = getSql();
  const rows = await sql`
    INSERT INTO notifications (
      id,
      workspace_id,
      recipient_clerk_user_id,
      type,
      title,
      body,
      action_href,
      source_type,
      source_id
    )
    SELECT
      recipients.id,
      ${workspaceId},
      recipients.recipient_clerk_user_id,
      ${type},
      ${title},
      ${body},
      ${actionHref},
      ${sourceType},
      ${sourceId}
    FROM UNNEST(
      ${notificationIds}::uuid[],
      ${recipientClerkUserIds}::text[]
    ) AS recipients(id, recipient_clerk_user_id)
    ON CONFLICT (
      workspace_id,
      recipient_clerk_user_id,
      source_type,
      source_id
    ) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    DO NOTHING
    RETURNING
      id,
      workspace_id,
      recipient_clerk_user_id,
      type,
      title,
      body,
      action_href,
      read_at,
      source_type,
      source_id,
      created_at
  `;

  return rows.map((row) => mapNotificationRow(row as Record<string, unknown>));
};

export const listCurrentUserNotifications = async (
  access: NotificationAccessContext,
): Promise<CurrentUserNotifications> => {
  const { workspaceId, clerkUserId } = normalizeAccess(access);
  const sql = getSql();
  const rows = await sql`
    SELECT
      id,
      workspace_id,
      recipient_clerk_user_id,
      type,
      title,
      body,
      action_href,
      read_at,
      source_type,
      source_id,
      created_at
    FROM notifications
    WHERE workspace_id = ${workspaceId}
      AND recipient_clerk_user_id = ${clerkUserId}
    ORDER BY created_at DESC
    LIMIT 30
  `;
  const countRows = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM notifications
    WHERE workspace_id = ${workspaceId}
      AND recipient_clerk_user_id = ${clerkUserId}
      AND read_at IS NULL
  `;

  return {
    notifications: rows.map((row) => mapNotificationRow(row as Record<string, unknown>)),
    unreadCount: Number(countRows[0]?.unread_count ?? 0),
  };
};

export const markCurrentUserNotificationRead = async (
  access: NotificationAccessContext,
  notificationId: unknown,
): Promise<NotificationRecord | null> => {
  const { workspaceId, clerkUserId } = normalizeAccess(access);
  const id = requireText(notificationId, "notificationId");
  const sql = getSql();
  const rows = await sql`
    UPDATE notifications
    SET read_at = COALESCE(read_at, NOW())
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
      AND recipient_clerk_user_id = ${clerkUserId}
    RETURNING
      id,
      workspace_id,
      recipient_clerk_user_id,
      type,
      title,
      body,
      action_href,
      read_at,
      source_type,
      source_id,
      created_at
  `;

  return rows[0] ? mapNotificationRow(rows[0] as Record<string, unknown>) : null;
};