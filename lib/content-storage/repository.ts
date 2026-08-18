import type { ContentDocument } from "@/types/content-document";
import type { ContentVariant } from "@/types/content-variant";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type { StoredInterviewResult } from "@/lib/content-storage/validation";

const normalize = (value: unknown): string => String(value ?? "").trim();

const readJson = <T>(value: unknown): T => {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
};

const getDocumentSource = (document: ContentDocument): string => {
  const activeVersion = document.versions.find((version) => version.id === document.activeVersionId) ?? document.versions[0];
  return activeVersion?.source ?? "generation";
};

type DraftRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  type: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  payload_json: unknown;
  version: number;
};

type SessionRow = {
  session_id: string;
  workspace_id: string;
  user_id: string | null;
  created_at: string;
  expires_at: string;
  payload_json: unknown;
};

type VariantRow = {
  id: string;
  source_document_id: string;
  workspace_id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  payload_json: unknown;
};

const mapDraftRow = (row: DraftRow): { document: ContentDocument; version: number; workspaceId: string; userId: string | null } => ({
  document: readJson<ContentDocument>(row.payload_json),
  version: row.version,
  workspaceId: row.workspace_id,
  userId: row.user_id,
});

const mapSessionRow = (row: SessionRow): { sessionId: string; session: StoredInterviewResult; workspaceId: string; userId: string | null; createdAt: string; expiresAt: string } => ({
  sessionId: row.session_id,
  session: readJson<StoredInterviewResult>(row.payload_json),
  workspaceId: row.workspace_id,
  userId: row.user_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

const mapVariantRow = (row: VariantRow): { variant: ContentVariant; workspaceId: string; userId: string | null; createdAt: string; updatedAt: string } => ({
  variant: readJson<ContentVariant>(row.payload_json),
  workspaceId: row.workspace_id,
  userId: row.user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type UpdateDraftResult =
  | { status: "not_found" }
  | { status: "version_conflict"; currentVersion: number; current: { document: ContentDocument; version: number; workspaceId: string; userId: string | null } }
  | { status: "updated"; draft: { document: ContentDocument; version: number; workspaceId: string; userId: string | null } };

export const ContentStorageRepository = {
  async createDraft(document: ContentDocument, access: ContentAccessContext) {
    const sql = createContentStorageClient();
    const rows = (await sql`
      INSERT INTO content_documents (
        id,
        workspace_id,
        user_id,
        type,
        status,
        source,
        created_at,
        updated_at,
        payload_json,
        version
      ) VALUES (
        ${document.id},
        ${access.workspaceId},
        ${access.clerkUserId},
        ${document.type},
        ${document.status},
        ${getDocumentSource(document)},
        ${document.createdAt},
        ${document.updatedAt},
        ${JSON.stringify(document)}::jsonb,
        ${1}
      )
      RETURNING id, workspace_id, user_id, type, status, source, created_at, updated_at, payload_json, version
    `) as DraftRow[];

    return mapDraftRow(rows[0]);
  },

  async getDraft(id: string, access: ContentAccessContext) {    const sql = createContentStorageClient();
    const rows = (await sql`
      SELECT id, workspace_id, user_id, type, status, source, created_at, updated_at, payload_json, version
      FROM content_documents
      WHERE workspace_id = ${access.workspaceId}
        AND id = ${normalize(id)}
        AND (${access.isAdmin}::boolean OR user_id = ${access.clerkUserId})
      LIMIT 1
    `) as DraftRow[];

    return rows[0] ? mapDraftRow(rows[0]) : null;
  },

  async listDrafts(access: ContentAccessContext) {
    const sql = createContentStorageClient();
    const rows = (await sql`
      SELECT id, workspace_id, user_id, type, status, source, created_at, updated_at, payload_json, version
      FROM content_documents
      WHERE workspace_id = ${access.workspaceId}
        AND (${access.isAdmin}::boolean OR user_id = ${access.clerkUserId})
      ORDER BY updated_at DESC
      LIMIT 50
    `) as DraftRow[];

    return rows.map((row) => mapDraftRow(row));
  },

  async updateDraft(id: string, document: ContentDocument, expectedVersion: number, access: ContentAccessContext): Promise<UpdateDraftResult> {
    const current = await this.getDraft(id, access);
    if (!current) {
      return { status: "not_found" };
    }

    if (current.version !== expectedVersion) {
      return { status: "version_conflict", currentVersion: current.version, current };
    }

    const sql = createContentStorageClient();
    const rows = (await sql`
      UPDATE content_documents
      SET
        type = ${document.type},
        status = ${document.status},
        source = ${getDocumentSource(document)},
        updated_at = ${document.updatedAt},
        payload_json = ${JSON.stringify(document)}::jsonb,
        version = ${expectedVersion + 1}
      WHERE workspace_id = ${access.workspaceId}
        AND id = ${normalize(id)}
        AND version = ${expectedVersion}
        AND (${access.isAdmin}::boolean OR user_id = ${access.clerkUserId})
      RETURNING id, workspace_id, user_id, type, status, source, created_at, updated_at, payload_json, version
    `) as DraftRow[];

    if (!rows[0]) {
      const refreshed = await this.getDraft(id, access);
      if (!refreshed) {
        return { status: "not_found" };
      }
      return { status: "version_conflict", currentVersion: refreshed.version, current: refreshed };
    }

    return { status: "updated", draft: mapDraftRow(rows[0]) };
  },

  async createSession(sessionId: string, session: StoredInterviewResult, expiresAt: string, access: ContentAccessContext) {
    const sql = createContentStorageClient();
    const rows = (await sql`
      INSERT INTO content_generation_sessions (
        session_id,
        workspace_id,
        user_id,
        created_at,
        expires_at,
        payload_json
      ) VALUES (
        ${normalize(sessionId)},
        ${access.workspaceId},
        ${access.clerkUserId},
        ${session.createdAt},
        ${expiresAt},
        ${JSON.stringify(session)}::jsonb
      )
      RETURNING session_id, workspace_id, user_id, created_at, expires_at, payload_json
    `) as SessionRow[];

    return mapSessionRow(rows[0]);
  },

  async getSession(sessionId: string, access: ContentAccessContext) {
    const sql = createContentStorageClient();
    const rows = (await sql`
      SELECT session_id, workspace_id, user_id, created_at, expires_at, payload_json
      FROM content_generation_sessions
      WHERE workspace_id = ${access.workspaceId}
        AND session_id = ${normalize(sessionId)}
        AND (${access.isAdmin}::boolean OR user_id = ${access.clerkUserId})
      LIMIT 1
    `) as SessionRow[];

    return rows[0] ? mapSessionRow(rows[0]) : null;
  },

  async createVariant(variant: ContentVariant, access: ContentAccessContext) {
    const sql = createContentStorageClient();
    const rows = (await sql`
      INSERT INTO content_variants (
        id,
        source_document_id,
        workspace_id,
        user_id,
        created_at,
        updated_at,
        payload_json
      ) VALUES (
        ${normalize(variant.id)},
        ${normalize(variant.sourceDocumentId)},
        ${access.workspaceId},
        ${access.clerkUserId},
        ${variant.createdAt},
        ${variant.updatedAt},
        ${JSON.stringify(variant)}::jsonb
      )
      RETURNING id, source_document_id, workspace_id, user_id, created_at, updated_at, payload_json
    `) as VariantRow[];

    return mapVariantRow(rows[0]);
  },

  async getVariant(id: string, access: ContentAccessContext) {
    const sql = createContentStorageClient();
    const rows = (await sql`
      SELECT id, source_document_id, workspace_id, user_id, created_at, updated_at, payload_json
      FROM content_variants
      WHERE workspace_id = ${access.workspaceId}
        AND id = ${normalize(id)}
        AND (${access.isAdmin}::boolean OR user_id = ${access.clerkUserId})
      LIMIT 1
    `) as VariantRow[];

    return rows[0] ? mapVariantRow(rows[0]) : null;
  },

  async listVariantsBySourceDocumentId(sourceDocumentId: string, access: ContentAccessContext) {
    const sql = createContentStorageClient();
    const rows = (await sql`
      SELECT id, source_document_id, workspace_id, user_id, created_at, updated_at, payload_json
      FROM content_variants
      WHERE workspace_id = ${access.workspaceId}
        AND source_document_id = ${normalize(sourceDocumentId)}
        AND (${access.isAdmin}::boolean OR user_id = ${access.clerkUserId})
      ORDER BY updated_at DESC
    `) as VariantRow[];

    return rows.map((row) => mapVariantRow(row));
  },
};
