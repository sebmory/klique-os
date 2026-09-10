import { randomUUID } from "crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type MediaDayStatus = "draft" | "open" | "completed" | "cancelled";

export const MEDIA_DAY_STATUSES: readonly MediaDayStatus[] = Object.freeze([
  "draft",
  "open",
  "completed",
  "cancelled",
]);

export type MediaDayAthleteStatus = "invited" | "confirmed" | "declined" | "completed";

export const MEDIA_DAY_ATHLETE_STATUSES: readonly MediaDayAthleteStatus[] = Object.freeze([
  "invited",
  "confirmed",
  "declined",
  "completed",
]);

export type MediaDayAthlete = {
  athleteId: string;
  status: MediaDayAthleteStatus;
  slotStart: string | null;
  slotEnd: string | null;
  respondedAt: string | null;
  adminNote: string | null;
};

export type MediaDayRecord = {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  capacity: number | null;
  status: MediaDayStatus;
  athleteIds: string[];
  athletes: MediaDayAthlete[];
  createdAt: string;
  updatedAt: string;
};

export type MediaDayAthleteInput = {
  athleteId?: unknown;
  slotStart?: unknown;
  slotEnd?: unknown;
  adminNote?: unknown;
};

export type MediaDayInput = {
  title?: unknown;
  description?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  location?: unknown;
  capacity?: unknown;
  status?: unknown;
  athletes?: unknown;
};

// L identite et l athleteId proviennent uniquement de la session Clerk.
export type MediaDayAccessContext = Omit<ContentAccessContext, "role"> & {
  role: ContentAccessContext["role"] | "athlete";
  athleteId?: string | null;
};

export class MediaDayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaDayValidationError";
  }
}

export class MediaDayForbiddenError extends Error {
  constructor(message = "Acces refuse.") {
    super(message);
    this.name = "MediaDayForbiddenError";
  }
}

export class MediaDayNotFoundError extends Error {
  constructor(message = "Journee media introuvable.") {
    super(message);
    this.name = "MediaDayNotFoundError";
  }
}

const getSql = () => createContentStorageClient();

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | null => normalizeText(value) || null;

export const normalizeMediaDayStatus = (value: unknown): MediaDayStatus | null => {
  const normalized = normalizeText(value).toLowerCase();
  return MEDIA_DAY_STATUSES.includes(normalized as MediaDayStatus) ? (normalized as MediaDayStatus) : null;
};

const normalizeAthleteStatus = (value: unknown): MediaDayAthleteStatus => {
  const normalized = normalizeText(value).toLowerCase();
  return MEDIA_DAY_ATHLETE_STATUSES.includes(normalized as MediaDayAthleteStatus)
    ? (normalized as MediaDayAthleteStatus)
    : "invited";
};

// Une date de journee est une date civile : jamais une date locale ni un horodatage.
export const normalizeMediaDayDate = (value: unknown): string | null => {
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

export const normalizeMediaDayTime = (value: unknown): string | null => {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
};

const normalizeCapacity = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
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

const ensureMediaDayTables = async () => {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS media_days (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      day_date DATE NOT NULL,
      start_time TIME NULL,
      end_time TIME NULL,
      location TEXT NULL,
      capacity INTEGER NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'completed', 'cancelled')),
      created_by_clerk_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_days_workspace_status_idx
      ON media_days (workspace_id, status, day_date DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_days_workspace_date_idx
      ON media_days (workspace_id, day_date DESC, id DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS media_day_athletes (
      media_day_id TEXT NOT NULL REFERENCES media_days (id) ON DELETE CASCADE,
      athlete_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited' CHECK (
        status IN ('invited', 'confirmed', 'declined', 'completed')
      ),
      slot_start TIME NULL,
      slot_end TIME NULL,
      responded_at TIMESTAMPTZ NULL,
      admin_note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (media_day_id, athlete_id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_day_athletes_workspace_athlete_idx
      ON media_day_athletes (workspace_id, athlete_id, status)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_day_athletes_workspace_day_idx
      ON media_day_athletes (workspace_id, media_day_id, status)
  `;
};

const mapAthletes = (value: unknown): MediaDayAthlete[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const athleteId = normalizeText(row.athlete_id);
      if (!athleteId) return null;
      return {
        athleteId,
        status: normalizeAthleteStatus(row.status),
        slotStart: normalizeMediaDayTime(row.slot_start),
        slotEnd: normalizeMediaDayTime(row.slot_end),
        respondedAt: normalizeTimestamp(row.responded_at),
        adminNote: normalizeOptionalText(row.admin_note),
      } satisfies MediaDayAthlete;
    })
    .filter((entry): entry is MediaDayAthlete => entry !== null)
    .sort((a, b) => a.athleteId.localeCompare(b.athleteId));
};

const mapRow = (row: Record<string, unknown>): MediaDayRecord => {
  const athletes = mapAthletes(row.athletes);

  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    date: normalizeMediaDayDate(row.day_date),
    startTime: normalizeMediaDayTime(row.start_time),
    endTime: normalizeMediaDayTime(row.end_time),
    location: normalizeOptionalText(row.location),
    capacity: normalizeCapacity(row.capacity),
    status: normalizeMediaDayStatus(row.status) ?? "draft",
    athleteIds: athletes.map((athlete) => athlete.athleteId),
    athletes,
    createdAt: normalizeTimestamp(row.created_at) ?? "",
    updatedAt: normalizeTimestamp(row.updated_at) ?? "",
  };
};

const requireAdmin = (access: MediaDayAccessContext) => {
  if (!access.isAdmin) {
    throw new MediaDayForbiddenError();
  }
};

// Un athlete ne voit que les journees publiees ou son propre athleteId est invite.
const getScopedAthleteId = (access: MediaDayAccessContext): string | null =>
  access.role === "athlete" ? normalizeOptionalText(access.athleteId) : null;

type ValidatedAthlete = {
  athleteId: string;
  slotStart: string | null;
  slotEnd: string | null;
  adminNote: string | null;
};

type ValidatedInput = {
  title: string;
  description: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  capacity: number | null;
  status: MediaDayStatus;
  athletes: ValidatedAthlete[];
};

const validateAthletes = (value: unknown): ValidatedAthlete[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new MediaDayValidationError("La liste des athletes est invalide.");
  }

  const byAthleteId = new Map<string, ValidatedAthlete>();

  for (const entry of value) {
    const source = (typeof entry === "string" ? { athleteId: entry } : (entry ?? {})) as MediaDayAthleteInput;
    const athleteId = normalizeText(source.athleteId);
    if (!athleteId) {
      throw new MediaDayValidationError("Chaque athlete doit avoir un identifiant.");
    }

    const slotStart = normalizeMediaDayTime(source.slotStart);
    const slotEnd = normalizeMediaDayTime(source.slotEnd);
    if (slotStart && slotEnd && slotEnd <= slotStart) {
      throw new MediaDayValidationError("La fin du creneau doit suivre son debut.");
    }

    byAthleteId.set(athleteId, {
      athleteId,
      slotStart,
      slotEnd,
      adminNote: normalizeOptionalText(source.adminNote),
    });
  }

  return [...byAthleteId.values()];
};

export const validateMediaDayInput = (input: MediaDayInput): ValidatedInput => {
  const title = normalizeText(input.title);
  const description = normalizeText(input.description);

  if (!title) throw new MediaDayValidationError("Le titre est obligatoire.");
  if (!description) throw new MediaDayValidationError("La description est obligatoire.");

  const date = normalizeMediaDayDate(input.date);
  if (!date) throw new MediaDayValidationError("La date est obligatoire.");

  const startTime = normalizeMediaDayTime(input.startTime);
  const endTime = normalizeMediaDayTime(input.endTime);
  if (startTime && endTime && endTime <= startTime) {
    throw new MediaDayValidationError("L heure de fin doit suivre l heure de debut.");
  }

  const hasCapacity = input.capacity !== undefined && input.capacity !== null && input.capacity !== "";
  const capacity = normalizeCapacity(input.capacity);
  if (hasCapacity && capacity === null) {
    throw new MediaDayValidationError("La capacite doit etre un entier positif.");
  }

  const status = normalizeMediaDayStatus(input.status) ?? "draft";

  return {
    title,
    description,
    date,
    startTime,
    endTime,
    location: normalizeOptionalText(input.location),
    capacity,
    status,
    athletes: validateAthletes(input.athletes),
  };
};

const selectMediaDays = async (
  access: MediaDayAccessContext,
  mediaDayId: string | null,
): Promise<Array<Record<string, unknown>>> => {
  const sql = getSql();
  const scopedAthleteId = getScopedAthleteId(access);

  return (await sql`
    SELECT
      d.id, d.workspace_id, d.title, d.description, d.day_date, d.start_time, d.end_time,
      d.location, d.capacity, d.status, d.created_at, d.updated_at,
      COALESCE(
        (SELECT json_agg(json_build_object(
            'athlete_id', a.athlete_id,
            'status', a.status,
            'slot_start', a.slot_start,
            'slot_end', a.slot_end,
            'responded_at', a.responded_at,
            'admin_note', a.admin_note
          ) ORDER BY a.athlete_id)
         FROM media_day_athletes a
         WHERE a.media_day_id = d.id AND a.workspace_id = d.workspace_id),
        '[]'::json
      ) AS athletes
    FROM media_days d
    WHERE d.workspace_id = ${access.workspaceId}
      AND (${mediaDayId}::text IS NULL OR d.id = ${mediaDayId})
      AND (
        ${access.isAdmin}::boolean
        OR (
          d.status <> 'draft'
          AND EXISTS (
            SELECT 1 FROM media_day_athletes link
            WHERE link.media_day_id = d.id
              AND link.workspace_id = d.workspace_id
              AND link.athlete_id = ${scopedAthleteId}
          )
        )
      )
    ORDER BY d.day_date DESC, d.id DESC
  `) as Array<Record<string, unknown>>;
};

export const listMediaDays = async (access: MediaDayAccessContext): Promise<MediaDayRecord[]> => {
  await ensureMediaDayTables();
  const rows = await selectMediaDays(access, null);
  return rows.map((row) => mapRow(row));
};

export const getMediaDayById = async (
  access: MediaDayAccessContext,
  mediaDayId: string,
): Promise<MediaDayRecord | null> => {
  await ensureMediaDayTables();

  const id = normalizeText(mediaDayId);
  if (!id) return null;

  const rows = await selectMediaDays(access, id);
  return rows[0] ? mapRow(rows[0]) : null;
};

// Les reponses deja donnees sont conservees : seuls les creneaux et notes sont reecrits.
const syncMediaDayAthletes = async (
  mediaDayId: string,
  workspaceId: string,
  athletes: ValidatedAthlete[],
) => {
  const sql = getSql();
  const athleteIds = athletes.map((athlete) => athlete.athleteId);

  await sql`
    DELETE FROM media_day_athletes
    WHERE media_day_id = ${mediaDayId}
      AND workspace_id = ${workspaceId}
      AND NOT (athlete_id = ANY(${athleteIds}::text[]))
  `;

  for (const athlete of athletes) {
    await sql`
      INSERT INTO media_day_athletes (
        media_day_id, athlete_id, workspace_id, status, slot_start, slot_end, admin_note
      ) VALUES (
        ${mediaDayId},
        ${athlete.athleteId},
        ${workspaceId},
        'invited',
        ${athlete.slotStart},
        ${athlete.slotEnd},
        ${athlete.adminNote}
      )
      ON CONFLICT (media_day_id, athlete_id) DO UPDATE
      SET slot_start = EXCLUDED.slot_start,
          slot_end = EXCLUDED.slot_end,
          admin_note = EXCLUDED.admin_note,
          updated_at = NOW()
    `;
  }
};

export const createMediaDay = async (
  access: MediaDayAccessContext,
  input: MediaDayInput,
): Promise<MediaDayRecord> => {
  requireAdmin(access);
  await ensureMediaDayTables();

  const validated = validateMediaDayInput(input);
  const sql = getSql();
  const id = randomUUID();

  await sql`
    INSERT INTO media_days (
      id, workspace_id, title, description, day_date, start_time, end_time,
      location, capacity, status, created_by_clerk_user_id
    ) VALUES (
      ${id},
      ${access.workspaceId},
      ${validated.title},
      ${validated.description},
      ${validated.date},
      ${validated.startTime},
      ${validated.endTime},
      ${validated.location},
      ${validated.capacity},
      ${validated.status},
      ${access.clerkUserId}
    )
  `;

  await syncMediaDayAthletes(id, access.workspaceId, validated.athletes);

  const created = await getMediaDayById(access, id);
  if (!created) {
    throw new MediaDayNotFoundError();
  }
  return created;
};

export const updateMediaDay = async (
  access: MediaDayAccessContext,
  mediaDayId: string,
  input: MediaDayInput,
): Promise<MediaDayRecord> => {
  requireAdmin(access);
  await ensureMediaDayTables();

  const id = normalizeText(mediaDayId);
  if (!id) {
    throw new MediaDayNotFoundError();
  }

  const validated = validateMediaDayInput(input);
  const sql = getSql();

  const rows = await sql`
    UPDATE media_days
    SET title = ${validated.title},
        description = ${validated.description},
        day_date = ${validated.date},
        start_time = ${validated.startTime},
        end_time = ${validated.endTime},
        location = ${validated.location},
        capacity = ${validated.capacity},
        status = ${validated.status},
        updated_at = NOW()
    WHERE id = ${id} AND workspace_id = ${access.workspaceId}
    RETURNING id
  `;

  if (!rows[0]) {
    throw new MediaDayNotFoundError();
  }

  await syncMediaDayAthletes(id, access.workspaceId, validated.athletes);

  const updated = await getMediaDayById(access, id);
  if (!updated) {
    throw new MediaDayNotFoundError();
  }
  return updated;
};

export const deleteMediaDay = async (access: MediaDayAccessContext, mediaDayId: string): Promise<void> => {
  requireAdmin(access);
  await ensureMediaDayTables();

  const sql = getSql();
  const rows = await sql`
    DELETE FROM media_days
    WHERE id = ${normalizeText(mediaDayId)} AND workspace_id = ${access.workspaceId}
    RETURNING id
  `;

  if (!rows[0]) {
    throw new MediaDayNotFoundError();
  }
};

export const respondToMediaDay = async (
  access: MediaDayAccessContext,
  mediaDayId: string,
  response: unknown,
): Promise<MediaDayRecord> => {
  const athleteId = getScopedAthleteId(access);
  if (!athleteId) {
    throw new MediaDayForbiddenError();
  }

  await ensureMediaDayTables();

  const id = normalizeText(mediaDayId);
  if (!id) {
    throw new MediaDayNotFoundError();
  }

  const status = normalizeText(response).toLowerCase();
  if (status !== "confirmed" && status !== "declined") {
    throw new MediaDayValidationError("La reponse doit etre confirmed ou declined.");
  }

  const sql = getSql();
  const rows = await sql`
    SELECT d.status AS day_status, link.status AS athlete_status
    FROM media_day_athletes link
    JOIN media_days d ON d.id = link.media_day_id AND d.workspace_id = link.workspace_id
    WHERE link.media_day_id = ${id}
      AND link.workspace_id = ${access.workspaceId}
      AND link.athlete_id = ${athleteId}
    LIMIT 1
  `;

  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new MediaDayNotFoundError();
  }
  if (normalizeMediaDayStatus(row.day_status) !== "open") {
    throw new MediaDayForbiddenError("Cette journee media n est pas ouverte aux reponses.");
  }
  if (normalizeAthleteStatus(row.athlete_status) !== "invited") {
    throw new MediaDayForbiddenError("Votre reponse a deja ete enregistree.");
  }

  const updatedRows = await sql`
    UPDATE media_day_athletes
    SET status = ${status},
        responded_at = NOW(),
        updated_at = NOW()
    WHERE media_day_id = ${id}
      AND workspace_id = ${access.workspaceId}
      AND athlete_id = ${athleteId}
      AND status = 'invited'
    RETURNING media_day_id
  `;

  if (!updatedRows[0]) {
    throw new MediaDayNotFoundError();
  }

  const updated = await getMediaDayById(access, id);
  if (!updated) {
    throw new MediaDayNotFoundError();
  }
  return updated;
};
