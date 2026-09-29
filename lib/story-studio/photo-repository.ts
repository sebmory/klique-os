import { randomUUID } from "node:crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type { AllowedVisualContentType } from "@/lib/athlete-visuals/service";
import type { CreateStoryStudioPhotoInput, StoryStudioPhoto } from "@/types/story-studio-photo";

type StoryStudioPhotoRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  media_id: string | null;
  athlete_id: string | null;
  blob_url: string;
  blob_pathname: string;
  content_type: AllowedVisualContentType;
  width_px: number;
  height_px: number;
  size_bytes: number | string;
  created_at: string | Date;
};

const photoColumns = `
  id, workspace_id, user_id, media_id, athlete_id, blob_url, blob_pathname,
  content_type, width_px, height_px, size_bytes, created_at
`;

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeNullable = (value: unknown): string | null => normalize(value) || null;
const allowedStoryStudioBlobPrefixes = ["story-studio/photos/", "story-studio/brand-kit-logos/"] as const;

const isVercelBlobUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
};

const mapPhotoRow = (row: StoryStudioPhotoRow): StoryStudioPhoto => {
  const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  if (Number.isNaN(createdAt.getTime())) throw new Error("Date Neon invalide pour story_studio_photos.created_at.");

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    mediaId: row.media_id,
    athleteId: row.athlete_id,
    blobUrl: row.blob_url,
    blobPathname: row.blob_pathname,
    contentType: row.content_type,
    width: Number(row.width_px),
    height: Number(row.height_px),
    sizeBytes: Number(row.size_bytes),
    createdAt: createdAt.toISOString(),
  };
};

export const StoryStudioPhotoRepository = {
  async create(input: CreateStoryStudioPhotoInput, access: ContentAccessContext): Promise<StoryStudioPhoto> {
    if (
      !allowedStoryStudioBlobPrefixes.some((prefix) => input.blob.pathname.startsWith(prefix))
      || !isVercelBlobUrl(input.blob.url)
    ) {
      throw new Error("Le fichier ne provient pas de l'upload Story Studio.");
    }

    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      INSERT INTO story_studio_photos (
        id, workspace_id, user_id, media_id, athlete_id, blob_url, blob_pathname,
        content_type, width_px, height_px, size_bytes
      ) VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11)
      RETURNING ${photoColumns}
    `, [
      randomUUID(),
      access.workspaceId,
      access.clerkUserId,
      access.isAdmin ? null : access.mediaId ?? null,
      normalizeNullable(input.athleteId),
      input.blob.url,
      input.blob.pathname,
      input.blob.contentType,
      input.blob.width,
      input.blob.height,
      input.blob.sizeBytes,
    ])) as StoryStudioPhotoRow[];

    if (!rows[0]) throw new Error("La photo Story Studio n'a pas ete enregistree.");
    return mapPhotoRow(rows[0]);
  },

  async getById(photoId: string, access: ContentAccessContext): Promise<StoryStudioPhoto | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      SELECT ${photoColumns}
      FROM story_studio_photos
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND user_id = $3
        AND ($4::boolean OR media_id = $5::uuid)
      LIMIT 1
    `, [access.workspaceId, normalize(photoId), access.clerkUserId, access.isAdmin, access.mediaId ?? null])) as StoryStudioPhotoRow[];
    return rows[0] ? mapPhotoRow(rows[0]) : null;
  },

  async list(athleteId: string | null, access: ContentAccessContext): Promise<StoryStudioPhoto[]> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      SELECT ${photoColumns}
      FROM story_studio_photos
      WHERE workspace_id = $1
        AND user_id = $2
        AND ($3::boolean OR media_id = $4::uuid)
        AND ($5::text IS NULL OR athlete_id = $5)
      ORDER BY created_at DESC
    `, [access.workspaceId, access.clerkUserId, access.isAdmin, access.mediaId ?? null, normalizeNullable(athleteId)])) as StoryStudioPhotoRow[];
    return rows.map(mapPhotoRow);
  },
};