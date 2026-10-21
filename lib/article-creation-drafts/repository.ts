import { randomUUID } from "node:crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  ArticleCreationDraftPayload,
  ArticleCreationDraftRecord,
  ArticleCreationDraftSummary,
} from "@/types/article-creation-draft";

type SummaryRow = {
  id: string;
  display_title: string;
  subject_name: string;
  step_id: ArticleCreationDraftSummary["stepId"];
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
};

type DraftRow = SummaryRow & {
  client_creation_id: string;
  payload_json: ArticleCreationDraftPayload | string;
};

const normalizeTimestamp = (value: string | Date): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Date de brouillon Article invalide.");
  return parsed.toISOString();
};

const readPayload = (value: DraftRow["payload_json"]): ArticleCreationDraftPayload =>
  typeof value === "string" ? JSON.parse(value) as ArticleCreationDraftPayload : value;

const mapSummary = (row: SummaryRow): ArticleCreationDraftSummary => ({
  id: row.id,
  displayTitle: row.display_title,
  subjectName: row.subject_name,
  stepId: row.step_id,
  version: Number(row.version),
  createdAt: normalizeTimestamp(row.created_at),
  updatedAt: normalizeTimestamp(row.updated_at),
});

const mapRecord = (row: DraftRow): ArticleCreationDraftRecord => ({
  ...mapSummary(row),
  clientCreationId: row.client_creation_id,
  payload: readPayload(row.payload_json),
});

const summaryColumns = `
  id, display_title, subject_name, step_id, version,
  created_at, updated_at, deleted_at
`;
const recordColumns = `client_creation_id, payload_json, ${summaryColumns}`;

const accessValues = (access: ContentAccessContext) => [
  access.workspaceId,
  access.clerkUserId,
  access.role,
  access.isAdmin ? null : access.mediaId ?? null,
] as const;

export type UpdateArticleCreationDraftResult =
  | { status: "not_found" }
  | { status: "version_conflict"; currentVersion: number }
  | { status: "updated"; draft: ArticleCreationDraftRecord };

export const ArticleCreationDraftRepository = {
  async list(access: ContentAccessContext): Promise<ArticleCreationDraftSummary[]> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${summaryColumns}
      FROM article_creation_drafts
      WHERE workspace_id = $1
        AND clerk_user_id = $2
        AND role = $3
        AND media_id IS NOT DISTINCT FROM $4::uuid
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 50
    `, [...accessValues(access)]) as SummaryRow[];
    return rows.map(mapSummary);
  },

  async getById(id: string, access: ContentAccessContext): Promise<ArticleCreationDraftRecord | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${recordColumns}
      FROM article_creation_drafts
      WHERE id = $1::uuid
        AND workspace_id = $2
        AND clerk_user_id = $3
        AND role = $4
        AND media_id IS NOT DISTINCT FROM $5::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `, [id.trim(), ...accessValues(access)]) as DraftRow[];
    return rows[0] ? mapRecord(rows[0]) : null;
  },

  async createOrGet(
    input: { clientCreationId: string; displayTitle: string; payload: ArticleCreationDraftPayload },
    access: ContentAccessContext,
  ): Promise<ArticleCreationDraftRecord | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      INSERT INTO article_creation_drafts (
        id, client_creation_id, workspace_id, clerk_user_id, role, media_id,
        display_title, subject_name, step_id, payload_json
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10::jsonb)
      ON CONFLICT (workspace_id, clerk_user_id, client_creation_id) DO NOTHING
      RETURNING ${recordColumns}
    `, [
      randomUUID(),
      input.clientCreationId,
      ...accessValues(access),
      input.displayTitle,
      input.payload.draft.subject.displayName,
      input.payload.stepId,
      JSON.stringify(input.payload),
    ]) as DraftRow[];
    if (rows[0]) return mapRecord(rows[0]);

    const existing = await sql.query(`
      SELECT ${recordColumns}
      FROM article_creation_drafts
      WHERE workspace_id = $1
        AND clerk_user_id = $2
        AND client_creation_id = $3::uuid
        AND role = $4
        AND media_id IS NOT DISTINCT FROM $5::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `, [
      access.workspaceId,
      access.clerkUserId,
      input.clientCreationId,
      access.role,
      access.isAdmin ? null : access.mediaId ?? null,
    ]) as DraftRow[];
    return existing[0] ? mapRecord(existing[0]) : null;
  },

  async update(
    id: string,
    input: {
      expectedVersion: number;
      displayTitle: string;
      payload: ArticleCreationDraftPayload;
    },
    access: ContentAccessContext,
  ): Promise<UpdateArticleCreationDraftResult> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE article_creation_drafts
      SET display_title = $1,
          subject_name = $2,
          step_id = $3,
          payload_json = $4::jsonb,
          version = $5 + 1,
          updated_at = NOW()
      WHERE id = $6::uuid
        AND workspace_id = $7
        AND clerk_user_id = $8
        AND role = $9
        AND media_id IS NOT DISTINCT FROM $10::uuid
        AND version = $5
        AND deleted_at IS NULL
      RETURNING ${recordColumns}
    `, [
      input.displayTitle,
      input.payload.draft.subject.displayName,
      input.payload.stepId,
      JSON.stringify(input.payload),
      input.expectedVersion,
      id.trim(),
      ...accessValues(access),
    ]) as DraftRow[];
    if (rows[0]) return { status: "updated", draft: mapRecord(rows[0]) };
    const current = await this.getById(id, access);
    if (!current) return { status: "not_found" };
    return { status: "version_conflict", currentVersion: current.version };
  },

  async remove(id: string, access: ContentAccessContext): Promise<boolean> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE article_creation_drafts
      SET payload_json = '{}'::jsonb,
          display_title = 'Brouillon supprime',
          subject_name = 'Sujet supprime',
          version = version + 1,
          updated_at = NOW(),
          deleted_at = NOW()
      WHERE id = $1::uuid
        AND workspace_id = $2
        AND clerk_user_id = $3
        AND role = $4
        AND media_id IS NOT DISTINCT FROM $5::uuid
        AND deleted_at IS NULL
      RETURNING id
    `, [id.trim(), ...accessValues(access)]) as Array<{ id: string }>;
    return Boolean(rows[0]);
  },
};

export const isArticleCreationDraftSchemaMissingError = (error: unknown): boolean => {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === "42P01"
    && typeof candidate.message === "string"
    && candidate.message.includes("article_creation_drafts");
};
