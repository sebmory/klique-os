import { randomUUID } from "node:crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  StoryStudioBrandKit,
  StoryStudioBrandKitFont,
  StoryStudioBrandKitInput,
  StoryStudioBrandKitSignatureMode,
  UpdateStoryStudioBrandKitInput,
} from "@/types/story-studio-brand-kit";

type BrandKitRow = {
  id: string;
  workspace_id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  muted_text_color: string;
  light_logo_photo_id: string | null;
  dark_logo_photo_id: string | null;
  light_logo_url?: string | null;
  dark_logo_url?: string | null;
  font_family: StoryStudioBrandKitFont;
  signature_mode: StoryStudioBrandKitSignatureMode;
  is_default: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

const columns = `
  id, workspace_id, name, primary_color, secondary_color, accent_color,
  text_color, muted_text_color, light_logo_photo_id, dark_logo_photo_id,
  font_family, signature_mode, is_default, created_at, updated_at
`;

const selectColumns = `
  brand_kit.id, brand_kit.workspace_id, brand_kit.name, brand_kit.primary_color,
  brand_kit.secondary_color, brand_kit.accent_color, brand_kit.text_color,
  brand_kit.muted_text_color, brand_kit.light_logo_photo_id, brand_kit.dark_logo_photo_id,
  brand_kit.font_family, brand_kit.signature_mode, brand_kit.is_default,
  brand_kit.created_at, brand_kit.updated_at,
  light_logo.blob_url AS light_logo_url,
  dark_logo.blob_url AS dark_logo_url
`;

const defaultKit: StoryStudioBrandKitInput = {
  name: "KLIQUE",
  primaryColor: "#000000",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#FFFFFF",
  mutedTextColor: "#D9D9D9",
  lightLogoPhotoId: null,
  darkLogoPhotoId: null,
  fontFamily: "Georgia",
  signatureMode: "visible",
};

const normalizeTimestamp = (value: string | Date, field: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Date Neon invalide pour ${field}.`);
  return date.toISOString();
};

const mapRow = (row: BrandKitRow): StoryStudioBrandKit => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  primaryColor: row.primary_color,
  secondaryColor: row.secondary_color,
  accentColor: row.accent_color,
  textColor: row.text_color,
  mutedTextColor: row.muted_text_color,
  lightLogoPhotoId: row.light_logo_photo_id,
  darkLogoPhotoId: row.dark_logo_photo_id,
  lightLogoUrl: row.light_logo_url ?? null,
  darkLogoUrl: row.dark_logo_url ?? null,
  fontFamily: row.font_family,
  signatureMode: row.signature_mode,
  isDefault: row.is_default,
  createdAt: normalizeTimestamp(row.created_at, "story_studio_brand_kits.created_at"),
  updatedAt: normalizeTimestamp(row.updated_at, "story_studio_brand_kits.updated_at"),
});

export class StoryStudioBrandKitAssetError extends Error {
  constructor() {
    super("Un logo ne correspond pas a une photo Story Studio de ce workspace.");
    this.name = "StoryStudioBrandKitAssetError";
  }
}

const validateAssets = async (
  input: Pick<StoryStudioBrandKitInput, "lightLogoPhotoId" | "darkLogoPhotoId">,
  access: ContentAccessContext,
) => {
  const ids = [...new Set([input.lightLogoPhotoId, input.darkLogoPhotoId].filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    SELECT id
    FROM story_studio_photos
    WHERE workspace_id = $1
      AND id = ANY($2::uuid[])
  `, [access.workspaceId, ids]);
  if (rows.length !== ids.length) throw new StoryStudioBrandKitAssetError();
};

const ensureDefault = async (access: ContentAccessContext) => {
  const sql = createContentStorageClient();
  await sql.query(`
    INSERT INTO story_studio_brand_kits (
      id, workspace_id, name, primary_color, secondary_color, accent_color,
      text_color, muted_text_color, light_logo_photo_id, dark_logo_photo_id,
      font_family, signature_mode, is_default
    ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, $9, $10, TRUE)
    ON CONFLICT DO NOTHING
  `, [
    randomUUID(), access.workspaceId, defaultKit.name, defaultKit.primaryColor,
    defaultKit.secondaryColor, defaultKit.accentColor, defaultKit.textColor,
    defaultKit.mutedTextColor, defaultKit.fontFamily, defaultKit.signatureMode,
  ]);
};

export type DeleteStoryStudioBrandKitResult = "deleted" | "not_found" | "default_protected";

export const StoryStudioBrandKitRepository = {
  async list(access: ContentAccessContext): Promise<StoryStudioBrandKit[]> {
    await ensureDefault(access);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${selectColumns}
      FROM story_studio_brand_kits brand_kit
      LEFT JOIN story_studio_photos light_logo
        ON light_logo.workspace_id = brand_kit.workspace_id
        AND light_logo.id = brand_kit.light_logo_photo_id
      LEFT JOIN story_studio_photos dark_logo
        ON dark_logo.workspace_id = brand_kit.workspace_id
        AND dark_logo.id = brand_kit.dark_logo_photo_id
      WHERE brand_kit.workspace_id = $1
      ORDER BY brand_kit.is_default DESC, lower(brand_kit.name), brand_kit.created_at
    `, [access.workspaceId]) as BrandKitRow[];
    return rows.map(mapRow);
  },

  async getById(brandKitId: string, access: ContentAccessContext): Promise<StoryStudioBrandKit | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${selectColumns}
      FROM story_studio_brand_kits brand_kit
      LEFT JOIN story_studio_photos light_logo
        ON light_logo.workspace_id = brand_kit.workspace_id
        AND light_logo.id = brand_kit.light_logo_photo_id
      LEFT JOIN story_studio_photos dark_logo
        ON dark_logo.workspace_id = brand_kit.workspace_id
        AND dark_logo.id = brand_kit.dark_logo_photo_id
      WHERE brand_kit.workspace_id = $1 AND brand_kit.id = $2::uuid
      LIMIT 1
    `, [access.workspaceId, brandKitId.trim()]) as BrandKitRow[];
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async create(input: StoryStudioBrandKitInput, access: ContentAccessContext): Promise<StoryStudioBrandKit> {
    await ensureDefault(access);
    await validateAssets(input, access);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      INSERT INTO story_studio_brand_kits (
        id, workspace_id, name, primary_color, secondary_color, accent_color,
        text_color, muted_text_color, light_logo_photo_id, dark_logo_photo_id,
        font_family, signature_mode
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10::uuid, $11, $12)
      RETURNING ${columns}
    `, [
      randomUUID(), access.workspaceId, input.name, input.primaryColor, input.secondaryColor,
      input.accentColor, input.textColor, input.mutedTextColor, input.lightLogoPhotoId,
      input.darkLogoPhotoId, input.fontFamily, input.signatureMode,
    ]) as BrandKitRow[];
    if (!rows[0]) throw new Error("Le Brand Kit Story Studio n'a pas ete cree.");
    return mapRow(rows[0]);
  },

  async update(
    brandKitId: string,
    input: UpdateStoryStudioBrandKitInput,
    access: ContentAccessContext,
  ): Promise<StoryStudioBrandKit | null> {
    const current = await this.getById(brandKitId, access);
    if (!current) return null;
    const merged: StoryStudioBrandKitInput = {
      name: input.name ?? current.name,
      primaryColor: input.primaryColor ?? current.primaryColor,
      secondaryColor: input.secondaryColor ?? current.secondaryColor,
      accentColor: input.accentColor ?? current.accentColor,
      textColor: input.textColor ?? current.textColor,
      mutedTextColor: input.mutedTextColor ?? current.mutedTextColor,
      lightLogoPhotoId: input.lightLogoPhotoId === undefined ? current.lightLogoPhotoId : input.lightLogoPhotoId,
      darkLogoPhotoId: input.darkLogoPhotoId === undefined ? current.darkLogoPhotoId : input.darkLogoPhotoId,
      fontFamily: input.fontFamily ?? current.fontFamily,
      signatureMode: input.signatureMode ?? current.signatureMode,
    };
    await validateAssets(merged, access);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE story_studio_brand_kits
      SET name = $1,
          primary_color = $2,
          secondary_color = $3,
          accent_color = $4,
          text_color = $5,
          muted_text_color = $6,
          light_logo_photo_id = $7::uuid,
          dark_logo_photo_id = $8::uuid,
          font_family = $9,
          signature_mode = $10,
          updated_at = NOW()
      WHERE workspace_id = $11 AND id = $12::uuid
      RETURNING ${columns}
    `, [
      merged.name, merged.primaryColor, merged.secondaryColor, merged.accentColor,
      merged.textColor, merged.mutedTextColor, merged.lightLogoPhotoId,
      merged.darkLogoPhotoId, merged.fontFamily, merged.signatureMode,
      access.workspaceId, brandKitId.trim(),
    ]) as BrandKitRow[];
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async remove(brandKitId: string, access: ContentAccessContext): Promise<DeleteStoryStudioBrandKitResult> {
    const current = await this.getById(brandKitId, access);
    if (!current) return "not_found";
    if (current.isDefault) return "default_protected";
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      DELETE FROM story_studio_brand_kits
      WHERE workspace_id = $1 AND id = $2::uuid AND is_default = FALSE
      RETURNING id
    `, [access.workspaceId, brandKitId.trim()]);
    return rows[0] ? "deleted" : "not_found";
  },
};