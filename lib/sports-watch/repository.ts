import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { isScheduledSportsWatchRefreshEnabled } from "@/lib/sports-watch/activation";
import type { CollectedSportsWatchCandidate } from "@/lib/sports-watch/bcbulle-collector";
import type {
  BeBasketBinding,
  BeBasketBindingVerification,
  IwwfBinding,
  IwwfIdentityVerification,
  SafvBinding,
  SafvTeamVerification,
  SportsWatchAdminStatus,
  SportsWatchCandidate,
  SwissBasketballBinding,
  SwissBasketballBindingVerification,
  SwissBadmintonBinding,
  SwissBadmintonIdentityVerification,
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

type SwissBindingRow = {
  id: string;
  athlete_id: string;
  profile_url: string;
  profile_uuid: string;
  official_player_id: string;
  official_name_snapshot: string;
  official_club_snapshot: string | null;
  club_comparison: SwissBadmintonBinding["clubComparison"];
  verification_evidence_json: string[] | string;
  verified_at: string | Date;
  confirmed_at: string | Date;
  active: boolean;
  disabled_at: string | Date | null;
  version: number | string;
};

type IwwfBindingRow = {
  id: string;
  athlete_id: string;
  profile_url: string;
  official_athlete_id: string;
  official_name_snapshot: string;
  official_birth_year_snapshot: number | string | null;
  verification_evidence_json: string[] | string;
  verified_at: string | Date;
  confirmed_at: string | Date;
  active: boolean;
  disabled_at: string | Date | null;
  version: number | string;
};

type SafvBindingRow = {
  id: string;
  athlete_id: string;
  schedule_url: string;
  league_id: string;
  official_team_id: string;
  official_team_name_snapshot: string;
  competition_name_snapshot: string;
  season_id_snapshot: string;
  season_name_snapshot: string;
  club_comparison: SafvBinding["clubComparison"];
  verification_evidence_json: string[] | string;
  verified_at: string | Date;
  confirmed_at: string | Date;
  active: boolean;
  disabled_at: string | Date | null;
  version: number | string;
};

type BeBasketBindingRow = {
  id: string;
  athlete_id: string;
  calendar_url: string;
  team_slug: string;
  team_name_snapshot: string;
  player_name_snapshot: string;
  verification_evidence_json: string[] | string;
  verified_at: string | Date;
  confirmed_at: string | Date;
  active: boolean;
  disabled_at: string | Date | null;
  version: number | string;
};

type SwissBasketballBindingRow = {
  id: string;
  athlete_id: string;
  schedule_url: string;
  federation_id: string;
  season_id: string;
  season_name_snapshot: string;
  league_id: string;
  league_name_snapshot: string;
  official_team_id: string;
  official_team_name_snapshot: string;
  official_club_id: string;
  official_player_id: string;
  official_player_name_snapshot: string;
  verification_evidence_json: string[] | string;
  verified_at: string | Date;
  confirmed_at: string | Date;
  active: boolean;
  disabled_at: string | Date | null;
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

const mapSwissBinding = (row: SwissBindingRow): SwissBadmintonBinding => ({
  id: row.id,
  athleteId: row.athlete_id,
  officialIdentity: {
    profileUrl: row.profile_url,
    profileUuid: row.profile_uuid,
    playerId: row.official_player_id,
    name: row.official_name_snapshot,
    club: row.official_club_snapshot,
  },
  clubComparison: row.club_comparison,
  evidence: readStringArray(row.verification_evidence_json),
  verifiedAt: normalizeTimestamp(row.verified_at) ?? "",
  confirmedAt: normalizeTimestamp(row.confirmed_at) ?? "",
  active: row.active,
  disabledAt: normalizeTimestamp(row.disabled_at),
  version: Number(row.version),
});

const mapIwwfBinding = (row: IwwfBindingRow): IwwfBinding => ({
  id: row.id,
  athleteId: row.athlete_id,
  officialIdentity: {
    profileUrl: row.profile_url,
    athleteId: row.official_athlete_id,
    name: row.official_name_snapshot,
    birthYear: row.official_birth_year_snapshot === null
      ? null
      : Number(row.official_birth_year_snapshot),
  },
  evidence: readStringArray(row.verification_evidence_json),
  verifiedAt: normalizeTimestamp(row.verified_at) ?? "",
  confirmedAt: normalizeTimestamp(row.confirmed_at) ?? "",
  active: row.active,
  disabledAt: normalizeTimestamp(row.disabled_at),
  version: Number(row.version),
});

const mapSafvBinding = (row: SafvBindingRow): SafvBinding => ({
  id: row.id,
  athleteId: row.athlete_id,
  officialTeam: {
    scheduleUrl: row.schedule_url,
    leagueId: row.league_id,
    teamId: row.official_team_id,
    teamName: row.official_team_name_snapshot,
    competitionName: row.competition_name_snapshot,
    seasonId: row.season_id_snapshot,
    seasonName: row.season_name_snapshot,
  },
  clubComparison: row.club_comparison,
  evidence: readStringArray(row.verification_evidence_json),
  verifiedAt: normalizeTimestamp(row.verified_at) ?? "",
  confirmedAt: normalizeTimestamp(row.confirmed_at) ?? "",
  active: row.active,
  disabledAt: normalizeTimestamp(row.disabled_at),
  version: Number(row.version),
});

const mapBeBasketBinding = (row: BeBasketBindingRow): BeBasketBinding => ({
  id: row.id,
  athleteId: row.athlete_id,
  officialIdentity: {
    calendarUrl: row.calendar_url,
    teamSlug: row.team_slug,
    teamName: row.team_name_snapshot,
    playerName: row.player_name_snapshot,
  },
  evidence: readStringArray(row.verification_evidence_json),
  verifiedAt: normalizeTimestamp(row.verified_at) ?? "",
  confirmedAt: normalizeTimestamp(row.confirmed_at) ?? "",
  active: row.active,
  disabledAt: normalizeTimestamp(row.disabled_at),
  version: Number(row.version),
});

const mapSwissBasketballBinding = (
  row: SwissBasketballBindingRow,
): SwissBasketballBinding => ({
  id: row.id,
  athleteId: row.athlete_id,
  officialIdentity: {
    scheduleUrl: row.schedule_url,
    federationId: row.federation_id,
    seasonId: row.season_id,
    seasonName: row.season_name_snapshot,
    leagueId: row.league_id,
    leagueName: row.league_name_snapshot,
    teamId: row.official_team_id,
    teamName: row.official_team_name_snapshot,
    clubId: row.official_club_id,
    playerId: row.official_player_id,
    playerName: row.official_player_name_snapshot,
  },
  evidence: readStringArray(row.verification_evidence_json),
  verifiedAt: normalizeTimestamp(row.verified_at) ?? "",
  confirmedAt: normalizeTimestamp(row.confirmed_at) ?? "",
  active: row.active,
  disabledAt: normalizeTimestamp(row.disabled_at),
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
    refreshBatchId?: string;
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
  getCandidate(workspaceId: string, candidateId: string): Promise<SportsWatchCandidate | null>;
  reviewCandidate(input: {
    workspaceId: string;
    candidateId: string;
    status: Exclude<SportsWatchAdminStatus, "pending">;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<SportsWatchCandidate | null>;
  getValidatedCandidate(workspaceId: string, candidateId: string): Promise<SportsWatchCandidate | null>;
  getArticleCandidates(workspaceId: string, candidateIds: string[]): Promise<SportsWatchCandidate[]>;
  listSwissBindings(workspaceId: string): Promise<SwissBadmintonBinding[]>;
  getActiveSwissBinding(workspaceId: string, athleteId: string): Promise<SwissBadmintonBinding | null>;
  saveSwissBinding(input: {
    workspaceId: string;
    verification: SwissBadmintonIdentityVerification;
    expectedVersion: number;
    clerkUserId: string;
    confirmedAt: string;
  }): Promise<SwissBadmintonBinding | null>;
  disableSwissBinding(input: {
    workspaceId: string;
    athleteId: string;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<SwissBadmintonBinding | null>;
  listIwwfBindings(workspaceId: string): Promise<IwwfBinding[]>;
  getActiveIwwfBinding(workspaceId: string, athleteId: string): Promise<IwwfBinding | null>;
  saveIwwfBinding(input: {
    workspaceId: string;
    verification: IwwfIdentityVerification;
    expectedVersion: number;
    clerkUserId: string;
    confirmedAt: string;
  }): Promise<IwwfBinding | null>;
  disableIwwfBinding(input: {
    workspaceId: string;
    athleteId: string;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<IwwfBinding | null>;
  listSafvBindings(workspaceId: string): Promise<SafvBinding[]>;
  getActiveSafvBinding(workspaceId: string, athleteId: string): Promise<SafvBinding | null>;
  saveSafvBinding(input: {
    workspaceId: string;
    verification: SafvTeamVerification;
    expectedVersion: number;
    clerkUserId: string;
    confirmedAt: string;
  }): Promise<SafvBinding | null>;
  disableSafvBinding(input: {
    workspaceId: string;
    athleteId: string;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<SafvBinding | null>;
  listBeBasketBindings(workspaceId: string): Promise<BeBasketBinding[]>;
  getActiveBeBasketBinding(workspaceId: string, athleteId: string): Promise<BeBasketBinding | null>;
  saveBeBasketBinding(input: {
    workspaceId: string;
    verification: BeBasketBindingVerification;
    expectedVersion: number;
    clerkUserId: string;
    confirmedAt: string;
  }): Promise<BeBasketBinding | null>;
  disableBeBasketBinding(input: {
    workspaceId: string;
    athleteId: string;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<BeBasketBinding | null>;
  listSwissBasketballBindings(workspaceId: string): Promise<SwissBasketballBinding[]>;
  getActiveSwissBasketballBindings(
    workspaceId: string,
    athleteId: string,
  ): Promise<SwissBasketballBinding[]>;
  saveSwissBasketballBinding(input: {
    workspaceId: string;
    verification: SwissBasketballBindingVerification;
    expectedVersion: number;
    clerkUserId: string;
    confirmedAt: string;
  }): Promise<SwissBasketballBinding | null>;
  disableSwissBasketballBinding(input: {
    workspaceId: string;
    bindingId: string;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<SwissBasketballBinding | null>;
};

export const PostgresSportsWatchRepository: SportsWatchRepository = {
  async startRun(input) {
    const sql = createContentStorageClient();
    const runId = randomUUID();
    if (!isScheduledSportsWatchRefreshEnabled()) {
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
            $3::uuid, $1, $2, $4, $5, $7, $6::timestamptz,
            $6::timestamptz + INTERVAL '2 minutes'
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
    }
    const transactionResults = await sql.transaction([
      sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.workspaceId]),
      sql.query(`
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
        )
        SELECT
          $3::uuid, $1, $2, $4, $5, $7, $6::timestamptz,
          $6::timestamptz + INTERVAL '2 minutes'
        WHERE (
          $8::uuid IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM sports_watch_refresh_batches
            WHERE id = $8::uuid
              AND workspace_id = $1
              AND status = 'running'
          )
        ) OR (
          $8::uuid IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sports_watch_refresh_batches
            WHERE workspace_id = $1
              AND status = 'running'
          )
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
      input.refreshBatchId ?? null,
    ]),
    ]);
    const rows = transactionResults[1] as Array<{ id: string }>;
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
          $4::uuid, $1, $21, $2, $5, $6, $7, $8, $9,
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
        candidate.sourceKey,
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

  async getCandidate(workspaceId, candidateId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${candidateColumns}
      FROM sports_watch_candidates
      WHERE workspace_id = $1 AND id = $2::uuid
      LIMIT 1
    `, [workspaceId, candidateId]) as CandidateRow[];
    return rows[0] ? mapCandidate(rows[0]) : null;
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
        AND admin_status IN ('validated', 'exploited')
      LIMIT 1
    `, [workspaceId, candidateId]) as CandidateRow[];
    return rows[0] ? mapCandidate(rows[0]) : null;
  },

  async getArticleCandidates(workspaceId, candidateIds) {
    if (candidateIds.length === 0) return [];
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${candidateColumns}
      FROM sports_watch_candidates candidate
      WHERE candidate.workspace_id = $1
        AND candidate.id = ANY($2::uuid[])
        AND candidate.admin_status = 'validated'
        AND NOT EXISTS (
          SELECT 1
          FROM sports_watch_candidates replacement
          WHERE replacement.workspace_id = candidate.workspace_id
            AND replacement.supersedes_candidate_id = candidate.id
        )
      ORDER BY array_position($2::uuid[], candidate.id)
    `, [workspaceId, candidateIds]) as CandidateRow[];
    return rows.map(mapCandidate);
  },

  async listSwissBindings(workspaceId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, profile_url, profile_uuid::text AS profile_uuid,
        official_player_id, official_name_snapshot, official_club_snapshot,
        club_comparison, verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_swiss_bindings
      WHERE workspace_id = $1
      ORDER BY active DESC, updated_at DESC
    `, [workspaceId]) as SwissBindingRow[];
    return rows.map(mapSwissBinding);
  },

  async getActiveSwissBinding(workspaceId, athleteId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, profile_url, profile_uuid::text AS profile_uuid,
        official_player_id, official_name_snapshot, official_club_snapshot,
        club_comparison, verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_swiss_bindings
      WHERE workspace_id = $1 AND athlete_id = $2 AND active
      LIMIT 1
    `, [workspaceId, athleteId]) as SwissBindingRow[];
    return rows[0] ? mapSwissBinding(rows[0]) : null;
  },

  async saveSwissBinding(input) {
    const sql = createContentStorageClient();
    const official = input.verification.officialIdentity;
    const rows = await sql.query(`
      INSERT INTO sports_watch_swiss_bindings (
        id, workspace_id, athlete_id, profile_url, profile_uuid,
        official_player_id, official_name_snapshot, official_club_snapshot,
        club_comparison, verification_evidence_json, verified_at,
        confirmed_by_clerk_user_id, confirmed_at
      )
      SELECT
        $1::uuid, $2, $3, $4, $5::uuid,
        $6, $7, $8, $9, $10::jsonb, $11::timestamptz, $12, $13::timestamptz
      WHERE $14 = 0
         OR EXISTS (
           SELECT 1
           FROM sports_watch_swiss_bindings
           WHERE workspace_id = $2 AND athlete_id = $3
         )
      ON CONFLICT (workspace_id, athlete_id) DO UPDATE
      SET profile_url = EXCLUDED.profile_url,
          profile_uuid = EXCLUDED.profile_uuid,
          official_player_id = EXCLUDED.official_player_id,
          official_name_snapshot = EXCLUDED.official_name_snapshot,
          official_club_snapshot = EXCLUDED.official_club_snapshot,
          club_comparison = EXCLUDED.club_comparison,
          verification_evidence_json = EXCLUDED.verification_evidence_json,
          verified_at = EXCLUDED.verified_at,
          confirmed_by_clerk_user_id = EXCLUDED.confirmed_by_clerk_user_id,
          confirmed_at = EXCLUDED.confirmed_at,
          active = TRUE,
          disabled_by_clerk_user_id = NULL,
          disabled_at = NULL,
          version = sports_watch_swiss_bindings.version + 1,
          updated_at = NOW()
      WHERE sports_watch_swiss_bindings.version = $14
      RETURNING
        id, athlete_id, profile_url, profile_uuid::text AS profile_uuid,
        official_player_id, official_name_snapshot, official_club_snapshot,
        club_comparison, verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      randomUUID(),
      input.workspaceId,
      input.verification.athlete.id,
      official.profileUrl,
      official.profileUuid,
      official.playerId,
      official.name,
      official.club,
      input.verification.clubComparison,
      JSON.stringify(input.verification.evidence),
      input.verification.verifiedAt,
      input.clerkUserId,
      input.confirmedAt,
      input.expectedVersion,
    ]) as SwissBindingRow[];
    return rows[0] ? mapSwissBinding(rows[0]) : null;
  },

  async disableSwissBinding(input) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_swiss_bindings
      SET active = FALSE,
          disabled_by_clerk_user_id = $4,
          disabled_at = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND athlete_id = $2
        AND version = $3
        AND active
      RETURNING
        id, athlete_id, profile_url, profile_uuid::text AS profile_uuid,
        official_player_id, official_name_snapshot, official_club_snapshot,
        club_comparison, verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      input.workspaceId,
      input.athleteId,
      input.expectedVersion,
      input.clerkUserId,
    ]) as SwissBindingRow[];
    return rows[0] ? mapSwissBinding(rows[0]) : null;
  },

  async listIwwfBindings(workspaceId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, profile_url, official_athlete_id,
        official_name_snapshot, official_birth_year_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_iwwf_bindings
      WHERE workspace_id = $1
      ORDER BY active DESC, updated_at DESC
    `, [workspaceId]) as IwwfBindingRow[];
    return rows.map(mapIwwfBinding);
  },

  async getActiveIwwfBinding(workspaceId, athleteId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, profile_url, official_athlete_id,
        official_name_snapshot, official_birth_year_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_iwwf_bindings
      WHERE workspace_id = $1 AND athlete_id = $2 AND active
      LIMIT 1
    `, [workspaceId, athleteId]) as IwwfBindingRow[];
    return rows[0] ? mapIwwfBinding(rows[0]) : null;
  },

  async saveIwwfBinding(input) {
    const sql = createContentStorageClient();
    const official = input.verification.officialIdentity;
    const rows = await sql.query(`
      INSERT INTO sports_watch_iwwf_bindings (
        id, workspace_id, athlete_id, profile_url, official_athlete_id,
        official_name_snapshot, official_birth_year_snapshot,
        verification_evidence_json, verified_at,
        confirmed_by_clerk_user_id, confirmed_at
      )
      SELECT
        $1::uuid, $2, $3, $4, $5,
        $6, $7, $8::jsonb, $9::timestamptz, $10, $11::timestamptz
      WHERE $12 = 0
         OR EXISTS (
           SELECT 1
           FROM sports_watch_iwwf_bindings
           WHERE workspace_id = $2 AND athlete_id = $3
         )
      ON CONFLICT (workspace_id, athlete_id) DO UPDATE
      SET profile_url = EXCLUDED.profile_url,
          official_athlete_id = EXCLUDED.official_athlete_id,
          official_name_snapshot = EXCLUDED.official_name_snapshot,
          official_birth_year_snapshot = EXCLUDED.official_birth_year_snapshot,
          verification_evidence_json = EXCLUDED.verification_evidence_json,
          verified_at = EXCLUDED.verified_at,
          confirmed_by_clerk_user_id = EXCLUDED.confirmed_by_clerk_user_id,
          confirmed_at = EXCLUDED.confirmed_at,
          active = TRUE,
          disabled_by_clerk_user_id = NULL,
          disabled_at = NULL,
          version = sports_watch_iwwf_bindings.version + 1,
          updated_at = NOW()
      WHERE sports_watch_iwwf_bindings.version = $12
      RETURNING
        id, athlete_id, profile_url, official_athlete_id,
        official_name_snapshot, official_birth_year_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      randomUUID(),
      input.workspaceId,
      input.verification.athlete.id,
      official.profileUrl,
      official.athleteId,
      official.name,
      official.birthYear,
      JSON.stringify(input.verification.evidence),
      input.verification.verifiedAt,
      input.clerkUserId,
      input.confirmedAt,
      input.expectedVersion,
    ]) as IwwfBindingRow[];
    return rows[0] ? mapIwwfBinding(rows[0]) : null;
  },

  async disableIwwfBinding(input) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_iwwf_bindings
      SET active = FALSE,
          disabled_by_clerk_user_id = $4,
          disabled_at = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND athlete_id = $2
        AND version = $3
        AND active
      RETURNING
        id, athlete_id, profile_url, official_athlete_id,
        official_name_snapshot, official_birth_year_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      input.workspaceId,
      input.athleteId,
      input.expectedVersion,
      input.clerkUserId,
    ]) as IwwfBindingRow[];
    return rows[0] ? mapIwwfBinding(rows[0]) : null;
  },

  async listSafvBindings(workspaceId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, schedule_url, league_id, official_team_id,
        official_team_name_snapshot, competition_name_snapshot,
        season_id_snapshot, season_name_snapshot, club_comparison,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_safv_bindings
      WHERE workspace_id = $1
      ORDER BY active DESC, updated_at DESC
    `, [workspaceId]) as SafvBindingRow[];
    return rows.map(mapSafvBinding);
  },

  async getActiveSafvBinding(workspaceId, athleteId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, schedule_url, league_id, official_team_id,
        official_team_name_snapshot, competition_name_snapshot,
        season_id_snapshot, season_name_snapshot, club_comparison,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_safv_bindings
      WHERE workspace_id = $1 AND athlete_id = $2 AND active
      LIMIT 1
    `, [workspaceId, athleteId]) as SafvBindingRow[];
    return rows[0] ? mapSafvBinding(rows[0]) : null;
  },

  async saveSafvBinding(input) {
    const sql = createContentStorageClient();
    const official = input.verification.officialTeam;
    const rows = await sql.query(`
      INSERT INTO sports_watch_safv_bindings (
        id, workspace_id, athlete_id, schedule_url, league_id,
        official_team_id, official_team_name_snapshot,
        competition_name_snapshot, season_id_snapshot, season_name_snapshot,
        club_comparison, verification_evidence_json, verified_at,
        confirmed_by_clerk_user_id, confirmed_at
      )
      SELECT
        $1::uuid, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12::jsonb, $13::timestamptz, $14, $15::timestamptz
      WHERE $16 = 0
         OR EXISTS (
           SELECT 1
           FROM sports_watch_safv_bindings
           WHERE workspace_id = $2 AND athlete_id = $3
         )
      ON CONFLICT (workspace_id, athlete_id) DO UPDATE
      SET schedule_url = EXCLUDED.schedule_url,
          league_id = EXCLUDED.league_id,
          official_team_id = EXCLUDED.official_team_id,
          official_team_name_snapshot = EXCLUDED.official_team_name_snapshot,
          competition_name_snapshot = EXCLUDED.competition_name_snapshot,
          season_id_snapshot = EXCLUDED.season_id_snapshot,
          season_name_snapshot = EXCLUDED.season_name_snapshot,
          club_comparison = EXCLUDED.club_comparison,
          verification_evidence_json = EXCLUDED.verification_evidence_json,
          verified_at = EXCLUDED.verified_at,
          confirmed_by_clerk_user_id = EXCLUDED.confirmed_by_clerk_user_id,
          confirmed_at = EXCLUDED.confirmed_at,
          active = TRUE,
          disabled_by_clerk_user_id = NULL,
          disabled_at = NULL,
          version = sports_watch_safv_bindings.version + 1,
          updated_at = NOW()
      WHERE sports_watch_safv_bindings.version = $16
      RETURNING
        id, athlete_id, schedule_url, league_id, official_team_id,
        official_team_name_snapshot, competition_name_snapshot,
        season_id_snapshot, season_name_snapshot, club_comparison,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      randomUUID(),
      input.workspaceId,
      input.verification.athlete.id,
      official.scheduleUrl,
      official.leagueId,
      official.teamId,
      official.teamName,
      official.competitionName,
      official.seasonId,
      official.seasonName,
      input.verification.clubComparison,
      JSON.stringify(input.verification.evidence),
      input.verification.verifiedAt,
      input.clerkUserId,
      input.confirmedAt,
      input.expectedVersion,
    ]) as SafvBindingRow[];
    return rows[0] ? mapSafvBinding(rows[0]) : null;
  },

  async disableSafvBinding(input) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_safv_bindings
      SET active = FALSE,
          disabled_by_clerk_user_id = $4,
          disabled_at = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND athlete_id = $2
        AND version = $3
        AND active
      RETURNING
        id, athlete_id, schedule_url, league_id, official_team_id,
        official_team_name_snapshot, competition_name_snapshot,
        season_id_snapshot, season_name_snapshot, club_comparison,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      input.workspaceId,
      input.athleteId,
      input.expectedVersion,
      input.clerkUserId,
    ]) as SafvBindingRow[];
    return rows[0] ? mapSafvBinding(rows[0]) : null;
  },

  async listBeBasketBindings(workspaceId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, calendar_url, team_slug, team_name_snapshot,
        player_name_snapshot, verification_evidence_json, verified_at,
        confirmed_at, active, disabled_at, version
      FROM sports_watch_bebasket_bindings
      WHERE workspace_id = $1
      ORDER BY active DESC, updated_at DESC
    `, [workspaceId]) as BeBasketBindingRow[];
    return rows.map(mapBeBasketBinding);
  },

  async getActiveBeBasketBinding(workspaceId, athleteId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, calendar_url, team_slug, team_name_snapshot,
        player_name_snapshot, verification_evidence_json, verified_at,
        confirmed_at, active, disabled_at, version
      FROM sports_watch_bebasket_bindings
      WHERE workspace_id = $1 AND athlete_id = $2 AND active
      LIMIT 1
    `, [workspaceId, athleteId]) as BeBasketBindingRow[];
    return rows[0] ? mapBeBasketBinding(rows[0]) : null;
  },

  async saveBeBasketBinding(input) {
    const sql = createContentStorageClient();
    const official = input.verification.officialIdentity;
    const rows = await sql.query(`
      INSERT INTO sports_watch_bebasket_bindings (
        id, workspace_id, athlete_id, calendar_url, team_slug,
        team_name_snapshot, player_name_snapshot, verification_evidence_json,
        verified_at, confirmed_by_clerk_user_id, confirmed_at
      )
      SELECT
        $1::uuid, $2, $3, $4, $5,
        $6, $7, $8::jsonb, $9::timestamptz, $10, $11::timestamptz
      WHERE $12 = 0
         OR EXISTS (
           SELECT 1
           FROM sports_watch_bebasket_bindings
           WHERE workspace_id = $2 AND athlete_id = $3
         )
      ON CONFLICT (workspace_id, athlete_id) DO UPDATE
      SET calendar_url = EXCLUDED.calendar_url,
          team_slug = EXCLUDED.team_slug,
          team_name_snapshot = EXCLUDED.team_name_snapshot,
          player_name_snapshot = EXCLUDED.player_name_snapshot,
          verification_evidence_json = EXCLUDED.verification_evidence_json,
          verified_at = EXCLUDED.verified_at,
          confirmed_by_clerk_user_id = EXCLUDED.confirmed_by_clerk_user_id,
          confirmed_at = EXCLUDED.confirmed_at,
          active = TRUE,
          disabled_by_clerk_user_id = NULL,
          disabled_at = NULL,
          version = sports_watch_bebasket_bindings.version + 1,
          updated_at = NOW()
      WHERE sports_watch_bebasket_bindings.version = $12
      RETURNING
        id, athlete_id, calendar_url, team_slug, team_name_snapshot,
        player_name_snapshot, verification_evidence_json, verified_at,
        confirmed_at, active, disabled_at, version
    `, [
      randomUUID(),
      input.workspaceId,
      input.verification.athlete.id,
      official.calendarUrl,
      official.teamSlug,
      official.teamName,
      official.playerName,
      JSON.stringify(input.verification.evidence),
      input.verification.verifiedAt,
      input.clerkUserId,
      input.confirmedAt,
      input.expectedVersion,
    ]) as BeBasketBindingRow[];
    return rows[0] ? mapBeBasketBinding(rows[0]) : null;
  },

  async disableBeBasketBinding(input) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_bebasket_bindings
      SET active = FALSE,
          disabled_by_clerk_user_id = $4,
          disabled_at = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND athlete_id = $2
        AND version = $3
        AND active
      RETURNING
        id, athlete_id, calendar_url, team_slug, team_name_snapshot,
        player_name_snapshot, verification_evidence_json, verified_at,
        confirmed_at, active, disabled_at, version
    `, [
      input.workspaceId,
      input.athleteId,
      input.expectedVersion,
      input.clerkUserId,
    ]) as BeBasketBindingRow[];
    return rows[0] ? mapBeBasketBinding(rows[0]) : null;
  },

  async listSwissBasketballBindings(workspaceId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, schedule_url, federation_id, season_id,
        season_name_snapshot, league_id, league_name_snapshot,
        official_team_id, official_team_name_snapshot, official_club_id,
        official_player_id, official_player_name_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_swiss_basketball_bindings
      WHERE workspace_id = $1
      ORDER BY active DESC, athlete_id, league_name_snapshot, official_team_name_snapshot
    `, [workspaceId]) as SwissBasketballBindingRow[];
    return rows.map(mapSwissBasketballBinding);
  },

  async getActiveSwissBasketballBindings(workspaceId, athleteId) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, athlete_id, schedule_url, federation_id, season_id,
        season_name_snapshot, league_id, league_name_snapshot,
        official_team_id, official_team_name_snapshot, official_club_id,
        official_player_id, official_player_name_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
      FROM sports_watch_swiss_basketball_bindings
      WHERE workspace_id = $1 AND athlete_id = $2 AND active
      ORDER BY league_name_snapshot, official_team_name_snapshot
    `, [workspaceId, athleteId]) as SwissBasketballBindingRow[];
    return rows.map(mapSwissBasketballBinding);
  },

  async saveSwissBasketballBinding(input) {
    const sql = createContentStorageClient();
    const official = input.verification.officialIdentity;
    const rows = await sql.query(`
      INSERT INTO sports_watch_swiss_basketball_bindings (
        id, workspace_id, athlete_id, schedule_url, federation_id,
        season_id, season_name_snapshot, league_id, league_name_snapshot,
        official_team_id, official_team_name_snapshot, official_club_id,
        official_player_id, official_player_name_snapshot,
        verification_evidence_json, verified_at,
        confirmed_by_clerk_user_id, confirmed_at
      )
      SELECT
        $1::uuid, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14,
        $15::jsonb, $16::timestamptz,
        $17, $18::timestamptz
      WHERE $19 = 0
         OR EXISTS (
           SELECT 1
           FROM sports_watch_swiss_basketball_bindings
           WHERE workspace_id = $2
             AND athlete_id = $3
             AND season_id = $6
             AND league_id = $8
             AND official_team_id = $10
         )
      ON CONFLICT (
        workspace_id, athlete_id, season_id, league_id, official_team_id
      ) DO UPDATE
      SET schedule_url = EXCLUDED.schedule_url,
          federation_id = EXCLUDED.federation_id,
          season_name_snapshot = EXCLUDED.season_name_snapshot,
          league_name_snapshot = EXCLUDED.league_name_snapshot,
          official_team_name_snapshot = EXCLUDED.official_team_name_snapshot,
          official_club_id = EXCLUDED.official_club_id,
          official_player_id = EXCLUDED.official_player_id,
          official_player_name_snapshot = EXCLUDED.official_player_name_snapshot,
          verification_evidence_json = EXCLUDED.verification_evidence_json,
          verified_at = EXCLUDED.verified_at,
          confirmed_by_clerk_user_id = EXCLUDED.confirmed_by_clerk_user_id,
          confirmed_at = EXCLUDED.confirmed_at,
          active = TRUE,
          disabled_by_clerk_user_id = NULL,
          disabled_at = NULL,
          version = sports_watch_swiss_basketball_bindings.version + 1,
          updated_at = NOW()
      WHERE sports_watch_swiss_basketball_bindings.version = $19
      RETURNING
        id, athlete_id, schedule_url, federation_id, season_id,
        season_name_snapshot, league_id, league_name_snapshot,
        official_team_id, official_team_name_snapshot, official_club_id,
        official_player_id, official_player_name_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      randomUUID(),
      input.workspaceId,
      input.verification.athlete.id,
      official.scheduleUrl,
      official.federationId,
      official.seasonId,
      official.seasonName,
      official.leagueId,
      official.leagueName,
      official.teamId,
      official.teamName,
      official.clubId,
      official.playerId,
      official.playerName,
      JSON.stringify(input.verification.evidence),
      input.verification.verifiedAt,
      input.clerkUserId,
      input.confirmedAt,
      input.expectedVersion,
    ]) as SwissBasketballBindingRow[];
    return rows[0] ? mapSwissBasketballBinding(rows[0]) : null;
  },

  async disableSwissBasketballBinding(input) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_swiss_basketball_bindings
      SET active = FALSE,
          disabled_by_clerk_user_id = $4,
          disabled_at = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND version = $3
        AND active
      RETURNING
        id, athlete_id, schedule_url, federation_id, season_id,
        season_name_snapshot, league_id, league_name_snapshot,
        official_team_id, official_team_name_snapshot, official_club_id,
        official_player_id, official_player_name_snapshot,
        verification_evidence_json, verified_at, confirmed_at,
        active, disabled_at, version
    `, [
      input.workspaceId,
      input.bindingId,
      input.expectedVersion,
      input.clerkUserId,
    ]) as SwissBasketballBindingRow[];
    return rows[0] ? mapSwissBasketballBinding(rows[0]) : null;
  },
};
