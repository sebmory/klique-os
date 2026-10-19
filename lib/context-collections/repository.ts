import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  ContextCollectionSummary,
  ContextConnectorReport,
  ContextItem,
} from "@/types/context-intelligence";

export type EditorialContextCollection = {
  id: string;
  workspaceId: string;
  clerkUserId: string;
  role: ContentAccessContext["role"];
  mediaId: string | null;
  items: ContextItem[];
  reports: ContextConnectorReport[];
  summary: ContextCollectionSummary;
  createdAt: string;
  expiresAt: string;
};

type CollectionRow = {
  collection_id: string;
  workspace_id: string;
  clerk_user_id: string;
  role: ContentAccessContext["role"];
  media_id: string | null;
  items_json: unknown;
  reports_json: unknown;
  summary_json: unknown;
  created_at: string | Date;
  expires_at: string | Date;
};

const normalizeTimestamp = (value: string | Date, field: string): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Date Neon invalide pour ${field}.`);
  return parsed.toISOString();
};

const readJson = <T>(value: unknown): T => {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
};

const mapRow = (row: CollectionRow): EditorialContextCollection => ({
  id: row.collection_id,
  workspaceId: row.workspace_id,
  clerkUserId: row.clerk_user_id,
  role: row.role,
  mediaId: row.media_id,
  items: readJson<ContextItem[]>(row.items_json),
  reports: readJson<ContextConnectorReport[]>(row.reports_json),
  summary: readJson<ContextCollectionSummary>(row.summary_json),
  createdAt: normalizeTimestamp(row.created_at, "editorial_context_collections.created_at"),
  expiresAt: normalizeTimestamp(row.expires_at, "editorial_context_collections.expires_at"),
});

export const EditorialContextCollectionRepository = {
  async create(
    input: Pick<EditorialContextCollection, "id" | "items" | "reports" | "summary" | "expiresAt">,
    access: ContentAccessContext,
  ): Promise<EditorialContextCollection> {
    const sql = createContentStorageClient();
    const rows = (await sql`
      INSERT INTO editorial_context_collections (
        collection_id,
        workspace_id,
        clerk_user_id,
        role,
        media_id,
        items_json,
        reports_json,
        summary_json,
        expires_at
      ) VALUES (
        ${input.id}::uuid,
        ${access.workspaceId},
        ${access.clerkUserId},
        ${access.role},
        ${access.isAdmin ? null : access.mediaId ?? null}::uuid,
        ${JSON.stringify(input.items)}::jsonb,
        ${JSON.stringify(input.reports)}::jsonb,
        ${JSON.stringify(input.summary)}::jsonb,
        ${input.expiresAt}
      )
      RETURNING
        collection_id, workspace_id, clerk_user_id, role, media_id,
        items_json, reports_json, summary_json, created_at, expires_at
    `) as CollectionRow[];

    if (!rows[0]) throw new Error("La collection de contexte n a pas ete enregistree.");
    return mapRow(rows[0]);
  },

  async getById(collectionId: string, access: ContentAccessContext): Promise<EditorialContextCollection | null> {
    const sql = createContentStorageClient();
    const rows = (await sql`
      SELECT
        collection_id, workspace_id, clerk_user_id, role, media_id,
        items_json, reports_json, summary_json, created_at, expires_at
      FROM editorial_context_collections
      WHERE collection_id = ${collectionId.trim()}::uuid
        AND workspace_id = ${access.workspaceId}
        AND clerk_user_id = ${access.clerkUserId}
        AND role = ${access.role}
        AND (
          ${access.isAdmin}::boolean
          OR media_id = ${access.mediaId ?? null}::uuid
        )
      LIMIT 1
    `) as CollectionRow[];

    return rows[0] ? mapRow(rows[0]) : null;
  },
};
