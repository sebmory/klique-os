import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CollectedSportsWatchCandidate } from "@/lib/sports-watch/bcbulle-collector";
import { buildSportsWatchCandidateViews } from "@/lib/sports-watch/presentation";
import {
  PostgresSportsWatchRefreshRepository,
  type SportsWatchRefreshTaskInput,
  type SportsWatchRefreshTaskRecord,
} from "@/lib/sports-watch/refresh-repository";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";
import { createScheduledSportsWatchRefresh } from "@/lib/sports-watch/scheduled-refresh";
import type {
  SportsWatchCollectionSourceKey,
  SportsWatchRunResult,
} from "@/types/sports-watch";

const testDatabaseUrl = process.env.KLIQUE_SPORTS_WATCH_PG_TEST_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;
const sql = testDatabaseUrl
  ? neon(testDatabaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const fixtureRunId = randomUUID();
const workspace = (name: string) => `sports-watch-test-${fixtureRunId}-${name}`;
const fixtureWorkspaces = [
  workspace("batch"),
  workspace("budget"),
  workspace("lease"),
  workspace("finalize"),
  workspace("manual-batch"),
  workspace("manual-run"),
  workspace("history"),
  workspace("isolated"),
];
const sources: SportsWatchCollectionSourceKey[] = [
  "bc-bulle",
  "swiss-badminton",
  "iwwf-wakesurf",
  "kenpokan",
  "safv",
  "bebasket",
  "swiss-basketball",
];

const task = (
  index: number,
  sourceKey = sources[index % sources.length],
): SportsWatchRefreshTaskInput => ({
  sourceKey,
  athlete: {
    id: `fixture-${fixtureRunId}-${index}`,
    name: `Athlète fixture ${index}`,
    sport: "Fixture",
    club: "Fixture",
  },
});

const successfulResult = (
  taskRecord: SportsWatchRefreshTaskRecord,
  createdCount = 0,
): SportsWatchRunResult => ({
  sourceName: taskRecord.sourceKey,
  sourceUrl: "https://example.com/fixture",
  message: createdCount > 0 ? "Résultat simulé créé." : "Fixture inchangée.",
  scannedCount: 1,
  recentCount: 1,
  createdCount,
  candidates: [],
});

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const candidateFixture = (): CollectedSportsWatchCandidate => ({
  sourceKey: "bc-bulle",
  athlete: {
    id: `fixture-history-${fixtureRunId}`,
    name: "Athlète historique",
    sport: "Badminton",
    club: "BC Bulle",
  },
  sourceName: "Source fixture",
  sourceUrl: "https://example.com/feed",
  articleUrl: "https://example.com/result",
  title: "Résultat fixture",
  excerpt: "Résultat exploité à conserver sans modification.",
  resultKind: "individual_result",
  publicationDate: "2026-10-28T12:00:00.000Z",
  eventDateFrom: "2026-10-28",
  eventDateTo: "2026-10-28",
  collectedAt: "2026-10-29T12:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: ["Fixture simulée."],
  logicalKey: `fixture-logical-${fixtureRunId}`,
  contentHash: `fixture-content-${fixtureRunId}`,
});

describePostgres.sequential("scheduled sports watch refresh on Neon Test", () => {
  beforeAll(async () => {
    const target = new URL(testDatabaseUrl!);
    if (
      target.protocol !== "postgresql:"
      || !target.hostname.endsWith(".neon.tech")
      || target.pathname !== "/klique_intro_app_test"
      || target.searchParams.get("sslmode") !== "require"
    ) {
      throw new Error("La cible doit être explicitement la base Neon Sports Watch Test.");
    }
    const rows = await sql.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.sports_watch_refresh_batches')::text AS batches_table,
             to_regclass('public.sports_watch_refresh_tasks')::text AS tasks_table
    `) as Array<{
      database_name: string;
      batches_table: string | null;
      tasks_table: string | null;
    }>;
    expect(rows[0]).toEqual({
      database_name: "klique_intro_app_test",
      batches_table: "sports_watch_refresh_batches",
      tasks_table: "sports_watch_refresh_tasks",
    });
    process.env.POSTGRES_DATABASE_URL = testDatabaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspace("batch");
    process.env.KLIQUE_SPORTS_WATCH_SCHEDULED_ENABLED = "true";
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    await sql.transaction([
      sql.query(
        "DELETE FROM sports_watch_candidates WHERE workspace_id = ANY($1::text[])",
        [fixtureWorkspaces],
      ),
      sql.query(
        "DELETE FROM sports_watch_runs WHERE workspace_id = ANY($1::text[])",
        [fixtureWorkspaces],
      ),
      sql.query(
        "DELETE FROM sports_watch_refresh_batches WHERE workspace_id = ANY($1::text[])",
        [fixtureWorkspaces],
      ),
    ]);
  });

  it("prepares idempotently and processes 16 durable tasks with a global ceiling", async () => {
    const tasks = Array.from({ length: 16 }, (_, index) => task(index));
    const batchId = await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("batch"),
      scheduledFor: "2026-10-29",
      tasks,
    });
    const duplicateBatchId = await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("batch"),
      scheduledFor: "2026-10-29",
      tasks,
    });
    expect(duplicateBatchId).toBe(batchId);

    let active = 0;
    let maximumActive = 0;
    let duplicateSourceConcurrency = false;
    const activeSources = new Set<string>();
    const executeTask = async (claimed: SportsWatchRefreshTaskRecord) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (activeSources.has(claimed.sourceKey)) duplicateSourceConcurrency = true;
      activeSources.add(claimed.sourceKey);
      await sleep(40);
      activeSources.delete(claimed.sourceKey);
      active -= 1;
      if (claimed.athlete.id.endsWith("-5")) {
        throw new Error("Erreur de source simulée.");
      }
      return successfulResult(claimed, claimed.athlete.id.endsWith("-0") ? 1 : 0);
    };
    const workers = Array.from({ length: 4 }, () => createScheduledSportsWatchRefresh({
      repository: PostgresSportsWatchRefreshRepository,
      executeTask,
    }));
    const startedAt = performance.now();
    const results = await Promise.all(workers.map((worker) => worker.work({
      timeBudgetMs: 5_000,
      minimumRemainingMs: 250,
      maxConcurrentTasks: 3,
    })));
    const elapsedMs = performance.now() - startedAt;
    const simulatedScale = 250;

    console.info(
      `[sports-watch-neon-test] tasks=16 real_ms=${elapsedMs.toFixed(0)} simulated_scale=1:${simulatedScale} simulated_seconds=${(elapsedMs * simulatedScale / 1_000).toFixed(1)}`,
    );
    expect(results.reduce((sum, result) => sum + result.claimedCount, 0)).toBe(16);
    expect(results.reduce((sum, result) => sum + result.completedCount, 0)).toBe(15);
    expect(results.reduce((sum, result) => sum + result.failedCount, 0)).toBe(1);
    expect(maximumActive).toBeLessThanOrEqual(3);
    expect(duplicateSourceConcurrency).toBe(false);

    const summary = await PostgresSportsWatchRefreshRepository.getLatestBatch(workspace("batch"));
    expect(summary).toMatchObject({
      id: batchId,
      status: "partial",
      taskCount: 16,
      completedCount: 15,
      failedCount: 1,
      createdCount: 1,
    });
    expect(summary?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "failed", message: "Erreur de source simulée." }),
      expect.objectContaining({ status: "completed" }),
    ]));

    await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("isolated"),
      scheduledFor: "2026-10-29",
      tasks: [],
    });
    const isolated = await PostgresSportsWatchRefreshRepository.getLatestBatch(workspace("isolated"));
    expect(isolated).toMatchObject({ status: "completed", taskCount: 0 });
    expect(isolated?.id).not.toBe(summary?.id);
  });

  it("stops for budget and resumes durable pending tasks", async () => {
    await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("budget"),
      scheduledFor: "2026-10-29",
      tasks: Array.from({ length: 10 }, (_, index) => task(100 + index, sources[index % 3])),
    });
    let clockReadCount = 0;
    const refresh = createScheduledSportsWatchRefresh({
      repository: PostgresSportsWatchRefreshRepository,
      nowMs: () => clockReadCount++ < 4 ? 0 : 121,
      executeTask: async (claimed) => {
        await sleep(80);
        return successfulResult(claimed);
      },
    });
    const first = await refresh.work({
      timeBudgetMs: 120,
      minimumRemainingMs: 40,
      maxConcurrentTasks: 3,
    });
    const pendingRows = await sql.query(`
      SELECT COUNT(*)::integer AS count
      FROM sports_watch_refresh_tasks
      WHERE workspace_id = $1 AND status = 'pending'
    `, [workspace("budget")]) as Array<{ count: number }>;
    expect(first).toMatchObject({ stoppedForBudget: true, claimedCount: 3 });
    expect(pendingRows[0]?.count).toBe(7);

    const second = await refresh.work({
      timeBudgetMs: 2_000,
      minimumRemainingMs: 100,
      maxConcurrentTasks: 3,
    });
    expect(second.claimedCount).toBe(7);
    expect(await PostgresSportsWatchRefreshRepository.getLatestBatch(workspace("budget")))
      .toMatchObject({ status: "completed", completedCount: 10 });
  });

  it("recovers an expired lease and rejects the former worker write", async () => {
    await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("lease"),
      scheduledFor: "2026-10-29",
      tasks: [task(200)],
    });
    const first = await PostgresSportsWatchRefreshRepository.claimNextTask(
      "2026-10-29T12:00:00.000Z",
    );
    expect(first?.workspaceId).toBe(workspace("lease"));
    await PostgresSportsWatchRefreshRepository.recoverExpiredTasks(
      "2026-10-29T12:03:00.000Z",
    );
    const second = await PostgresSportsWatchRefreshRepository.claimNextTask(
      "2026-10-29T12:03:00.000Z",
    );
    expect(second?.id).toBe(first?.id);
    expect(second?.leaseToken).not.toBe(first?.leaseToken);
    await expect(PostgresSportsWatchRefreshRepository.completeTask(
      first!,
      successfulResult(first!),
    )).rejects.toThrow("lease");
    const runningRows = await sql.query(`
      SELECT status, lease_token::text AS lease_token, attempt_count
      FROM sports_watch_refresh_tasks
      WHERE id = $1::uuid
    `, [first!.id]) as Array<{
      status: string;
      lease_token: string;
      attempt_count: number;
    }>;
    expect(runningRows[0]).toEqual({
      status: "running",
      lease_token: second!.leaseToken,
      attempt_count: 2,
    });
    await PostgresSportsWatchRefreshRepository.completeTask(
      second!,
      successfulResult(second!),
    );
  });

  it("does not finalize a task whose lease is still legitimate", async () => {
    await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("finalize"),
      scheduledFor: "2026-10-29",
      tasks: [task(300)],
    });
    const claimed = await PostgresSportsWatchRefreshRepository.claimNextTask(
      new Date().toISOString(),
    );
    expect(claimed?.workspaceId).toBe(workspace("finalize"));
    await PostgresSportsWatchRefreshRepository.finalizeDueBatches("2026-10-29");
    const rows = await sql.query(
      "SELECT status FROM sports_watch_refresh_tasks WHERE id = $1::uuid",
      [claimed!.id],
    ) as Array<{ status: string }>;
    expect(rows[0]?.status).toBe("running");
    await PostgresSportsWatchRefreshRepository.completeTask(
      claimed!,
      successfulResult(claimed!),
    );
  });

  it("serializes scheduled work with manual launches", async () => {
    await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("manual-batch"),
      scheduledFor: "2026-10-29",
      tasks: [task(400)],
    });
    const blockedManualRun = await PostgresSportsWatchRepository.startRun({
      workspaceId: workspace("manual-batch"),
      sourceKey: "bc-bulle",
      athleteId: "manual-athlete",
      athleteName: "Athlète manuel",
      clerkUserId: "manual-admin",
      now: new Date().toISOString(),
    });
    expect(blockedManualRun).toBeNull();

    const manualRun = await PostgresSportsWatchRepository.startRun({
      workspaceId: workspace("manual-run"),
      sourceKey: "bc-bulle",
      athleteId: "manual-athlete",
      athleteName: "Athlète manuel",
      clerkUserId: "manual-admin",
      now: new Date().toISOString(),
    });
    expect(manualRun).toBeTruthy();
    const blockedBatch = await PostgresSportsWatchRefreshRepository.createScheduledBatch({
      workspaceId: workspace("manual-run"),
      scheduledFor: "2026-10-29",
      tasks: [task(401)],
    });
    expect(blockedBatch).toBeNull();
    await PostgresSportsWatchRepository.completeRun({
      workspaceId: workspace("manual-run"),
      runId: manualRun!,
      scannedCount: 0,
      recentCount: 0,
      createdCount: 0,
      message: "Fixture terminée.",
    });
  });

  it("keeps an unchanged exploited result in History", async () => {
    const fixture = candidateFixture();
    expect(await PostgresSportsWatchRepository.saveCandidates(
      workspace("history"),
      [fixture],
    )).toBe(1);
    const created = (await PostgresSportsWatchRepository.listCandidates(
      workspace("history"),
    ))[0];
    const validated = await PostgresSportsWatchRepository.reviewCandidate({
      workspaceId: workspace("history"),
      candidateId: created.id,
      status: "validated",
      clerkUserId: "fixture-admin",
      expectedVersion: created.version,
    });
    const exploited = await PostgresSportsWatchRepository.reviewCandidate({
      workspaceId: workspace("history"),
      candidateId: created.id,
      status: "exploited",
      clerkUserId: "fixture-admin",
      expectedVersion: validated!.version,
    });
    expect(await PostgresSportsWatchRepository.saveCandidates(
      workspace("history"),
      [fixture],
    )).toBe(0);

    const candidates = await PostgresSportsWatchRepository.listCandidates(workspace("history"));
    expect(candidates).toEqual([
      expect.objectContaining({
        id: created.id,
        adminStatus: "exploited",
        version: exploited!.version,
      }),
    ]);
    expect(buildSportsWatchCandidateViews(candidates).history).toEqual([
      expect.objectContaining({ id: created.id, adminStatus: "exploited" }),
    ]);
  });
});
