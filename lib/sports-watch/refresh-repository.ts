import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type { SportsWatchAthleteSnapshot } from "@/lib/sports-watch/bcbulle-collector";
import type {
  SportsWatchCollectionSourceKey,
  SportsWatchRefreshBatchSummary,
  SportsWatchRunResult,
} from "@/types/sports-watch";

export type SportsWatchRefreshTaskRecord = {
  id: string;
  batchId: string;
  workspaceId: string;
  sourceKey: SportsWatchCollectionSourceKey;
  leaseToken: string;
  athlete: SportsWatchAthleteSnapshot;
};

export type SportsWatchRefreshTaskInput = Omit<
  SportsWatchRefreshTaskRecord,
  "id" | "batchId" | "workspaceId" | "leaseToken"
>;

export type SportsWatchRefreshRepository = {
  listEligibleWorkspaceIds(): Promise<string[]>;
  createScheduledBatch(input: {
    workspaceId: string;
    scheduledFor: string;
    tasks: SportsWatchRefreshTaskInput[];
  }): Promise<string | null>;
  createFailedScheduledBatch(input: {
    workspaceId: string;
    scheduledFor: string;
    message: string;
  }): Promise<string | null>;
  recoverExpiredTasks(now: string): Promise<void>;
  claimNextTask(now: string): Promise<SportsWatchRefreshTaskRecord | null>;
  completeTask(task: SportsWatchRefreshTaskRecord, result: SportsWatchRunResult): Promise<void>;
  failTask(task: SportsWatchRefreshTaskRecord, message: string): Promise<void>;
  finalizeDueBatches(scheduledFor: string): Promise<number>;
  getLatestBatch(workspaceId: string): Promise<SportsWatchRefreshBatchSummary | null>;
};

type TaskRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  source_key: SportsWatchCollectionSourceKey;
  lease_token: string;
  athlete_id: string;
  athlete_name_snapshot: string;
  athlete_sport_snapshot: string;
  athlete_club_snapshot: string;
};

type BatchRow = {
  id: string;
  trigger: "scheduled";
  status: SportsWatchRefreshBatchSummary["status"];
  scheduled_for: string | Date;
  started_at: string | Date;
  completed_at: string | Date | null;
  task_count: number | string;
  completed_count: number | string;
  failed_count: number | string;
  created_count: number | string;
  message: string | null;
};

type TaskSummaryRow = {
  source_key: SportsWatchCollectionSourceKey;
  athlete_id: string;
  athlete_name_snapshot: string;
  status: "pending" | "running" | "completed" | "failed";
  created_count: number | string;
  message: string | null;
};

const timestamp = (value: string | Date | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value;

const dateOnly = (value: string | Date): string =>
  (value instanceof Date ? value.toISOString() : value).slice(0, 10);

const mapTask = (row: TaskRow): SportsWatchRefreshTaskRecord => ({
  id: row.id,
  batchId: row.batch_id,
  workspaceId: row.workspace_id,
  sourceKey: row.source_key,
  leaseToken: row.lease_token,
  athlete: {
    id: row.athlete_id,
    name: row.athlete_name_snapshot,
    sport: row.athlete_sport_snapshot,
    club: row.athlete_club_snapshot,
  },
});

const refreshBatchFromTasksSql = `
  UPDATE sports_watch_refresh_batches batch
  SET task_count = stats.task_count,
      completed_count = stats.completed_count,
      failed_count = stats.failed_count,
      created_count = stats.created_count,
      status = CASE
        WHEN stats.pending_count + stats.running_count > 0 THEN 'running'
        WHEN stats.failed_count = 0 THEN 'completed'
        WHEN stats.completed_count = 0 THEN 'failed'
        ELSE 'partial'
      END,
      completed_at = CASE
        WHEN stats.pending_count + stats.running_count = 0 THEN NOW()
        ELSE NULL
      END
  FROM (
    SELECT
      batch_id,
      COUNT(*)::integer AS task_count,
      COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending_count,
      COUNT(*) FILTER (WHERE status = 'running')::integer AS running_count,
      COUNT(*) FILTER (WHERE status = 'completed')::integer AS completed_count,
      COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed_count,
      COALESCE(SUM(created_count), 0)::integer AS created_count
    FROM sports_watch_refresh_tasks
    GROUP BY batch_id
  ) stats
  WHERE batch.id = stats.batch_id
`;

export const PostgresSportsWatchRefreshRepository: SportsWatchRefreshRepository = {
  async listEligibleWorkspaceIds() {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT DISTINCT workspace_id
      FROM user_access
      WHERE role = 'admin'
        AND status = 'active'
        AND btrim(workspace_id) <> ''
      ORDER BY workspace_id
    `) as Array<{ workspace_id: string }>;
    return rows.map((row) => row.workspace_id);
  },

  async createScheduledBatch(input) {
    const sql = createContentStorageClient();
    const batchId = randomUUID();
    const taskPayload = input.tasks.map((task) => ({
      id: randomUUID(),
      source_key: task.sourceKey,
      athlete_id: task.athlete.id,
      athlete_name: task.athlete.name,
      athlete_sport: task.athlete.sport,
      athlete_club: task.athlete.club,
    }));
    const transactionResults = await sql.transaction([
      sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.workspaceId]),
      sql.query(`
      WITH inserted_batch AS (
        INSERT INTO sports_watch_refresh_batches (
          id, workspace_id, trigger, scheduled_for, task_count, status, completed_at
        )
        SELECT
          $2::uuid,
          $1,
          'scheduled',
          $3::date,
          jsonb_array_length($4::jsonb),
          CASE WHEN jsonb_array_length($4::jsonb) = 0 THEN 'completed' ELSE 'running' END,
          CASE WHEN jsonb_array_length($4::jsonb) = 0 THEN NOW() ELSE NULL END
        WHERE NOT EXISTS (
          SELECT 1
          FROM sports_watch_runs
          WHERE workspace_id = $1 AND status = 'running' AND expires_at > NOW()
        )
        ON CONFLICT (workspace_id, trigger, scheduled_for) DO NOTHING
        RETURNING id
      ),
      inserted_tasks AS (
        INSERT INTO sports_watch_refresh_tasks (
          id, batch_id, workspace_id, source_key, athlete_id,
          athlete_name_snapshot, athlete_sport_snapshot, athlete_club_snapshot
        )
        SELECT
          task.id,
          inserted_batch.id,
          $1,
          task.source_key,
          task.athlete_id,
          task.athlete_name,
          task.athlete_sport,
          task.athlete_club
        FROM inserted_batch
        CROSS JOIN jsonb_to_recordset($4::jsonb) AS task(
          id uuid,
          source_key text,
          athlete_id text,
          athlete_name text,
          athlete_sport text,
          athlete_club text
        )
        RETURNING id
      )
      SELECT id FROM inserted_batch
      UNION ALL
      SELECT id
      FROM sports_watch_refresh_batches
      WHERE workspace_id = $1
        AND trigger = 'scheduled'
        AND scheduled_for = $3::date
      LIMIT 1
    `, [
      input.workspaceId,
      batchId,
      input.scheduledFor,
      JSON.stringify(taskPayload),
    ]),
    ]);
    const rows = transactionResults[1] as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  },

  async createFailedScheduledBatch(input) {
    const sql = createContentStorageClient();
    const transactionResults = await sql.transaction([
      sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.workspaceId]),
      sql.query(`
      INSERT INTO sports_watch_refresh_batches (
        id, workspace_id, trigger, status, scheduled_for,
        failed_count, message, completed_at
      )
      SELECT
        $2::uuid, $1, 'scheduled', 'failed', $3::date,
        1, $4, NOW()
      ON CONFLICT (workspace_id, trigger, scheduled_for) DO NOTHING
      RETURNING id
    `, [input.workspaceId, randomUUID(), input.scheduledFor, input.message]),
    ]);
    const rows = transactionResults[1] as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  },

  async recoverExpiredTasks(now) {
    const sql = createContentStorageClient();
    await sql.query(`
      UPDATE sports_watch_refresh_tasks
      SET status = CASE WHEN attempt_count >= 2 THEN 'failed' ELSE 'pending' END,
          lease_expires_at = NULL,
          lease_token = NULL,
          message = CASE
            WHEN attempt_count >= 2
              THEN 'La collecte a dépassé sa durée deux fois et a été arrêtée.'
            ELSE 'Nouvelle tentative après expiration de la précédente.'
          END,
          completed_at = CASE WHEN attempt_count >= 2 THEN $1::timestamptz ELSE NULL END
      WHERE status = 'running'
        AND lease_expires_at <= $1::timestamptz
    `, [now]);
    await sql.query(refreshBatchFromTasksSql);
  },

  async claimNextTask(now) {
    const sql = createContentStorageClient();
    const leaseToken = randomUUID();
    try {
      const transactionResults = await sql.transaction([
        sql.query(
          "SELECT pg_advisory_xact_lock(hashtext('sports-watch-scheduled-refresh-global'))",
        ),
        sql.query(`
        WITH candidate AS (
          SELECT task.id
          FROM sports_watch_refresh_tasks task
          JOIN sports_watch_refresh_batches batch ON batch.id = task.batch_id
          WHERE task.status = 'pending'
            AND task.attempt_count < 2
            AND batch.status = 'running'
            AND (
              SELECT COUNT(*)
              FROM sports_watch_refresh_tasks active_task
              WHERE active_task.status = 'running'
                AND active_task.lease_expires_at > $1::timestamptz
            ) < 3
            AND NOT EXISTS (
              SELECT 1
              FROM sports_watch_runs run
              WHERE run.workspace_id = task.workspace_id
                AND run.source_key = task.source_key
                AND run.status = 'running'
                AND run.expires_at > $1::timestamptz
            )
            AND NOT EXISTS (
              SELECT 1
              FROM sports_watch_refresh_tasks active_task
              WHERE active_task.source_key = task.source_key
                AND active_task.status = 'running'
            )
          ORDER BY batch.scheduled_for, task.created_at, task.id
          FOR UPDATE OF task SKIP LOCKED
          LIMIT 1
        )
        UPDATE sports_watch_refresh_tasks task
        SET status = 'running',
            attempt_count = attempt_count + 1,
            lease_expires_at = $1::timestamptz + INTERVAL '2 minutes',
            lease_token = $2::uuid,
            started_at = COALESCE(started_at, $1::timestamptz),
            message = NULL
        FROM candidate
        WHERE task.id = candidate.id
        RETURNING
          task.id, task.batch_id, task.workspace_id, task.source_key, task.lease_token,
          task.athlete_id, task.athlete_name_snapshot,
          task.athlete_sport_snapshot, task.athlete_club_snapshot
      `, [now, leaseToken]),
      ]);
      const rows = transactionResults[1] as TaskRow[];
      return rows[0] ? mapTask(rows[0]) : null;
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: unknown }).code === "23505"
      ) {
        return null;
      }
      throw error;
    }
  },

  async completeTask(task, result) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_refresh_tasks
      SET status = 'completed',
          lease_expires_at = NULL,
          lease_token = NULL,
          scanned_count = $5,
          recent_count = $6,
          created_count = $7,
          message = $8,
          completed_at = NOW()
      WHERE id = $1::uuid
        AND batch_id = $2::uuid
        AND workspace_id = $3
        AND lease_token = $4::uuid
        AND status = 'running'
      RETURNING id
    `, [
      task.id,
      task.batchId,
      task.workspaceId,
      task.leaseToken,
      result.scannedCount,
      result.recentCount,
      result.createdCount,
      result.message,
    ]) as Array<{ id: string }>;
    if (!rows[0]) {
      throw new Error("La lease de cette tâche d’actualisation n’est plus valide.");
    }
    await sql.query(refreshBatchFromTasksSql);
  },

  async failTask(task, message) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_refresh_tasks
      SET status = 'failed',
          lease_expires_at = NULL,
          lease_token = NULL,
          message = $5,
          completed_at = NOW()
      WHERE id = $1::uuid
        AND batch_id = $2::uuid
        AND workspace_id = $3
        AND lease_token = $4::uuid
        AND status = 'running'
      RETURNING id
    `, [task.id, task.batchId, task.workspaceId, task.leaseToken, message]) as Array<{ id: string }>;
    if (!rows[0]) {
      throw new Error("La lease de cette tâche d’actualisation n’est plus valide.");
    }
    await sql.query(refreshBatchFromTasksSql);
  },

  async finalizeDueBatches(scheduledFor) {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_refresh_tasks task
      SET status = 'failed',
          lease_expires_at = NULL,
          lease_token = NULL,
          message = 'Aucun créneau d’exécution restant pour cette actualisation quotidienne.',
          completed_at = NOW()
      FROM sports_watch_refresh_batches batch
      WHERE task.batch_id = batch.id
        AND batch.status = 'running'
        AND batch.scheduled_for <= $1::date
        AND (
          task.status = 'pending'
          OR (task.status = 'running' AND task.lease_expires_at <= NOW())
        )
      RETURNING task.batch_id
    `, [scheduledFor]) as Array<{ batch_id: string }>;
    await sql.query(refreshBatchFromTasksSql);
    return new Set(rows.map((row) => row.batch_id)).size;
  },

  async getLatestBatch(workspaceId) {
    const sql = createContentStorageClient();
    const batches = await sql.query(`
      SELECT
        id, trigger, status, scheduled_for, started_at, completed_at,
        task_count, completed_count, failed_count, created_count, message
      FROM sports_watch_refresh_batches
      WHERE workspace_id = $1
      ORDER BY scheduled_for DESC, started_at DESC
      LIMIT 1
    `, [workspaceId]) as BatchRow[];
    const batch = batches[0];
    if (!batch) return null;
    const tasks = await sql.query(`
      SELECT
        source_key, athlete_id, athlete_name_snapshot, status, created_count, message
      FROM sports_watch_refresh_tasks
      WHERE batch_id = $1::uuid AND workspace_id = $2
      ORDER BY created_at, id
    `, [batch.id, workspaceId]) as TaskSummaryRow[];
    return {
      id: batch.id,
      trigger: batch.trigger,
      status: batch.status,
      scheduledFor: dateOnly(batch.scheduled_for),
      startedAt: timestamp(batch.started_at) ?? "",
      completedAt: timestamp(batch.completed_at),
      message: batch.message,
      taskCount: Number(batch.task_count),
      completedCount: Number(batch.completed_count),
      failedCount: Number(batch.failed_count),
      createdCount: Number(batch.created_count),
      tasks: tasks.map((task) => ({
        sourceKey: task.source_key,
        athleteId: task.athlete_id,
        athleteName: task.athlete_name_snapshot,
        status: task.status,
        createdCount: Number(task.created_count),
        message: task.message,
      })),
    };
  },
};
