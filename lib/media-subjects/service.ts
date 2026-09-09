import { randomUUID } from "crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

export type MediaSubjectStatus = "draft" | "published" | "archived";

export type MediaRequestType = "interview" | "reaction" | "reportage" | "images" | "podcast";

export const MEDIA_REQUEST_TYPES: readonly MediaRequestType[] = Object.freeze([
  "interview",
  "reaction",
  "reportage",
  "images",
  "podcast",
]);

export type MediaSubjectAthlete = {
  id: string;
  name: string;
};

export type MediaSubjectRecord = {
  id: string;
  workspaceId: string;
  title: string;
  summary: string;
  angle: string;
  sport: string | null;
  location: string | null;
  date: string | null;
  coverImageUrl: string | null;
  availableRequestTypes: MediaRequestType[];
  athleteIds: string[];
  athletes: MediaSubjectAthlete[];
  status: MediaSubjectStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaSubjectInput = {
  title: string;
  summary: string;
  angle: string;
  sport?: string | null;
  location?: string | null;
  date?: unknown;
  coverImageUrl?: unknown;
  availableRequestTypes?: unknown;
  athleteIds?: unknown;
  status?: unknown;
};

export class MediaSubjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaSubjectValidationError";
  }
}

const getSql = () => createContentStorageClient();

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | null => normalizeText(value) || null;

export const normalizeMediaSubjectStatus = (value: unknown): MediaSubjectStatus => {
  if (value === "published" || value === "archived" || value === "draft") {
    return value;
  }
  return "draft";
};

// Seule une URL https est acceptee comme visuel : tout le reste devient NULL.
export const normalizeMediaSubjectCoverUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

// Une date de sujet est une date civile : jamais une date locale ni un horodatage.
export const normalizeMediaSubjectDate = (value: unknown): string | null => {
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

export const normalizeMediaRequestTypes = (value: unknown): MediaRequestType[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<MediaRequestType>();
  for (const entry of value) {
    const normalized = normalizeText(entry).toLowerCase();
    if (MEDIA_REQUEST_TYPES.includes(normalized as MediaRequestType)) {
      unique.add(normalized as MediaRequestType);
    }
  }
  return MEDIA_REQUEST_TYPES.filter((type) => unique.has(type));
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

const ensureMediaSubjectTables = async () => {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS media_subjects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      angle TEXT NOT NULL,
      sport TEXT NULL,
      location TEXT NULL,
      subject_date DATE NULL,
      cover_image_url TEXT NULL,
      available_request_types TEXT[] NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
      published_at TIMESTAMPTZ NULL,
      created_by_clerk_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_subjects_workspace_status_idx
      ON media_subjects (workspace_id, status, published_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS media_subject_athletes (
      subject_id TEXT NOT NULL REFERENCES media_subjects (id) ON DELETE CASCADE,
      athlete_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (subject_id, athlete_id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS media_subject_athletes_workspace_athlete_idx
      ON media_subject_athletes (workspace_id, athlete_id)
  `;
};

const mapRow = (row: Record<string, unknown>): MediaSubjectRecord => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  title: String(row.title ?? ""),
  summary: String(row.summary ?? ""),
  angle: String(row.angle ?? ""),
  sport: normalizeOptionalText(row.sport),
  location: normalizeOptionalText(row.location),
  date: normalizeMediaSubjectDate(row.subject_date),
  coverImageUrl: normalizeMediaSubjectCoverUrl(row.cover_image_url),
  availableRequestTypes: normalizeMediaRequestTypes(row.available_request_types),
  athleteIds: normalizeAthleteIds(row.athlete_ids),
  athletes: [],
  status: normalizeMediaSubjectStatus(row.status),
  publishedAt: row.published_at ? String(row.published_at) : null,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const requireAdmin = (access: ContentAccessContext) => {
  if (!access.isAdmin) {
    throw new Error("Forbidden");
  }
};

// Seuls les athletes rattaches aux sujets deja filtres sont resolus : aucun annuaire n est expose.
const attachAthleteNames = async (subjects: MediaSubjectRecord[]): Promise<MediaSubjectRecord[]> => {
  const requiredIds = new Set(subjects.flatMap((subject) => subject.athleteIds));
  if (requiredIds.size === 0) {
    return subjects;
  }

  const nameById = new Map<string, string>();
  try {
    const athletes = await getAthletesFromGoogleSheets();
    for (const athlete of athletes) {
      const key = normalizeText(athlete.key);
      if (!key || !requiredIds.has(key)) continue;
      const name = normalizeText(athlete.name);
      if (name) nameById.set(key, name);
    }
  } catch (error) {
    console.error(`[media_subjects] Athlete names unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  return subjects.map((subject) => ({
    ...subject,
    athletes: subject.athleteIds.map((athleteId) => ({ id: athleteId, name: nameById.get(athleteId) ?? athleteId })),
  }));
};

type ValidatedInput = {
  title: string;
  summary: string;
  angle: string;
  sport: string | null;
  location: string | null;
  date: string | null;
  coverImageUrl: string | null;
  availableRequestTypes: MediaRequestType[];
  athleteIds: string[];
  status: MediaSubjectStatus;
};

export const validateMediaSubjectInput = (input: MediaSubjectInput): ValidatedInput => {
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const angle = normalizeText(input.angle);

  if (!title) throw new MediaSubjectValidationError("Le titre est obligatoire.");
  if (!summary) throw new MediaSubjectValidationError("Le resume est obligatoire.");
  if (!angle) throw new MediaSubjectValidationError("L angle est obligatoire.");

  const availableRequestTypes = normalizeMediaRequestTypes(input.availableRequestTypes);
  if (availableRequestTypes.length === 0) {
    throw new MediaSubjectValidationError("Au moins un type de demande media est obligatoire.");
  }

  return {
    title,
    summary,
    angle,
    sport: normalizeOptionalText(input.sport),
    location: normalizeOptionalText(input.location),
    date: normalizeMediaSubjectDate(input.date),
    coverImageUrl: normalizeMediaSubjectCoverUrl(input.coverImageUrl),
    availableRequestTypes,
    athleteIds: normalizeAthleteIds(input.athleteIds),
    status: normalizeMediaSubjectStatus(input.status),
  };
};

const replaceSubjectAthletes = async (subjectId: string, workspaceId: string, athleteIds: string[]) => {
  const sql = getSql();
  await sql`DELETE FROM media_subject_athletes WHERE subject_id = ${subjectId} AND workspace_id = ${workspaceId}`;

  for (const athleteId of athleteIds) {
    await sql`
      INSERT INTO media_subject_athletes (subject_id, athlete_id, workspace_id)
      VALUES (${subjectId}, ${athleteId}, ${workspaceId})
      ON CONFLICT (subject_id, athlete_id) DO NOTHING
    `;
  }
};

export const listMediaSubjects = async (access: ContentAccessContext): Promise<MediaSubjectRecord[]> => {
  await ensureMediaSubjectTables();
  const sql = getSql();

  const rows = await sql`
    SELECT
      s.id, s.workspace_id, s.title, s.summary, s.angle, s.sport, s.location,
      s.subject_date, s.cover_image_url, s.available_request_types, s.status,
      s.published_at, s.created_at, s.updated_at,
      COALESCE(
        (SELECT array_agg(a.athlete_id ORDER BY a.athlete_id)
         FROM media_subject_athletes a
         WHERE a.subject_id = s.id AND a.workspace_id = s.workspace_id),
        ARRAY[]::TEXT[]
      ) AS athlete_ids
    FROM media_subjects s
    WHERE s.workspace_id = ${access.workspaceId}
      AND (${access.isAdmin}::boolean OR s.status = 'published')
    ORDER BY COALESCE(s.published_at, s.created_at) DESC, s.id DESC
  `;

  return attachAthleteNames(rows.map((row) => mapRow(row as Record<string, unknown>)));
};

export const getMediaSubjectById = async (
  access: ContentAccessContext,
  subjectId: string,
): Promise<MediaSubjectRecord | null> => {
  await ensureMediaSubjectTables();
  const sql = getSql();

  const rows = await sql`
    SELECT
      s.id, s.workspace_id, s.title, s.summary, s.angle, s.sport, s.location,
      s.subject_date, s.cover_image_url, s.available_request_types, s.status,
      s.published_at, s.created_at, s.updated_at,
      COALESCE(
        (SELECT array_agg(a.athlete_id ORDER BY a.athlete_id)
         FROM media_subject_athletes a
         WHERE a.subject_id = s.id AND a.workspace_id = s.workspace_id),
        ARRAY[]::TEXT[]
      ) AS athlete_ids
    FROM media_subjects s
    WHERE s.workspace_id = ${access.workspaceId}
      AND s.id = ${normalizeText(subjectId)}
      AND (${access.isAdmin}::boolean OR s.status = 'published')
    LIMIT 1
  `;

  if (!rows[0]) return null;

  const [subject] = await attachAthleteNames([mapRow(rows[0] as Record<string, unknown>)]);
  return subject;
};

export const createMediaSubject = async (
  access: ContentAccessContext,
  input: MediaSubjectInput,
): Promise<MediaSubjectRecord> => {
  requireAdmin(access);
  await ensureMediaSubjectTables();

  const validated = validateMediaSubjectInput(input);
  const sql = getSql();
  const id = randomUUID();
  const publishedAt = validated.status === "published" ? new Date().toISOString() : null;

  await sql`
    INSERT INTO media_subjects (
      id, workspace_id, title, summary, angle, sport, location, subject_date,
      cover_image_url, available_request_types, status, published_at, created_by_clerk_user_id
    ) VALUES (
      ${id},
      ${access.workspaceId},
      ${validated.title},
      ${validated.summary},
      ${validated.angle},
      ${validated.sport},
      ${validated.location},
      ${validated.date},
      ${validated.coverImageUrl},
      ${validated.availableRequestTypes},
      ${validated.status},
      ${publishedAt},
      ${access.clerkUserId}
    )
  `;

  await replaceSubjectAthletes(id, access.workspaceId, validated.athleteIds);

  const created = await getMediaSubjectById(access, id);
  if (!created) {
    throw new Error("NotFound");
  }
  return created;
};

export const updateMediaSubject = async (
  access: ContentAccessContext,
  subjectId: string,
  input: MediaSubjectInput,
): Promise<MediaSubjectRecord> => {
  requireAdmin(access);
  await ensureMediaSubjectTables();

  const id = normalizeText(subjectId);
  if (!id) {
    throw new Error("NotFound");
  }

  const validated = validateMediaSubjectInput(input);
  const sql = getSql();

  // La date de publication n est posee qu au premier passage en published et retiree hors de cet etat.
  const rows = await sql`
    UPDATE media_subjects
    SET title = ${validated.title},
        summary = ${validated.summary},
        angle = ${validated.angle},
        sport = ${validated.sport},
        location = ${validated.location},
        subject_date = ${validated.date},
        cover_image_url = ${validated.coverImageUrl},
        available_request_types = ${validated.availableRequestTypes},
        status = ${validated.status},
        published_at = CASE
          WHEN ${validated.status} = 'published' THEN COALESCE(published_at, NOW())
          ELSE NULL
        END,
        updated_at = NOW()
    WHERE id = ${id} AND workspace_id = ${access.workspaceId}
    RETURNING id
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }

  await replaceSubjectAthletes(id, access.workspaceId, validated.athleteIds);

  const updated = await getMediaSubjectById(access, id);
  if (!updated) {
    throw new Error("NotFound");
  }
  return updated;
};

export const deleteMediaSubject = async (access: ContentAccessContext, subjectId: string): Promise<void> => {
  requireAdmin(access);
  await ensureMediaSubjectTables();

  const sql = getSql();
  const rows = await sql`
    DELETE FROM media_subjects
    WHERE id = ${normalizeText(subjectId)} AND workspace_id = ${access.workspaceId}
    RETURNING id
  `;

  if (!rows[0]) {
    throw new Error("NotFound");
  }
};
