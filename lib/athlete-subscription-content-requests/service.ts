import { randomUUID } from "node:crypto";
import {
  ATHLETE_CONTENT_FORMATS,
  ATHLETE_CONTENT_FORMAT_CODES,
  type AthleteContentFormatCode,
} from "@/lib/athlete-subscription-catalog";
import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  createNotificationsForRecipients,
  findActiveAdminClerkUserIds,
  findActiveAthleteClerkUserIds,
} from "@/lib/notifications/service";

export type AthleteSubscriptionContentRequestStatus =
  | "requested"
  | "accepted"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type AthleteSubscriptionContentRequest = {
  id: string;
  workspaceId: string;
  subscriptionId: string;
  athleteId: string;
  formatCode: AthleteContentFormatCode;
  status: AthleteSubscriptionContentRequestStatus;
  athleteNote: string | null;
  preferredDate: string | null;
  adminNote: string | null;
  reservedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAthleteSubscriptionContentRequestInput = {
  workspaceId: string;
  athleteId: string;
  formatCode: AthleteContentFormatCode;
  athleteNote?: string | null;
  preferredDate?: string | Date | null;
};

export type ChangeAthleteSubscriptionContentRequestStatusInput = {
  workspaceId: string;
  requestId: string;
  status: AthleteSubscriptionContentRequestStatus;
  adminNote?: string | null;
};

export type AthleteSubscriptionContentRequestErrorCode = "validation" | "not_found" | "conflict";

export class AthleteSubscriptionContentRequestError extends Error {
  constructor(
    public readonly code: AthleteSubscriptionContentRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AthleteSubscriptionContentRequestError";
  }
}

export class AthleteSubscriptionContentRequestValidationError extends AthleteSubscriptionContentRequestError {
  constructor(message: string) {
    super("validation", message);
    this.name = "AthleteSubscriptionContentRequestValidationError";
  }
}

export class AthleteSubscriptionContentRequestNotFoundError extends AthleteSubscriptionContentRequestError {
  constructor(message = "Demande de contenu personnalisé introuvable.") {
    super("not_found", message);
    this.name = "AthleteSubscriptionContentRequestNotFoundError";
  }
}

export class AthleteSubscriptionContentRequestConflictError extends AthleteSubscriptionContentRequestError {
  constructor(message: string) {
    super("conflict", message);
    this.name = "AthleteSubscriptionContentRequestConflictError";
  }
}

type ContentRequestRow = Record<string, unknown>;

export type AthleteSubscriptionContentRequestCreateRecord = {
  id: string;
  workspaceId: string;
  athleteId: string;
  formatCode: AthleteContentFormatCode;
  athleteNote: string | null;
  preferredDate: string | null;
};

export type AthleteSubscriptionContentRequestStatusRecord = {
  workspaceId: string;
  requestId: string;
  status: AthleteSubscriptionContentRequestStatus;
  adminNote: string | null;
  updateAdminNote: boolean;
};

type CreateOutcome = {
  outcome: "created" | "no_active_subscription" | "quota_exceeded";
  row: ContentRequestRow | null;
};

type StatusOutcome = {
  outcome: "updated" | "unchanged" | "not_found" | "conflict";
  row: ContentRequestRow | null;
};

export type AthleteSubscriptionContentRequestRepository = {
  listAdmin: (workspaceId: string) => Promise<ContentRequestRow[]>;
  listAthlete: (workspaceId: string, athleteId: string) => Promise<ContentRequestRow[]>;
  create: (record: AthleteSubscriptionContentRequestCreateRecord) => Promise<CreateOutcome>;
  changeStatus: (record: AthleteSubscriptionContentRequestStatusRecord) => Promise<StatusOutcome>;
};

const requestColumns = `
  id, workspace_id, subscription_id, athlete_id, format_code, status,
  athlete_note, preferred_date, admin_note, reserved_at, completed_at,
  created_at, updated_at
`;

const statuses: readonly AthleteSubscriptionContentRequestStatus[] = [
  "requested",
  "accepted",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
];

const formatCodes = new Set<string>(ATHLETE_CONTENT_FORMAT_CODES);

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const requireText = (value: unknown, fieldName: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new AthleteSubscriptionContentRequestValidationError(`${fieldName} est requis.`);
  }
  return normalized;
};

const requireUuid = (value: unknown, fieldName: string): string => {
  const normalized = requireText(value, fieldName);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new AthleteSubscriptionContentRequestValidationError(`${fieldName} est invalide.`);
  }
  return normalized;
};

const normalizeNullableText = (value: unknown, fieldName: string): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new AthleteSubscriptionContentRequestValidationError(`${fieldName} ne peut pas être vide.`);
  }
  return normalized;
};

const normalizeDate = (value: unknown, fieldName: string): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AthleteSubscriptionContentRequestValidationError(`${fieldName} est invalide.`);
    }
    return value.toISOString().slice(0, 10);
  }
  const normalized = requireText(value, fieldName);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new AthleteSubscriptionContentRequestValidationError(`${fieldName} est invalide.`);
  }
  return normalized;
};

const normalizeNullableDate = (value: unknown, fieldName: string): string | null =>
  value === undefined || value === null ? null : normalizeDate(value, fieldName);

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(requireText(value, fieldName));
  if (Number.isNaN(parsed.getTime())) {
    throw new AthleteSubscriptionContentRequestValidationError(`${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const normalizeNullableTimestamp = (value: unknown, fieldName: string): string | null =>
  value === undefined || value === null ? null : normalizeTimestamp(value, fieldName);

const normalizeFormatCode = (value: unknown): AthleteContentFormatCode => {
  const normalized = normalizeText(value);
  if (!formatCodes.has(normalized)) {
    throw new AthleteSubscriptionContentRequestValidationError("formatCode est invalide.");
  }
  return normalized as AthleteContentFormatCode;
};

const normalizeStatus = (value: unknown): AthleteSubscriptionContentRequestStatus => {
  const normalized = normalizeText(value) as AthleteSubscriptionContentRequestStatus;
  if (!statuses.includes(normalized)) {
    throw new AthleteSubscriptionContentRequestValidationError("status est invalide.");
  }
  return normalized;
};

const mapRow = (row: ContentRequestRow): AthleteSubscriptionContentRequest => ({
  id: requireUuid(row.id, "id"),
  workspaceId: requireText(row.workspace_id, "workspace_id"),
  subscriptionId: requireUuid(row.subscription_id, "subscription_id"),
  athleteId: requireText(row.athlete_id, "athlete_id"),
  formatCode: normalizeFormatCode(row.format_code),
  status: normalizeStatus(row.status),
  athleteNote: normalizeNullableText(row.athlete_note, "athlete_note"),
  preferredDate: normalizeNullableDate(row.preferred_date, "preferred_date"),
  adminNote: normalizeNullableText(row.admin_note, "admin_note"),
  reservedAt: normalizeNullableTimestamp(row.reserved_at, "reserved_at"),
  completedAt: normalizeNullableTimestamp(row.completed_at, "completed_at"),
  createdAt: normalizeTimestamp(row.created_at, "created_at"),
  updatedAt: normalizeTimestamp(row.updated_at, "updated_at"),
});

const formatName = (formatCode: AthleteContentFormatCode): string =>
  ATHLETE_CONTENT_FORMATS.find(({ code }) => code === formatCode)?.name ?? formatCode;

const statusNotificationTitles: Record<AthleteSubscriptionContentRequestStatus, string> = {
  requested: "Demande de contenu enregistrée",
  accepted: "Demande de contenu acceptée",
  in_progress: "Contenu personnalisé en cours",
  completed: "Contenu personnalisé terminé",
  declined: "Demande de contenu refusée",
  cancelled: "Demande de contenu annulée",
};

const notifyAdminsOfCreation = async (
  contentRequest: AthleteSubscriptionContentRequest,
): Promise<void> => {
  try {
    const recipientClerkUserIds = await findActiveAdminClerkUserIds(contentRequest.workspaceId);
    if (recipientClerkUserIds.length === 0) return;
    await createNotificationsForRecipients({
      workspaceId: contentRequest.workspaceId,
      recipientClerkUserIds,
      type: "athlete_subscription_content_request.created",
      title: "Nouvelle demande de contenu personnalisé",
      body: `Format : ${formatName(contentRequest.formatCode)}`,
      actionHref: "/settings/athlete-subscriptions",
      sourceType: "request",
      sourceId: contentRequest.id,
    });
  } catch (error) {
    console.error(
      `[athlete_subscription_content_request_notifications] ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const notifyAthleteOfStatusChange = async (
  contentRequest: AthleteSubscriptionContentRequest,
): Promise<void> => {
  try {
    const recipientClerkUserIds = await findActiveAthleteClerkUserIds(
      contentRequest.workspaceId,
      [contentRequest.athleteId],
    );
    if (recipientClerkUserIds.length === 0) return;
    await createNotificationsForRecipients({
      workspaceId: contentRequest.workspaceId,
      recipientClerkUserIds,
      type: "athlete_subscription_content_request.status_updated",
      title: statusNotificationTitles[contentRequest.status],
      body: `Format : ${formatName(contentRequest.formatCode)}`,
      actionHref: "/athlete/pass",
      sourceType: "request_status",
      sourceId: `${contentRequest.id}:${contentRequest.status}`,
    });
  } catch (error) {
    console.error(
      `[athlete_subscription_content_request_notifications] ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const createRepository = (): AthleteSubscriptionContentRequestRepository => {
  const sql = createContentStorageClient();
  return {
    async listAdmin(workspaceId) {
      return await sql.query(`
        SELECT ${requestColumns}
        FROM athlete_subscription_content_requests
        WHERE workspace_id = $1
        ORDER BY created_at DESC
      `, [workspaceId]) as ContentRequestRow[];
    },
    async listAthlete(workspaceId, athleteId) {
      return await sql.query(`
        SELECT ${requestColumns}
        FROM athlete_subscription_content_requests
        WHERE workspace_id = $1
          AND athlete_id = $2
        ORDER BY created_at DESC
      `, [workspaceId, athleteId]) as ContentRequestRow[];
    },
    async create(record) {
      const lockSubscription = sql`
        SELECT id
        FROM athlete_subscriptions
        WHERE workspace_id = ${record.workspaceId}
          AND athlete_id = ${record.athleteId}
          AND status = 'active'
          AND starts_on <= CURRENT_DATE
          AND ends_on >= CURRENT_DATE
        ORDER BY starts_on DESC
        LIMIT 1
        FOR UPDATE
      `;
      const insertRequest = sql`
        INSERT INTO athlete_subscription_content_requests (
          id, workspace_id, subscription_id, athlete_id, format_code, status,
          athlete_note, preferred_date, created_at, updated_at
        )
        SELECT ${record.id}::uuid, subscription.workspace_id, subscription.id,
               subscription.athlete_id, ${record.formatCode}, 'requested',
               ${record.athleteNote}, ${record.preferredDate}::date, NOW(), NOW()
        FROM athlete_subscriptions subscription
        WHERE subscription.workspace_id = ${record.workspaceId}
          AND subscription.athlete_id = ${record.athleteId}
          AND subscription.status = 'active'
          AND subscription.starts_on <= CURRENT_DATE
          AND subscription.ends_on >= CURRENT_DATE
          AND (
            SELECT COUNT(*)
            FROM athlete_subscription_content_requests existing
            WHERE existing.workspace_id = subscription.workspace_id
              AND existing.subscription_id = subscription.id
              AND existing.athlete_id = subscription.athlete_id
              AND existing.status IN ('requested', 'accepted', 'in_progress', 'completed')
          ) < subscription.custom_contents_included
        RETURNING id, workspace_id, subscription_id, athlete_id, format_code, status,
                  athlete_note, preferred_date, admin_note, reserved_at, completed_at,
                  created_at, updated_at
      `;
      const results = await sql.transaction([lockSubscription, insertRequest]);
      const activeSubscription = results[0] as ContentRequestRow[];
      const rows = results[1] as ContentRequestRow[];
      if (rows[0]) return { outcome: "created", row: rows[0] };
      return activeSubscription[0]
        ? { outcome: "quota_exceeded", row: null }
        : { outcome: "no_active_subscription", row: null };
    },
    async changeStatus(record) {
      const rows = await sql.query(`
        WITH candidate AS (
          SELECT *
          FROM athlete_subscription_content_requests
          WHERE workspace_id = $1
            AND id = $2::uuid
          FOR UPDATE
        ), transitioned AS (
          UPDATE athlete_subscription_content_requests request
          SET status = $3,
              admin_note = CASE WHEN $4::boolean THEN $5 ELSE request.admin_note END,
              reserved_at = CASE
                WHEN $3 IN ('accepted', 'in_progress', 'completed')
                  THEN COALESCE(request.reserved_at, NOW())
                ELSE request.reserved_at
              END,
              completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END,
              updated_at = NOW()
          FROM candidate
          WHERE request.workspace_id = $1
            AND request.id = candidate.id
            AND (
              (candidate.status = 'requested' AND $3 IN ('accepted', 'declined', 'cancelled'))
              OR (candidate.status = 'accepted' AND $3 IN ('in_progress', 'declined', 'cancelled'))
              OR (candidate.status = 'in_progress' AND $3 IN ('completed', 'cancelled'))
            )
          RETURNING request.*
        )
        SELECT transitioned.*, 'updated' AS transition_outcome
        FROM transitioned
        UNION ALL
        SELECT candidate.*,
               CASE WHEN candidate.status = $3 THEN 'unchanged' ELSE 'conflict' END AS transition_outcome
        FROM candidate
        WHERE NOT EXISTS (SELECT 1 FROM transitioned)
        LIMIT 1
      `, [record.workspaceId, record.requestId, record.status, record.updateAdminNote, record.adminNote]);
      const row = rows[0] as (ContentRequestRow & { transition_outcome: string }) | undefined;
      if (!row) return { outcome: "not_found", row: null };
      if (row.transition_outcome === "conflict") return { outcome: "conflict", row };
      return {
        outcome: row.transition_outcome === "updated" ? "updated" : "unchanged",
        row,
      };
    },
  };
};

export const listAthleteSubscriptionContentRequestsForAdmin = async (
  workspaceId: string,
  repository: AthleteSubscriptionContentRequestRepository = createRepository(),
): Promise<AthleteSubscriptionContentRequest[]> => {
  const normalizedWorkspaceId = requireText(workspaceId, "workspaceId");
  return (await repository.listAdmin(normalizedWorkspaceId)).map(mapRow);
};

export const listAthleteSubscriptionContentRequestsForAthlete = async (
  workspaceId: string,
  athleteId: string,
  repository: AthleteSubscriptionContentRequestRepository = createRepository(),
): Promise<AthleteSubscriptionContentRequest[]> => {
  const normalizedWorkspaceId = requireText(workspaceId, "workspaceId");
  const normalizedAthleteId = requireText(athleteId, "athleteId");
  return (await repository.listAthlete(normalizedWorkspaceId, normalizedAthleteId)).map(mapRow);
};

export const createAthleteSubscriptionContentRequest = async (
  input: CreateAthleteSubscriptionContentRequestInput,
  repository: AthleteSubscriptionContentRequestRepository = createRepository(),
): Promise<AthleteSubscriptionContentRequest> => {
  const record: AthleteSubscriptionContentRequestCreateRecord = {
    id: randomUUID(),
    workspaceId: requireText(input.workspaceId, "workspaceId"),
    athleteId: requireText(input.athleteId, "athleteId"),
    formatCode: normalizeFormatCode(input.formatCode),
    athleteNote: normalizeNullableText(input.athleteNote, "athleteNote"),
    preferredDate: normalizeNullableDate(input.preferredDate, "preferredDate"),
  };
  const result = await repository.create(record);
  if (result.outcome === "no_active_subscription") {
    throw new AthleteSubscriptionContentRequestConflictError(
      "Un abonnement actif et non expiré est requis.",
    );
  }
  if (result.outcome === "quota_exceeded") {
    throw new AthleteSubscriptionContentRequestConflictError(
      "Le quota annuel de contenus personnalisés est atteint.",
    );
  }
  const contentRequest = mapRow(result.row!);
  await notifyAdminsOfCreation(contentRequest);
  return contentRequest;
};

export const changeAthleteSubscriptionContentRequestStatus = async (
  input: ChangeAthleteSubscriptionContentRequestStatusInput,
  repository: AthleteSubscriptionContentRequestRepository = createRepository(),
): Promise<AthleteSubscriptionContentRequest> => {
  const result = await repository.changeStatus({
    workspaceId: requireText(input.workspaceId, "workspaceId"),
    requestId: requireUuid(input.requestId, "requestId"),
    status: normalizeStatus(input.status),
    adminNote: normalizeNullableText(input.adminNote, "adminNote"),
    updateAdminNote: input.adminNote !== undefined,
  });
  if (result.outcome === "not_found" || !result.row) {
    throw new AthleteSubscriptionContentRequestNotFoundError();
  }
  if (result.outcome === "conflict") {
    throw new AthleteSubscriptionContentRequestConflictError(
      "Cette transition de statut n’est pas autorisée.",
    );
  }
  const contentRequest = mapRow(result.row);
  if (result.outcome === "updated") {
    await notifyAthleteOfStatusChange(contentRequest);
  }
  return contentRequest;
};