import { describe, expect, it, vi } from "vitest";
import {
  createScheduledSportsWatchRefresh,
} from "@/lib/sports-watch/scheduled-refresh";
import type {
  SportsWatchRefreshRepository,
  SportsWatchRefreshTaskRecord,
} from "@/lib/sports-watch/refresh-repository";
import type { SportsWatchRefreshBatchSummary } from "@/types/sports-watch";

const athlete = (workspaceId: string, status = "Actif") => ({
  key: `${workspaceId}-alice`,
  athleteId: `${workspaceId}-alice`,
  name: `Alice ${workspaceId}`,
  sport: "Badminton",
  club: "BC Bulle",
  status,
});

const createMemoryRepository = () => {
  const batches = new Map<string, {
    id: string;
    workspaceId: string;
    date: string;
    status: SportsWatchRefreshBatchSummary["status"];
    tasks: Array<SportsWatchRefreshTaskRecord & {
      status: "pending" | "running" | "completed" | "failed";
      createdCount: number;
      message: string | null;
    }>;
  }>();
  let sequence = 0;
  const refresh = (batch: (typeof batches extends Map<string, infer T> ? T : never)) => {
    const completed = batch.tasks.filter((task) => task.status === "completed").length;
    const failed = batch.tasks.filter((task) => task.status === "failed").length;
    if (completed + failed !== batch.tasks.length) batch.status = "running";
    else if (failed === 0) batch.status = "completed";
    else if (completed === 0) batch.status = "failed";
    else batch.status = "partial";
  };
  const repository: SportsWatchRefreshRepository = {
    async listEligibleWorkspaceIds() {
      return ["workspace-a", "workspace-b"];
    },
    async createScheduledBatch(input) {
      const key = `${input.workspaceId}:${input.scheduledFor}`;
      const existing = batches.get(key);
      if (existing) return existing.id;
      sequence += 1;
      const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      batches.set(key, {
        id,
        workspaceId: input.workspaceId,
        date: input.scheduledFor,
        status: input.tasks.length === 0 ? "completed" : "running",
        tasks: input.tasks.map((task, index) => ({
          id: `10000000-0000-4000-8000-${String(sequence * 100 + index).padStart(12, "0")}`,
          batchId: id,
          workspaceId: input.workspaceId,
          sourceKey: task.sourceKey,
          leaseToken: `20000000-0000-4000-8000-${String(sequence * 100 + index).padStart(12, "0")}`,
          athlete: task.athlete,
          status: "pending",
          createdCount: 0,
          message: null,
        })),
      });
      return id;
    },
    async createFailedScheduledBatch(input) {
      const key = `${input.workspaceId}:${input.scheduledFor}`;
      if (batches.has(key)) return batches.get(key)!.id;
      sequence += 1;
      const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      batches.set(key, {
        id,
        workspaceId: input.workspaceId,
        date: input.scheduledFor,
        status: "failed",
        tasks: [],
      });
      return id;
    },
    async recoverExpiredTasks() {},
    async claimNextTask() {
      const activeSources = new Set(
        [...batches.values()]
          .flatMap((batch) => batch.tasks)
          .filter((task) => task.status === "running")
          .map((task) => task.sourceKey),
      );
      for (const batch of batches.values()) {
        const task = batch.tasks.find((item) =>
          item.status === "pending" && !activeSources.has(item.sourceKey));
        if (task) {
          task.status = "running";
          return task;
        }
      }
      return null;
    },
    async completeTask(task, result) {
      const batch = [...batches.values()].find((item) => item.id === task.batchId)!;
      const stored = batch.tasks.find((item) => item.id === task.id)!;
      stored.status = "completed";
      stored.createdCount = result.createdCount;
      stored.message = result.message;
      refresh(batch);
    },
    async failTask(task, message) {
      const batch = [...batches.values()].find((item) => item.id === task.batchId)!;
      const stored = batch.tasks.find((item) => item.id === task.id)!;
      stored.status = "failed";
      stored.message = message;
      refresh(batch);
    },
    async finalizeDueBatches() {
      return 0;
    },
    async getLatestBatch() {
      return null;
    },
  };
  return { repository, batches };
};

const activeSwissBinding = (athleteId: string) => ({
  id: `binding-${athleteId}`,
  athleteId,
  officialIdentity: {
    profileUrl: "https://example.com/profile",
    profileUuid: "00000000-0000-4000-8000-000000000001",
    playerId: "1",
    name: "Alice",
    club: "BC Bulle",
  },
  clubComparison: "matching" as const,
  evidence: [],
  verifiedAt: "2026-10-28T00:00:00.000Z",
  confirmedAt: "2026-10-28T00:00:00.000Z",
  active: true,
  disabledAt: null,
  version: 1,
});

describe("scheduled sports watch refresh", () => {
  it("deduplicates daily batches, isolates workspaces and reads CRM once per workspace", async () => {
    const { repository, batches } = createMemoryRepository();
    const loadAthletes = vi.fn(async (identity: { workspaceId: string }) => [
      athlete(identity.workspaceId),
      athlete(`${identity.workspaceId}-inactive`, "Inactif"),
    ]);
    const loadBindings = vi.fn(async (identity: { workspaceId: string }) => ({
      swissBindings: [activeSwissBinding(`${identity.workspaceId}-alice`)],
      iwwfBindings: [],
      safvBindings: [],
      beBasketBindings: [],
      swissBasketballBindings: [],
    }));
    const refresh = createScheduledSportsWatchRefresh({
      repository,
      now: () => new Date("2026-10-28T02:00:00.000Z"),
      loadAthletes,
      loadBindings,
    });

    await refresh.schedule();

    expect(loadAthletes).toHaveBeenCalledTimes(2);
    expect(loadBindings).toHaveBeenCalledTimes(2);
    expect(batches).toHaveLength(2);
    for (const batch of batches.values()) {
      expect(batch.tasks).toHaveLength(2);
      expect(batch.tasks.every((task) => task.workspaceId === batch.workspaceId)).toBe(true);
      expect(batch.tasks.every((task) => !task.athlete.id.includes("inactive"))).toBe(true);
    }

    await refresh.schedule();
    expect(batches).toHaveLength(2);
    expect([...batches.values()].flatMap((batch) => batch.tasks)).toHaveLength(4);
  });

  it("keeps successful source results when another source fails", async () => {
    const { repository, batches } = createMemoryRepository();
    const executeTask = vi.fn(async (task: SportsWatchRefreshTaskRecord) => {
      if (task.sourceKey === "swiss-badminton") throw new Error("Source simulée indisponible");
      return {
        sourceName: "Fixture",
        sourceUrl: "https://example.com",
        message: "1 nouveau résultat.",
        scannedCount: 1,
        recentCount: 1,
        createdCount: 1,
        candidates: [],
      };
    });
    const refresh = createScheduledSportsWatchRefresh({
      repository,
      now: () => new Date("2026-10-28T02:00:00.000Z"),
      loadAthletes: async (identity) => [athlete(identity.workspaceId)],
      loadBindings: async (identity) => ({
        swissBindings: [activeSwissBinding(`${identity.workspaceId}-alice`)],
        iwwfBindings: [],
        safvBindings: [],
        beBasketBindings: [],
        swissBasketballBindings: [],
      }),
      executeTask,
    });

    await refresh.schedule();
    for (let index = 0; index < 5; index += 1) await refresh.work();

    for (const batch of batches.values()) {
      expect(batch.status).toBe("partial");
      expect(batch.tasks).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceKey: "bc-bulle", status: "completed", createdCount: 1 }),
        expect.objectContaining({
          sourceKey: "swiss-badminton",
          status: "failed",
          message: "Source simulée indisponible",
        }),
      ]));
    }
    expect(executeTask).toHaveBeenCalledTimes(4);
  });

  it("processes a representative 16-task batch in parallel by source", async () => {
    const { repository, batches } = createMemoryRepository();
    const sources = [
      "bc-bulle",
      "swiss-badminton",
      "iwwf-wakesurf",
      "kenpokan",
      "safv",
      "bebasket",
      "swiss-basketball",
    ] as const;
    const tasks = Array.from({ length: 16 }, (_, index) => ({
      sourceKey: sources[index % sources.length],
      athlete: {
        id: `athlete-${index + 1}`,
        name: `Athlète ${index + 1}`,
        sport: "Fixture",
        club: "Fixture",
      },
    }));
    await repository.createScheduledBatch({
      workspaceId: "workspace-a",
      scheduledFor: "2026-10-28",
      tasks,
    });
    let active = 0;
    let maximumActive = 0;
    const activeSources = new Set<string>();
    let duplicateSourceConcurrency = false;
    const startedAt = performance.now();
    const refresh = createScheduledSportsWatchRefresh({
      repository,
      now: () => new Date(),
      executeTask: async (task) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (activeSources.has(task.sourceKey)) duplicateSourceConcurrency = true;
        activeSources.add(task.sourceKey);
        await new Promise((resolve) =>
          setTimeout(resolve, 20 + sources.indexOf(task.sourceKey) * 10));
        activeSources.delete(task.sourceKey);
        active -= 1;
        return {
          sourceName: task.sourceKey,
          sourceUrl: "https://example.com",
          message: "Fixture terminée.",
          scannedCount: 1,
          recentCount: 1,
          createdCount: 0,
          candidates: [],
        };
      },
    });

    const result = await refresh.work({
      timeBudgetMs: 2_000,
      minimumRemainingMs: 200,
      maxConcurrentTasks: 3,
    });
    const elapsedMs = performance.now() - startedAt;

    console.info(
      `[sports-watch-simulation] tasks=16 elapsed_ms=${elapsedMs.toFixed(0)} scale=1:100 projected_seconds=${(elapsedMs / 10).toFixed(1)}`,
    );
    expect(result).toMatchObject({
      status: "processed",
      claimedCount: 16,
      completedCount: 16,
      failedCount: 0,
    });
    expect(maximumActive).toBeLessThanOrEqual(3);
    expect(duplicateSourceConcurrency).toBe(false);
    expect([...batches.values()][0].status).toBe("completed");
  });

  it("stops before its budget and leaves unclaimed tasks durable for the next worker", async () => {
    const { repository, batches } = createMemoryRepository();
    await repository.createScheduledBatch({
      workspaceId: "workspace-a",
      scheduledFor: "2026-10-28",
      tasks: Array.from({ length: 10 }, (_, index) => ({
        sourceKey: (["bc-bulle", "kenpokan", "safv"] as const)[index % 3],
        athlete: {
          id: `athlete-${index + 1}`,
          name: `Athlète ${index + 1}`,
          sport: "Fixture",
          club: "Fixture",
        },
      })),
    });
    const refresh = createScheduledSportsWatchRefresh({
      repository,
      now: () => new Date(),
      executeTask: async (task) => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          sourceName: task.sourceKey,
          sourceUrl: "https://example.com",
          message: "Fixture terminée.",
          scannedCount: 1,
          recentCount: 1,
          createdCount: 0,
          candidates: [],
        };
      },
    });

    const first = await refresh.work({
      timeBudgetMs: 120,
      minimumRemainingMs: 40,
      maxConcurrentTasks: 3,
    });
    const pendingAfterFirst = [...batches.values()][0].tasks
      .filter((task) => task.status === "pending").length;

    expect(first.stoppedForBudget).toBe(true);
    expect(first.claimedCount).toBe(3);
    expect(pendingAfterFirst).toBe(7);

    const second = await refresh.work({
      timeBudgetMs: 1_000,
      minimumRemainingMs: 100,
      maxConcurrentTasks: 3,
    });
    expect(second.claimedCount).toBe(7);
    expect([...batches.values()][0].status).toBe("completed");
  });
});
