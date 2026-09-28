import { randomUUID } from "node:crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { validateStoryStudioProjectPayload } from "@/lib/story-studio/validation";
import type {
  CreateOrGetStoryStudioProjectInput,
  StoryStudioProject,
  StoryStudioProjectStatus,
  StoryStudioTemplateKey,
  UpdateStoryStudioProjectInput,
} from "@/types/story-studio";

type StoryStudioProjectRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  media_id: string | null;
  source_pack_id: string;
  source_stories_variant_id: string;
  source_document_id: string;
  athlete_id: string | null;
  project_type: "after_match";
  template_key: StoryStudioTemplateKey;
  status: StoryStudioProjectStatus;
  payload_json: unknown;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
};

const projectColumns = `
  id, workspace_id, user_id, media_id, source_pack_id, source_stories_variant_id,
  source_document_id, athlete_id, project_type, template_key, status, payload_json,
  version, created_at, updated_at
`;

const normalize = (value: unknown): string => String(value ?? "").trim();
const normalizeNullable = (value: unknown): string | null => normalize(value) || null;

const normalizeTimestamp = (value: string | Date, fieldName: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Date Neon invalide pour ${fieldName}.`);
  return date.toISOString();
};

const mapProjectRow = (row: StoryStudioProjectRow): StoryStudioProject => {
  const payload = validateStoryStudioProjectPayload(row.payload_json);
  if (row.template_key !== payload.templateKey) {
    throw new Error("Template Story Studio incoherent entre la colonne et le payload.");
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    mediaId: row.media_id,
    sourcePackId: row.source_pack_id,
    sourceStoriesVariantId: row.source_stories_variant_id,
    sourceDocumentId: row.source_document_id,
    athleteId: row.athlete_id,
    projectType: row.project_type,
    templateKey: row.template_key,
    status: row.status,
    payload,
    version: Number(row.version),
    createdAt: normalizeTimestamp(row.created_at, "story_studio_projects.created_at"),
    updatedAt: normalizeTimestamp(row.updated_at, "story_studio_projects.updated_at"),
  };
};

export type UpdateStoryStudioProjectResult =
  | { status: "not_found" }
  | { status: "version_conflict"; currentVersion: number; current: StoryStudioProject }
  | { status: "updated"; project: StoryStudioProject };

export const StoryStudioProjectRepository = {
  async createOrGet(input: CreateOrGetStoryStudioProjectInput, access: ContentAccessContext): Promise<StoryStudioProject | null> {
    const payload = validateStoryStudioProjectPayload(input.payload);
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      INSERT INTO story_studio_projects (
        id, workspace_id, user_id, media_id, source_pack_id, source_stories_variant_id,
        source_document_id, athlete_id, template_key, payload_json
      ) VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (workspace_id, source_stories_variant_id) DO NOTHING
      RETURNING ${projectColumns}
    `, [
      randomUUID(),
      access.workspaceId,
      access.clerkUserId,
      access.isAdmin ? null : access.mediaId ?? null,
      normalize(input.sourcePackId),
      normalize(input.sourceStoriesVariantId),
      normalize(input.sourceDocumentId),
      normalizeNullable(input.athleteId),
      payload.templateKey,
      JSON.stringify(payload),
    ])) as StoryStudioProjectRow[];

    if (rows[0]) return mapProjectRow(rows[0]);
    return this.getByStoriesVariantId(input.sourceStoriesVariantId, access);
  },

  async getById(projectId: string, access: ContentAccessContext): Promise<StoryStudioProject | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      SELECT ${projectColumns}
      FROM story_studio_projects
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND user_id = $3
        AND ($4::boolean OR media_id = $5::uuid)
      LIMIT 1
    `, [access.workspaceId, normalize(projectId), access.clerkUserId, access.isAdmin, access.mediaId ?? null])) as StoryStudioProjectRow[];
    return rows[0] ? mapProjectRow(rows[0]) : null;
  },

  async getByStoriesVariantId(storiesVariantId: string, access: ContentAccessContext): Promise<StoryStudioProject | null> {
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      SELECT ${projectColumns}
      FROM story_studio_projects
      WHERE workspace_id = $1
        AND source_stories_variant_id = $2
        AND user_id = $3
        AND ($4::boolean OR media_id = $5::uuid)
      LIMIT 1
    `, [access.workspaceId, normalize(storiesVariantId), access.clerkUserId, access.isAdmin, access.mediaId ?? null])) as StoryStudioProjectRow[];
    return rows[0] ? mapProjectRow(rows[0]) : null;
  },

  async update(input: UpdateStoryStudioProjectInput, access: ContentAccessContext): Promise<UpdateStoryStudioProjectResult> {
    const payload = validateStoryStudioProjectPayload(input.payload);
    const sql = createContentStorageClient();
    const rows = (await sql.query(`
      UPDATE story_studio_projects
      SET athlete_id = $1,
          template_key = $2,
          status = $3,
          payload_json = $4::jsonb,
          version = $5 + 1,
          updated_at = NOW()
      WHERE workspace_id = $6
        AND id = $7::uuid
        AND version = $5
        AND user_id = $8
        AND ($9::boolean OR media_id = $10::uuid)
      RETURNING ${projectColumns}
    `, [
      normalizeNullable(input.athleteId),
      payload.templateKey,
      input.status,
      JSON.stringify(payload),
      input.expectedVersion,
      access.workspaceId,
      normalize(input.projectId),
      access.clerkUserId,
      access.isAdmin,
      access.mediaId ?? null,
    ])) as StoryStudioProjectRow[];

    if (rows[0]) return { status: "updated", project: mapProjectRow(rows[0]) };
    const current = await this.getById(input.projectId, access);
    if (!current) return { status: "not_found" };
    return { status: "version_conflict", currentVersion: current.version, current };
  },
};