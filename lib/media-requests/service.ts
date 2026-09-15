import { randomUUID } from "crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { MEDIA_REQUEST_TYPES, type MediaRequestType } from "@/lib/media-subjects/service";
import {
  createNotificationsForRecipients,
  findActiveAdminClerkUserIds,
  findActiveAthleteClerkUserIds,
} from "@/lib/notifications/service";

export type MediaRequestStatus =
  | "submitted"
  | "reviewing"
  | "awaiting_athlete"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

export const MEDIA_REQUEST_STATUSES: readonly MediaRequestStatus[] = Object.freeze([
  "submitted",
  "reviewing",
  "awaiting_athlete",
  "accepted",
  "declined",
  "completed",
  "cancelled",
]);

const MEDIA_REQUEST_STATUS_LABELS: Record<MediaRequestStatus, string> = {
  submitted: "Envoyée",
  reviewing: "En cours d’examen",
  awaiting_athlete: "En attente de l’athlète",
  accepted: "Acceptée",
  declined: "Refusée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const MEDIA_REQUEST_TYPE_LABELS: Record<MediaRequestType, string> = {
  interview: "Interview",
  reaction: "Réaction",
  reportage: "Reportage",
  images: "Images",
  podcast: "Podcast",
};

export type MediaRequestConsentStatus = "pending" | "approved" | "declined";

export type MediaRequestOrigin = "klique_proposal" | "free";

export const MEDIA_REQUEST_ORIGINS: readonly MediaRequestOrigin[] = Object.freeze([
  "klique_proposal",
  "free",
]);

// Une demande d images peut ne cibler aucun athlete : tous les autres types en exigent au moins un.
const REQUEST_TYPES_WITHOUT_ATHLETE: readonly MediaRequestType[] = Object.freeze(["images"]);

export type MediaRequestAthlete = {
  athleteId: string;
  consentStatus: MediaRequestConsentStatus;
  respondedAt: string | null;
};

export type MediaRequestRecord = {
  id: string;
  workspaceId: string;
  origin: MediaRequestOrigin;
  subjectId: string | null;
  title: string | null;
  subjectTitle: string | null;
  requestedByClerkUserId: string;
  requesterEmail: string;
  mediaId: string | null;
  requestType: MediaRequestType;
  message: string;
  deadline: string | null;
  status: MediaRequestStatus;
  adminNote: string | null;
  athleteIds: string[];
  athletes: MediaRequestAthlete[];
  createdAt: string;
  updatedAt: string;
};

export type MediaRequestInput = {
  origin?: unknown;
  subjectId?: unknown;
  title?: unknown;
  requestType?: unknown;
  message?: unknown;
  deadline?: unknown;
  athleteIds?: unknown;
};

export type MediaRequestStatusInput = {
  status?: unknown;
  adminNote?: unknown;
};

// L e-mail du demandeur provient de la session Clerk, jamais du body.
export type MediaRequestAccessContext = Omit<ContentAccessContext, "role"> & {
  role: ContentAccessContext["role"] | "athlete";
  email?: string | null;
  mediaId?: string | null;
  athleteId?: string | null;
};

export class MediaRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaRequestValidationError";
  }
}

export class MediaRequestForbiddenError extends Error {
  constructor(message = "Acces refuse.") {
    super(message);
    this.name = "MediaRequestForbiddenError";
  }
}

export class MediaRequestNotFoundError extends Error {
  constructor(message = "Demande introuvable.") {
    super(message);
    this.name = "MediaRequestNotFoundError";
  }
}

const getSql = () => createContentStorageClient();

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | null => normalizeText(value) || null;

export const normalizeMediaRequestStatus = (value: unknown): MediaRequestStatus | null => {
  const normalized = normalizeText(value).toLowerCase();
  return MEDIA_REQUEST_STATUSES.includes(normalized as MediaRequestStatus)
    ? (normalized as MediaRequestStatus)
    : null;
};

export const normalizeMediaRequestType = (value: unknown): MediaRequestType | null => {
  const normalized = normalizeText(value).toLowerCase();
  return MEDIA_REQUEST_TYPES.includes(normalized as MediaRequestType)
    ? (normalized as MediaRequestType)
    : null;
};

export const normalizeMediaRequestOrigin = (value: unknown): MediaRequestOrigin | null => {
  const normalized = normalizeText(value).toLowerCase();
  return MEDIA_REQUEST_ORIGINS.includes(normalized as MediaRequestOrigin)
    ? (normalized as MediaRequestOrigin)
    : null;
};

const normalizeConsentStatus = (value: unknown): MediaRequestConsentStatus => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "approved" || normalized === "declined" ? normalized : "pending";
};

// Une echeance est une date civile : jamais une date locale ni un horodatage.
export const normalizeMediaRequestDeadline = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (isoPrefix) return isoPrefix[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const normalizeAthleteIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeText(entry);
    if (normalized) unique.add(normalized);
  }
  return [...unique];
};

// Le driver renvoie un Date pour les TIMESTAMPTZ : l UI attend une chaine ISO.
const normalizeTimestamp = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const ensureMediaRequestTables = async () => {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS media_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'klique_proposal' CHECK (
        origin IN ('klique_proposal', 'free')
      ),
      subject_id TEXT NULL REFERENCES media_subjects (id) ON DELETE RESTRICT,
      title TEXT NULL,
      requested_by_clerk_user_id TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      media_id TEXT NULL,
      request_type TEXT NOT NULL CHECK (
        request_type IN ('interview', 'reaction', 'reportage', 'images', 'podcast')
      ),
      message TEXT NOT NULL,
      deadline DATE NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'submitted', 'reviewing', 'awaiting_athlete', 'accepted',
          'declined', 'completed', 'cancelled'
        )
      ),
      admin_note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT media_requests_title_not_blank CHECK (
        title IS NULL OR NULLIF(btrim(title), '') IS NOT NULL
      ),
      CONSTRAINT media_requests_origin_subject_check CHECK (
        (origin = 'klique_proposal' AND subject_id IS NOT NULL)
        OR (
          origin = 'free'
          AND subject_id IS NULL
          AND NULLIF(btrim(title), '') IS NOT NULL
        )
      )
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_requests_workspace_status_idx
      ON media_requests (workspace_id, status, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_requests_workspace_requester_idx
      ON media_requests (workspace_id, requested_by_clerk_user_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_requests_workspace_subject_idx
      ON media_requests (workspace_id, subject_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS media_request_athletes (
      request_id TEXT NOT NULL REFERENCES media_requests (id) ON DELETE CASCADE,
      athlete_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        consent_status IN ('pending', 'approved', 'declined')
      ),
      responded_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (request_id, athlete_id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_request_athletes_workspace_athlete_idx
      ON media_request_athletes (workspace_id, athlete_id, consent_status)
  `;
};

const mapAthletes = (value: unknown): MediaRequestAthlete[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const athleteId = normalizeText(row.athlete_id);
      if (!athleteId) return null;
      return {
        athleteId,
        consentStatus: normalizeConsentStatus(row.consent_status),
        respondedAt: normalizeTimestamp(row.responded_at),
      } satisfies MediaRequestAthlete;
    })
    .filter((entry): entry is MediaRequestAthlete => entry !== null)
    .sort((a, b) => a.athleteId.localeCompare(b.athleteId));
};

const mapRow = (row: Record<string, unknown>): MediaRequestRecord => {
  const athletes = mapAthletes(row.athletes);

  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    origin: normalizeMediaRequestOrigin(row.origin) ?? "klique_proposal",
    subjectId: normalizeOptionalText(row.subject_id),
    title: normalizeOptionalText(row.title),
    subjectTitle: normalizeOptionalText(row.subject_title),
    requestedByClerkUserId: String(row.requested_by_clerk_user_id ?? ""),
    requesterEmail: String(row.requester_email ?? ""),
    mediaId: normalizeOptionalText(row.media_id),
    requestType: normalizeMediaRequestType(row.request_type) ?? "images",
    message: String(row.message ?? ""),
    deadline: normalizeMediaRequestDeadline(row.deadline),
    status: normalizeMediaRequestStatus(row.status) ?? "submitted",
    adminNote: normalizeOptionalText(row.admin_note),
    athleteIds: athletes.map((athlete) => athlete.athleteId),
    athletes,
    createdAt: normalizeTimestamp(row.created_at) ?? "",
    updatedAt: normalizeTimestamp(row.updated_at) ?? "",
  };
};

const requireAdmin = (access: MediaRequestAccessContext) => {
  if (!access.isAdmin) {
    throw new MediaRequestForbiddenError();
  }
};

const requireMedia = (access: MediaRequestAccessContext): string => {
  const mediaId = normalizeText(access.mediaId);
  if (access.role !== "media" || !mediaId) {
    throw new MediaRequestForbiddenError();
  }
  return mediaId;
};

const notifyMediaRequestStatusChange = async (
  workspaceId: string,
  requestId: string,
  recipientClerkUserIdValue: unknown,
  status: MediaRequestStatus,
): Promise<void> => {
  const recipientClerkUserId = normalizeText(recipientClerkUserIdValue);
  if (!recipientClerkUserId) return;

  try {
    await createNotificationsForRecipients({
      workspaceId,
      recipientClerkUserIds: [recipientClerkUserId],
      type: "media_request.status_updated",
      title: "Votre demande média a été mise à jour",
      body: MEDIA_REQUEST_STATUS_LABELS[status],
      actionHref: "/media-desk",
      sourceType: "media_request_status",
      sourceId: `${requestId}:${status}`,
    });
  } catch (error) {
    console.error(`[media_requests_notifications] ${error instanceof Error ? error.message : String(error)}`);
  }
};

const notifyAdminsOfMediaRequestCreation = async (mediaRequest: MediaRequestRecord): Promise<void> => {
  try {
    const recipientClerkUserIds = await findActiveAdminClerkUserIds(mediaRequest.workspaceId);
    if (recipientClerkUserIds.length === 0) return;

    await createNotificationsForRecipients({
      workspaceId: mediaRequest.workspaceId,
      recipientClerkUserIds,
      type: "media_request.created",
      title: "Nouvelle demande média",
      body: MEDIA_REQUEST_TYPE_LABELS[mediaRequest.requestType],
      actionHref: "/media-desk",
      sourceType: "media_request_created",
      sourceId: mediaRequest.id,
    });
  } catch (error) {
    console.error(`[media_requests_notifications] ${error instanceof Error ? error.message : String(error)}`);
  }
};

const notifyMediaRequestAthletesForConsent = async (mediaRequest: MediaRequestRecord): Promise<void> => {
  for (const athleteId of mediaRequest.athleteIds) {
    try {
      const recipientClerkUserIds = await findActiveAthleteClerkUserIds(
        mediaRequest.workspaceId,
        [athleteId],
      );
      if (recipientClerkUserIds.length === 0) continue;

      await createNotificationsForRecipients({
        workspaceId: mediaRequest.workspaceId,
        recipientClerkUserIds,
        type: "media_request.athlete_consent_requested",
        title: "Votre accord est demandé",
        body: MEDIA_REQUEST_TYPE_LABELS[mediaRequest.requestType],
        actionHref: "/athlete/media-requests",
        sourceType: "media_request_athlete",
        sourceId: `${mediaRequest.id}:${athleteId}`,
      });
    } catch (error) {
      console.error(`[media_requests_notifications] ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

const notifyAdminsOfMediaRequestAthleteResponse = async (
  workspaceId: string,
  requestId: string,
  athleteId: string,
  consentStatus: "approved" | "declined",
): Promise<void> => {
  try {
    const recipientClerkUserIds = await findActiveAdminClerkUserIds(workspaceId);
    if (recipientClerkUserIds.length === 0) return;

    await createNotificationsForRecipients({
      workspaceId,
      recipientClerkUserIds,
      type: "media_request.athlete_response",
      title: consentStatus === "approved"
        ? "Accord athlète reçu"
        : "Demande média refusée par l’athlète",
      actionHref: "/media-desk",
      sourceType: "media_request_athlete_response",
      sourceId: `${requestId}:${athleteId}:${consentStatus}`,
    });
  } catch (error) {
    console.error(`[media_requests_notifications] ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Un athlete ne voit et ne repond que pour les demandes ou son propre athleteId est cible.
const getScopedAthleteId = (access: MediaRequestAccessContext): string | null =>
  access.role === "athlete" ? normalizeOptionalText(access.athleteId) : null;

type SubjectContext = {
  id: string;
  availableRequestTypes: MediaRequestType[];
  athleteIds: string[];
};

const loadWorkspaceAthleteIds = async (workspaceId: string, athleteIds: string[]): Promise<string[]> => {
  if (athleteIds.length === 0) return [];

  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT scoped.athlete_id
    FROM (
      SELECT athlete_id
      FROM user_access
      WHERE workspace_id = ${workspaceId}
        AND role = 'athlete'
        AND athlete_id = ANY(${athleteIds}::text[])
      UNION
      SELECT athlete_id
      FROM athlete_invitations
      WHERE workspace_id = ${workspaceId}
        AND status IN ('invited', 'accepted')
        AND athlete_id = ANY(${athleteIds}::text[])
    ) scoped
  `;

  return normalizeAthleteIds(rows.map((row) => (row as Record<string, unknown>).athlete_id));
};

// Seul un sujet publie du meme workspace peut recevoir une demande.
const loadPublishedSubject = async (workspaceId: string, subjectId: string): Promise<SubjectContext | null> => {
  const sql = getSql();
  const rows = await sql`
    SELECT
      s.id,
      s.available_request_types,
      COALESCE(
        (SELECT array_agg(a.athlete_id ORDER BY a.athlete_id)
         FROM media_subject_athletes a
         WHERE a.subject_id = s.id AND a.workspace_id = s.workspace_id),
        ARRAY[]::TEXT[]
      ) AS athlete_ids
    FROM media_subjects s
    WHERE s.id = ${subjectId}
      AND s.workspace_id = ${workspaceId}
      AND s.status = 'published'
    LIMIT 1
  `;

  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const availableRequestTypes = Array.isArray(row.available_request_types)
    ? row.available_request_types
        .map((entry) => normalizeMediaRequestType(entry))
        .filter((entry): entry is MediaRequestType => entry !== null)
    : [];

  return {
    id: String(row.id ?? ""),
    availableRequestTypes,
    athleteIds: normalizeAthleteIds(row.athlete_ids),
  };
};

export const listMediaRequests = async (access: MediaRequestAccessContext): Promise<MediaRequestRecord[]> => {
  const scopedMediaId = access.role === "media" ? requireMedia(access) : null;
  await ensureMediaRequestTables();
  const sql = getSql();
  const scopedAthleteId = getScopedAthleteId(access);

  const rows = await sql`
    SELECT
      r.id, r.workspace_id, r.origin, r.subject_id,
      COALESCE(r.title, s.title) AS title,
      r.requested_by_clerk_user_id, r.requester_email,
      r.media_id, r.request_type, r.message, r.deadline, r.status, r.admin_note,
      r.created_at, r.updated_at,
      s.title AS subject_title,
      COALESCE(
        (SELECT json_agg(json_build_object(
            'athlete_id', ra.athlete_id,
            'consent_status', ra.consent_status,
            'responded_at', ra.responded_at
          ) ORDER BY ra.athlete_id)
         FROM media_request_athletes ra
         WHERE ra.request_id = r.id AND ra.workspace_id = r.workspace_id),
        '[]'::json
      ) AS athletes
    FROM media_requests r
    LEFT JOIN media_subjects s ON s.id = r.subject_id AND s.workspace_id = r.workspace_id
    WHERE r.workspace_id = ${access.workspaceId}
      AND (
        ${access.isAdmin}::boolean
        OR r.media_id = ${scopedMediaId}
        OR EXISTS (
          SELECT 1 FROM media_request_athletes link
          WHERE link.request_id = r.id
            AND link.workspace_id = r.workspace_id
            AND link.athlete_id = ${scopedAthleteId}
        )
      )
    ORDER BY r.created_at DESC, r.id DESC
  `;

  return rows.map((row) => mapRow(row as Record<string, unknown>));
};

export const getMediaRequestById = async (
  access: MediaRequestAccessContext,
  requestId: string,
): Promise<MediaRequestRecord | null> => {
  const scopedMediaId = access.role === "media" ? requireMedia(access) : null;
  await ensureMediaRequestTables();
  const sql = getSql();
  const scopedAthleteId = getScopedAthleteId(access);

  const id = normalizeText(requestId);
  if (!id) return null;

  const rows = await sql`
    SELECT
      r.id, r.workspace_id, r.origin, r.subject_id,
      COALESCE(r.title, s.title) AS title,
      r.requested_by_clerk_user_id, r.requester_email,
      r.media_id, r.request_type, r.message, r.deadline, r.status, r.admin_note,
      r.created_at, r.updated_at,
      s.title AS subject_title,
      COALESCE(
        (SELECT json_agg(json_build_object(
            'athlete_id', ra.athlete_id,
            'consent_status', ra.consent_status,
            'responded_at', ra.responded_at
          ) ORDER BY ra.athlete_id)
         FROM media_request_athletes ra
         WHERE ra.request_id = r.id AND ra.workspace_id = r.workspace_id),
        '[]'::json
      ) AS athletes
    FROM media_requests r
    LEFT JOIN media_subjects s ON s.id = r.subject_id AND s.workspace_id = r.workspace_id
    WHERE r.workspace_id = ${access.workspaceId}
      AND r.id = ${id}
      AND (
        ${access.isAdmin}::boolean
        OR r.media_id = ${scopedMediaId}
        OR EXISTS (
          SELECT 1 FROM media_request_athletes link
          WHERE link.request_id = r.id
            AND link.workspace_id = r.workspace_id
            AND link.athlete_id = ${scopedAthleteId}
        )
      )
    LIMIT 1
  `;

  if (!rows[0]) return null;
  return mapRow(rows[0] as Record<string, unknown>);
};

export const createMediaRequest = async (
  access: MediaRequestAccessContext,
  input: MediaRequestInput,
): Promise<MediaRequestRecord> => {
  const mediaId = requireMedia(access);
  await ensureMediaRequestTables();

  const requesterEmail = normalizeText(access.email);
  if (!requesterEmail) {
    throw new MediaRequestValidationError("L e-mail du compte media est indisponible.");
  }

  const origin = input.origin === undefined || input.origin === null
    ? "klique_proposal"
    : normalizeMediaRequestOrigin(input.origin);
  if (!origin) {
    throw new MediaRequestValidationError("L origine de la demande est invalide.");
  }

  const subjectId = normalizeOptionalText(input.subjectId);
  const title = normalizeOptionalText(input.title);

  if (origin === "klique_proposal" && !subjectId) {
    throw new MediaRequestValidationError("Le sujet est obligatoire.");
  }
  if (origin === "free" && subjectId) {
    throw new MediaRequestValidationError("Une demande libre ne peut pas etre liee a un sujet.");
  }
  if (origin === "free" && !title) {
    throw new MediaRequestValidationError("Le titre est obligatoire pour une demande libre.");
  }

  const requestType = normalizeMediaRequestType(input.requestType);
  if (!requestType) {
    throw new MediaRequestValidationError("Le type de demande est invalide.");
  }

  const message = normalizeText(input.message);
  if (!message) {
    throw new MediaRequestValidationError("Le message est obligatoire.");
  }

  const athleteIds = normalizeAthleteIds(input.athleteIds);

  if (origin === "klique_proposal") {
    const subject = await loadPublishedSubject(access.workspaceId, subjectId!);
    if (!subject) {
      throw new MediaRequestNotFoundError("Sujet introuvable ou non publie.");
    }

    if (!subject.availableRequestTypes.includes(requestType)) {
      throw new MediaRequestValidationError("Ce type de demande n est pas propose par le sujet.");
    }

    const unknownAthlete = athleteIds.find((athleteId) => !subject.athleteIds.includes(athleteId));
    if (unknownAthlete) {
      throw new MediaRequestValidationError("Un athlete cible n est pas associe au sujet.");
    }
  } else {
    const workspaceAthleteIds = await loadWorkspaceAthleteIds(access.workspaceId, athleteIds);
    const unknownAthlete = athleteIds.find((athleteId) => !workspaceAthleteIds.includes(athleteId));
    if (unknownAthlete) {
      throw new MediaRequestValidationError("Un athlete cible n appartient pas au workspace.");
    }
  }

  if (athleteIds.length === 0 && !REQUEST_TYPES_WITHOUT_ATHLETE.includes(requestType)) {
    throw new MediaRequestValidationError("Au moins un athlete est obligatoire pour ce type de demande.");
  }

  const sql = getSql();
  const id = randomUUID();

  await sql`
    INSERT INTO media_requests (
      id, workspace_id, origin, subject_id, title, requested_by_clerk_user_id, requester_email,
      media_id, request_type, message, deadline, status, admin_note
    ) VALUES (
      ${id},
      ${access.workspaceId},
      ${origin},
      ${subjectId},
      ${origin === "free" ? title : null},
      ${access.clerkUserId},
      ${requesterEmail},
      ${mediaId},
      ${requestType},
      ${message},
      ${normalizeMediaRequestDeadline(input.deadline)},
      'submitted',
      NULL
    )
  `;

  for (const athleteId of athleteIds) {
    await sql`
      INSERT INTO media_request_athletes (request_id, athlete_id, workspace_id, consent_status)
      VALUES (${id}, ${athleteId}, ${access.workspaceId}, 'pending')
      ON CONFLICT (request_id, athlete_id) DO NOTHING
    `;
  }

  const created = await getMediaRequestById(access, id);
  if (!created) {
    throw new MediaRequestNotFoundError();
  }
  await notifyAdminsOfMediaRequestCreation(created);
  return created;
};

export const updateMediaRequestStatus = async (
  access: MediaRequestAccessContext,
  requestId: string,
  input: MediaRequestStatusInput,
): Promise<MediaRequestRecord> => {
  requireAdmin(access);
  await ensureMediaRequestTables();

  const id = normalizeText(requestId);
  if (!id) {
    throw new MediaRequestNotFoundError();
  }

  const status = normalizeMediaRequestStatus(input.status);
  if (!status) {
    throw new MediaRequestValidationError("Le statut est invalide.");
  }

  const hasAdminNote = input.adminNote !== undefined;
  const adminNote = hasAdminNote ? normalizeOptionalText(input.adminNote) : null;

  const sql = getSql();
  const rows = await sql`
    WITH previous AS (
      SELECT id, status, requested_by_clerk_user_id
      FROM media_requests
      WHERE id = ${id} AND workspace_id = ${access.workspaceId}
      FOR UPDATE
    )
    UPDATE media_requests AS current
    SET status = ${status},
        admin_note = CASE WHEN ${hasAdminNote}::boolean THEN ${adminNote} ELSE admin_note END,
        updated_at = NOW()
    FROM previous
    WHERE current.id = previous.id
      AND current.workspace_id = ${access.workspaceId}
    RETURNING
      current.id,
      previous.status AS previous_status,
      previous.requested_by_clerk_user_id
  `;

  if (!rows[0]) {
    throw new MediaRequestNotFoundError();
  }

  const updated = await getMediaRequestById(access, id);
  if (!updated) {
    throw new MediaRequestNotFoundError();
  }
  const updateRow = rows[0] as Record<string, unknown>;
  const previousStatus = normalizeMediaRequestStatus(updateRow.previous_status);
  if (previousStatus && previousStatus !== status) {
    await notifyMediaRequestStatusChange(
      access.workspaceId,
      id,
      updateRow.requested_by_clerk_user_id,
      status,
    );
    if (status === "awaiting_athlete") {
      await notifyMediaRequestAthletesForConsent(updated);
    }
  }
  return updated;
};

export const updateMediaRequestAthleteConsent = async (
  access: MediaRequestAccessContext,
  requestId: string,
  consent: unknown,
): Promise<MediaRequestRecord> => {
  const athleteId = getScopedAthleteId(access);
  if (!athleteId) {
    throw new MediaRequestForbiddenError();
  }

  await ensureMediaRequestTables();

  const id = normalizeText(requestId);
  if (!id) {
    throw new MediaRequestNotFoundError();
  }

  const consentStatus = normalizeText(consent).toLowerCase();
  if (consentStatus !== "approved" && consentStatus !== "declined") {
    throw new MediaRequestValidationError("Le consentement doit etre approved ou declined.");
  }

  const sql = getSql();
  const rows = await sql`
    SELECT r.status
    FROM media_request_athletes link
    JOIN media_requests r ON r.id = link.request_id AND r.workspace_id = link.workspace_id
    WHERE link.request_id = ${id}
      AND link.workspace_id = ${access.workspaceId}
      AND link.athlete_id = ${athleteId}
    LIMIT 1
  `;

  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new MediaRequestNotFoundError();
  }
  if (normalizeMediaRequestStatus(row.status) !== "awaiting_athlete") {
    throw new MediaRequestForbiddenError("Cette demande n attend pas de reponse de l athlete.");
  }

  const updatedRows = await sql`
    UPDATE media_request_athletes
    SET consent_status = ${consentStatus},
        responded_at = NOW()
    WHERE request_id = ${id}
      AND workspace_id = ${access.workspaceId}
      AND athlete_id = ${athleteId}
    RETURNING request_id
  `;

  if (!updatedRows[0]) {
    throw new MediaRequestNotFoundError();
  }

  const updated = await getMediaRequestById(access, id);
  if (!updated) {
    throw new MediaRequestNotFoundError();
  }
  await notifyAdminsOfMediaRequestAthleteResponse(
    access.workspaceId,
    id,
    athleteId,
    consentStatus,
  );
  return updated;
};
