import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type { CollectedSportsWatchCandidate } from "@/lib/sports-watch/bcbulle-collector";
import type {
  SportsWatchAdminStatus,
  SportsWatchCandidate,
} from "@/types/sports-watch";

type CandidateRow = {
  id: string;
  athlete_id: string;
  athlete_name_snapshot: string;
  source_name: string;
  source_url: string;
  article_url: string;
  title: string;
  excerpt: string;
  result_kind: SportsWatchCandidate["resultKind"];
  publication_date: string | Date | null;
  event_date_from: string | Date | null;
  event_date_to: string | Date | null;
  collected_at: string | Date;
  attribution_status: SportsWatchCandidate["attributionStatus"];
  attribution_evidence_json: string[] | string;
  factual_verification_status: SportsWatchCandidate["verificationStatus"];
  admin_status: SportsWatchCandidate["adminStatus"];
  supersedes_candidate_id: string | null;
  version: number | string;
};

const normalizeTimestamp = (value: string | Date | null): string | null => {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Date de veille sportive invalide.");
  return parsed.toISOString();
};

const normalizeDate = (value: string | Date | null): string | null => {
  const timestamp = normalizeTimestamp(value);
  return timestamp?.slice(0, 10) ?? null;
};

const readStringArray = (value: CandidateRow["attribution_evidence_json"]): string[] => {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
};

const mapCandidate = (row: CandidateRow): SportsWatchCandidate => ({
  id: row.id,
  athleteId: row.athlete_id,
  athleteName: row.athlete_name_snapshot,
  sourceName: row.source_name,
  sourceUrl: row.source_url,
  articleUrl: row.article_url,
  title: row.title,
  excerpt: row.excerpt,
  resultKind: row.result_kind,
  publicationDate: normalizeTimestamp(row.publication_date),
  eventDateFrom: normalizeDate(row.event_date_from),
  eventDateTo: normalizeDate(row.event_date_to),
  collectedAt: normalizeTimestamp(row.collected_at) ?? "",
  attributionStatus: row.attribution_status,
  attributionEvidence: readStringArray(row.attribution_evidence_json),
  verificationStatus: row.factual_verification_status,
  adminStatus: row.admin_status,
  supersedesCandidateId: row.supersedes_candidate_id,
  version: Number(row.version),
});

const candidateColumns = `
  id, athlete_id, athlete_name_snapshot, source_name, source_url, article_url,
  title, excerpt, result_kind, publication_date,
  event_date_from::text AS event_date_from,
  event_date_to::text AS event_date_to,
  collected_at, attribution_status, attribution_evidence_json,
  factual_verification_status, admin_status, supersedes_candidate_id, version
`;

export type SportsWatchRepository = {
  startRun(input: {
    workspaceId: string;
    sourceKey: string;
    athleteId: string;
    athleteName: string;
    clerkUserId: string;
    now: string;
  }): Promise<string | null>;
  completeRun(input: {
    workspaceId: string;
    runId: string;
    scannedCount: number;
    recentCount: number;
    createdCount: number;
    message: string;
  }): Promise<void>;
  failRun(input: { workspaceId: string; runId: string; message: string }): Promise<void>;
  saveCandidates(workspaceId: string, candidates: CollectedSportsWatchCandidate[]): Promise<number>;
  listCandidates(workspaceId: string): Promise<SportsWatchCandidate[]>;
  reviewCandidate(input: {
    workspaceId: string;
    candidateId: string;
    status: Exclude<SportsWatchAdminStatus, "pending">;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<SportsWatchCandidate | null>;
  getValidatedCandidate(workspaceId: string, candidateId: string): Promise<SportsWatchCandidate | null>;
};

export const PostgresSportsWatchRepository: SportsWatchRepository = {
  async startRun(input) {
    const sql = createContentStorageClient();
    const runId = randomUUID();
    const rows = await sql.query(`
      WITH expired AS (
        UPDATE sports_watch_runs
        SET status = 'failed',
            message = 'Collecte expirée avant sa finalisation.',
            completed_at = NOW()
        WHERE workspace_id = $1
          AND source_key = $2
          AND status = 'running'
          AND expires_at <= $6::timestamptz
      ),
      inserted AS (
        INSERT INTO sports_watch_runs (
          id, workspace_id, source_key, athlete_id, athlete_name_snapshot,
          started_by_clerk_user_id, started_at, expires_at
        ) VALUES (
          $3::uuid, $1, $2, $4, $5, $7, $6::timestamptz, $6::timestamptz + INTERVAL '2 minutes'
        )
        ON CONFLICT (workspace_id, source_key) WHERE status = 'running'
        DO NOTHING
        RETURNING id
      )
      SELECT id FROM inserted
    `, [
      input.workspaceId,
      input.sourceKey,
      runId,
      input.athleteId,
      input.athleteName,
      input.now,
      input.clerkUserId,
    ]) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  },

  async completeRun(input) {
    const sql = createContentStorageClient();
    await sql.query(`
      UPDATE sports_watch_runs
      SET status = 'completed',
          scanned_count = $3,
          recent_count = $4,
          created_count = $5,
          message = $6,
          completed_at = NOW()
      WHERE workspace_id = $1 AND id = $2::uuid AND status = 'running'
    `, [
      input.workspaceId,
      input.runId,
      input.scannedCount,
      input.recentCount,
      input.createdCount,
      input.message,
    ]);
  },

  async failRun(input) {
    const sql = createContentStorageClient();
    await sql.query(`
      UPDATE sports_watch_runs
      SET status = 'failed', message = $3, completed_at = NOW()
      WHERE workspace_id = $1 AND id = $2::uuid AND status = 'running'
    `, [input.workspaceId, input.runId, input.message]);
  },

  async saveCandidates(workspaceId, candidates) {
    const sql = createContentStorageClient();
    let createdCount = 0;
    for (const candidate of candidates) {
      const rows = await sql.query(`
        WITH previous AS (
          SELECT id
          FROM sports_watch_candidates
          WHERE workspace_id = $1
            AND athlete_id = $2
            AND logical_key = $3
          ORDER BY created_at DESC
          LIMIT 1
        )
        INSERT INTO sports_watch_candidates (
          id, workspace_id, source_key, athlete_id, athlete_name_snapshot,
          athlete_sport_snapshot, athlete_club_snapshot, source_name, source_url,
          article_url, title, excerpt, result_kind, publication_date,
          event_date_from, event_date_to, collected_at, attribution_status,
          attribution_evidence_json, logical_key, content_hash, supersedes_candidate_id
        ) VALUES (
          $4::uuid, $1, 'bc-bulle', $2, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14::timestamptz,
          $15::date, $16::date, $17::timestamptz, $18,
          $19::jsonb, $3, $20, (SELECT id FROM previous)
        )
        ON CONFLICT (workspace_id, athlete_id, logical_key, content_hash)
        DO NOTHING
        RETURNING id
      `, [
        workspaceId,
        candidate.athlete.id,
        candidate.logicalKey,
        randomUUID(),
        candidate.athlete.name,
        candidate.athlete.sport,
        candidate.athlete.club,
        candidate.sourceName,
        candidate.sourceUrl,
        candidate.articleUrl,
        candidate.title,
        candidate.excerpt,
        candidate.resultKind,
        candidate.publicationDate,
        candidate.eventDateFrom,
        candidate.eventDateTo,
        candidate.collectedAt,
        candidate.attributionStatus,
        JSON.stringify(candidate.attributionEvidence),
        candidate.contentHash,
      ]) as Array<{ id: string }>;
      if (rows[0]) createdCount += 1;
    }
    return createdCount;
  },

  async listCandidates(workspaceId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${candidateColumns}
      FROM sports_watch_candidates
      WHERE workspace_id = $1
      ORDER BY CASE admin_status WHEN 'pending' THEN 0 WHEN 'validated' THEN 1 ELSE 2 END,
               collected_at DESC
      LIMIT 50
    `, [workspaceId]) as CandidateRow[];
    return rows.map(mapCandidate);
  },

  async reviewCandidate(input) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_candidates
      SET admin_status = $3,
          reviewed_by_clerk_user_id = $4,
          reviewed_at = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND version = $5
      RETURNING ${candidateColumns}
    `, [
      input.workspaceId,
      input.candidateId,
      input.status,
      input.clerkUserId,
      input.expectedVersion,
    ]) as CandidateRow[];
    return rows[0] ? mapCandidate(rows[0]) : null;
  },

  async getValidatedCandidate(workspaceId, candidateId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${candidateColumns}
      FROM sports_watch_candidates
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND admin_status = 'validated'
      LIMIT 1
    `, [workspaceId, candidateId]) as CandidateRow[];
    return rows[0] ? mapCandidate(rows[0]) : null;
  },
};
