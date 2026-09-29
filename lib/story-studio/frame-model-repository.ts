import { randomUUID } from "node:crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { validateStoryStudioFrameModelInput } from "@/lib/story-studio/frame-model-validation";
import type {
  StoryStudioFrameModel,
  StoryStudioFrameModelContent,
  StoryStudioFrameModelInput,
} from "@/types/story-studio-frame-model";

type FrameModelRow = {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  name: string;
  brand_kit_id: string | null;
  content_json: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

const columns = `
  id, workspace_id, created_by_user_id, name, brand_kit_id,
  content_json, created_at, updated_at
`;

const normalizeTimestamp = (value: string | Date, field: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Date Neon invalide pour ${field}.`);
  return date.toISOString();
};

const mapRow = (row: FrameModelRow): StoryStudioFrameModel => {
  const validated = validateStoryStudioFrameModelInput({ name: row.name, content: row.content_json });
  if (validated.content.brandKitId !== row.brand_kit_id) {
    throw new Error("Brand Kit incoherent dans le modele Story Studio.");
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    ...validated,
    createdAt: normalizeTimestamp(row.created_at, "story_studio_frame_models.created_at"),
    updatedAt: normalizeTimestamp(row.updated_at, "story_studio_frame_models.updated_at"),
  };
};

export class StoryStudioFrameModelBrandKitError extends Error {
  constructor() {
    super("Le Brand Kit du modele n'appartient pas a ce workspace.");
    this.name = "StoryStudioFrameModelBrandKitError";
  }
}

const validateBrandKit = async (content: StoryStudioFrameModelContent, access: ContentAccessContext) => {
  if (!content.brandKitId) return;
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    SELECT id
    FROM story_studio_brand_kits
    WHERE workspace_id = $1 AND id = $2::uuid
    LIMIT 1
  `, [access.workspaceId, content.brandKitId]);
  if (!rows[0]) throw new StoryStudioFrameModelBrandKitError();

  const logoIds = [...new Set([
    content.brandKitSnapshot?.lightLogoPhotoId,
    content.brandKitSnapshot?.darkLogoPhotoId,
  ].filter((id): id is string => Boolean(id)))];
  if (logoIds.length === 0) return;
  const logoRows = await sql.query(`
    SELECT id
    FROM story_studio_photos
    WHERE workspace_id = $1 AND id = ANY($2::uuid[])
  `, [access.workspaceId, logoIds]);
  if (logoRows.length !== logoIds.length) throw new StoryStudioFrameModelBrandKitError();
};

export const StoryStudioFrameModelRepository = {
  async list(access: ContentAccessContext): Promise<StoryStudioFrameModel[]> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${columns}
      FROM story_studio_frame_models
      WHERE workspace_id = $1
      ORDER BY lower(name), created_at
    `, [access.workspaceId]) as FrameModelRow[];
    return rows.map(mapRow);
  },

  async create(input: StoryStudioFrameModelInput, access: ContentAccessContext): Promise<StoryStudioFrameModel> {
    const validated = validateStoryStudioFrameModelInput(input);
    await validateBrandKit(validated.content, access);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      INSERT INTO story_studio_frame_models (
        id, workspace_id, created_by_user_id, name, brand_kit_id, content_json
      ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::jsonb)
      RETURNING ${columns}
    `, [
      randomUUID(), access.workspaceId, access.clerkUserId, validated.name,
      validated.content.brandKitId, JSON.stringify(validated.content),
    ]) as FrameModelRow[];
    if (!rows[0]) throw new Error("Le modele Story Studio n'a pas ete cree.");
    return mapRow(rows[0]);
  },
};