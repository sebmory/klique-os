import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  SportsWatchCandidate,
  SportsWatchImport,
  SportsWatchImportConfirmation,
  SportsWatchImportExtraction,
} from "@/types/sports-watch";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";

type ImportRow = {
  id: string;
  athlete_id: string;
  athlete_name_snapshot: string;
  athlete_sport_snapshot: string;
  athlete_club_snapshot: string;
  original_filename: string;
  content_type: string;
  size_bytes: number | string;
  status: SportsWatchImport["status"];
  extraction_json: SportsWatchImportExtraction | string | null;
  extraction_provider: string | null;
  extraction_model: string | null;
  extracted_at: string | Date | null;
  candidate_id: string | null;
  version: number | string;
};

export type SportsWatchImportRecord = SportsWatchImport & {
  workspaceId: string;
  blobPathname: string;
  contentHash: string;
};

const importColumns = `
  id, athlete_id, athlete_name_snapshot, athlete_sport_snapshot,
  athlete_club_snapshot, original_filename, content_type, size_bytes,
  status, extraction_json, extraction_provider, extraction_model,
  extracted_at, candidate_id, version
`;

const readExtraction = (
  value: ImportRow["extraction_json"],
): SportsWatchImportExtraction | null => {
  if (!value) return null;
  return typeof value === "string"
    ? JSON.parse(value) as SportsWatchImportExtraction
    : value;
};

const timestamp = (value: string | Date | null): string | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Date d’import invalide.");
  return parsed.toISOString();
};

const mapImport = (
  row: ImportRow & { workspace_id: string; blob_pathname: string; content_hash: string },
): SportsWatchImportRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  athleteId: row.athlete_id,
  athleteName: row.athlete_name_snapshot,
  athleteSport: row.athlete_sport_snapshot,
  athleteClub: row.athlete_club_snapshot,
  originalFilename: row.original_filename,
  contentType: row.content_type,
  sizeBytes: Number(row.size_bytes),
  contentHash: row.content_hash,
  blobPathname: row.blob_pathname,
  fileHref: `/api/admin/sports-watch/imports/${row.id}/file`,
  status: row.status,
  extraction: readExtraction(row.extraction_json),
  extractionProvider: row.extraction_provider,
  extractionModel: row.extraction_model,
  extractedAt: timestamp(row.extracted_at),
  candidateId: row.candidate_id,
  version: Number(row.version),
});

export const SportsWatchImportRepository = {
  async create(input: {
    workspaceId: string;
    athlete: { id: string; name: string; sport: string; club: string };
    clerkUserId: string;
    file: {
      pathname: string;
      originalFilename: string;
      contentType: string;
      sizeBytes: number;
      contentHash: string;
    };
  }): Promise<{ imported: SportsWatchImportRecord; created: boolean }> {
    const sql = createContentStorageClient();
    const id = randomUUID();
    const inserted = await sql.query(`
      INSERT INTO sports_watch_imports (
        id, workspace_id, athlete_id, athlete_name_snapshot,
        athlete_sport_snapshot, athlete_club_snapshot,
        uploaded_by_clerk_user_id, blob_pathname, original_filename,
        content_type, size_bytes, content_hash
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (workspace_id, athlete_id, content_hash) DO NOTHING
      RETURNING ${importColumns}, workspace_id, blob_pathname, content_hash
    `, [
      id,
      input.workspaceId,
      input.athlete.id,
      input.athlete.name,
      input.athlete.sport,
      input.athlete.club,
      input.clerkUserId,
      input.file.pathname,
      input.file.originalFilename,
      input.file.contentType,
      input.file.sizeBytes,
      input.file.contentHash,
    ]) as Array<ImportRow & {
      workspace_id: string;
      blob_pathname: string;
      content_hash: string;
    }>;
    if (inserted[0]) return { imported: mapImport(inserted[0]), created: true };
    const existing = await this.getByHash(
      input.workspaceId,
      input.athlete.id,
      input.file.contentHash,
    );
    if (!existing) throw new Error("L’import n’a pas pu être enregistré.");
    return { imported: existing, created: false };
  },

  async getByHash(
    workspaceId: string,
    athleteId: string,
    contentHash: string,
  ): Promise<SportsWatchImportRecord | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${importColumns}, workspace_id, blob_pathname, content_hash
      FROM sports_watch_imports
      WHERE workspace_id = $1 AND athlete_id = $2 AND content_hash = $3
      LIMIT 1
    `, [workspaceId, athleteId, contentHash]) as Array<ImportRow & {
      workspace_id: string;
      blob_pathname: string;
      content_hash: string;
    }>;
    return rows[0] ? mapImport(rows[0]) : null;
  },

  async get(workspaceId: string, importId: string): Promise<SportsWatchImportRecord | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${importColumns}, workspace_id, blob_pathname, content_hash
      FROM sports_watch_imports
      WHERE workspace_id = $1 AND id = $2::uuid
      LIMIT 1
    `, [workspaceId, importId]) as Array<ImportRow & {
      workspace_id: string;
      blob_pathname: string;
      content_hash: string;
    }>;
    return rows[0] ? mapImport(rows[0]) : null;
  },

  async saveExtraction(input: {
    workspaceId: string;
    importId: string;
    expectedVersion: number;
    extraction: SportsWatchImportExtraction;
    provider: string;
    model: string;
    providerResponseId: string | null;
  }): Promise<SportsWatchImportRecord | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_imports
      SET status = 'extracted',
          extraction_json = $4::jsonb,
          extraction_provider = $5,
          extraction_model = $6,
          extraction_provider_response_id = $7,
          extraction_attempts = extraction_attempts + 1,
          extracted_at = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND version = $3
        AND status <> 'confirmed'
      RETURNING ${importColumns}, workspace_id, blob_pathname, content_hash
    `, [
      input.workspaceId,
      input.importId,
      input.expectedVersion,
      JSON.stringify(input.extraction),
      input.provider,
      input.model,
      input.providerResponseId,
    ]) as Array<ImportRow & {
      workspace_id: string;
      blob_pathname: string;
      content_hash: string;
    }>;
    return rows[0] ? mapImport(rows[0]) : null;
  },

  async confirm(input: {
    workspaceId: string;
    importId: string;
    expectedVersion: number;
    clerkUserId: string;
    confirmation: SportsWatchImportConfirmation;
    candidate: {
      id: string;
      sourceName: string;
      sourceUrl: string;
      title: string;
      excerpt: string;
      resultKind: SportsWatchImportConfirmation["resultKind"];
      publicationDate: string | null;
      eventDate: string | null;
      attributionEvidence: string[];
      logicalKey: string;
      contentHash: string;
      collectedAt: string;
    };
  }): Promise<SportsWatchCandidate | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      WITH target AS (
        SELECT *
        FROM sports_watch_imports
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND status = 'extracted'
          AND version = $3
      ),
      inserted AS (
        INSERT INTO sports_watch_candidates (
          id, workspace_id, source_key, athlete_id, athlete_name_snapshot,
          athlete_sport_snapshot, athlete_club_snapshot, source_name, source_url,
          article_url, title, excerpt, result_kind, publication_date,
          event_date_from, event_date_to, collected_at, attribution_status,
          attribution_evidence_json, factual_verification_status, admin_status,
          logical_key, content_hash
        )
        SELECT
          $4::uuid, workspace_id, 'manual-import', athlete_id, athlete_name_snapshot,
          athlete_sport_snapshot, athlete_club_snapshot, $5, $6, $6, $7, $8, $9,
          $10::timestamptz, $11::date, $11::date, $12::timestamptz, 'matched',
          $13::jsonb, 'unverified', 'pending', $14, $15
        FROM target
        ON CONFLICT (workspace_id, athlete_id, logical_key, content_hash) DO NOTHING
        RETURNING id
      ),
      updated AS (
        UPDATE sports_watch_imports
        SET status = 'confirmed',
            confirmed_payload_json = $16::jsonb,
            confirmed_by_clerk_user_id = $17,
            confirmed_at = NOW(),
            candidate_id = (SELECT id FROM inserted),
            version = version + 1,
            updated_at = NOW()
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND status = 'extracted'
          AND version = $3
          AND EXISTS (SELECT 1 FROM inserted)
        RETURNING candidate_id
      )
      SELECT candidate_id FROM updated
    `, [
      input.workspaceId,
      input.importId,
      input.expectedVersion,
      input.candidate.id,
      input.candidate.sourceName,
      input.candidate.sourceUrl,
      input.candidate.title,
      input.candidate.excerpt,
      input.candidate.resultKind,
      input.candidate.publicationDate,
      input.candidate.eventDate,
      input.candidate.collectedAt,
      JSON.stringify(input.candidate.attributionEvidence),
      input.candidate.logicalKey,
      input.candidate.contentHash,
      JSON.stringify(input.confirmation),
      input.clerkUserId,
    ]) as Array<{ candidate_id: string }>;
    if (!rows[0]?.candidate_id) return null;
    return PostgresSportsWatchRepository.getCandidate(input.workspaceId, rows[0].candidate_id);
  },
};
