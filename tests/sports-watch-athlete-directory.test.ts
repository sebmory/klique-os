import { describe, expect, it, vi } from "vitest";
import {
  createSportsWatchAthleteDirectory,
  sportsWatchAthleteDirectoryErrorMessage,
} from "@/lib/sports-watch/athlete-directory";
import {
  runSportsWatchRefreshPlan,
  type SportsWatchRefreshTask,
} from "@/lib/sports-watch/refresh";
import type { SportsWatchCollectionSourceKey } from "@/types/sports-watch";

const sourceKeys: SportsWatchCollectionSourceKey[] = [
  "bc-bulle",
  "swiss-badminton",
  "iwwf-wakesurf",
  "kenpokan",
  "safv",
  "bebasket",
  "swiss-basketball",
];

const context = (workspaceId: string, clerkUserId = "admin-1") => ({
  workspaceId,
  clerkUserId,
  accessRole: "admin" as const,
  accessStatus: "active" as const,
});

describe("sports watch athlete directory", () => {
  it("coalesces the authoritative Sheets read for 16 tasks and isolates cache entries", async () => {
    let now = 1_000;
    const load = vi.fn(async () => [{
      athleteId: "athlete-1",
      key: "athlete-1",
      name: "Athlète Test",
      sport: "Basketball",
      club: "Club Test",
      status: "Actif",
    }]);
    const directory = createSportsWatchAthleteDirectory({
      load,
      now: () => now,
      ttlMs: 30_000,
    });
    const tasks: SportsWatchRefreshTask[] = Array.from({ length: 16 }, (_, index) => ({
      sourceKey: sourceKeys[index % sourceKeys.length],
      athleteId: `athlete-${index + 1}`,
      athleteName: `Athlète ${index + 1}`,
    }));

    const executions = await runSportsWatchRefreshPlan(
      tasks,
      async () => directory.resolve(context("workspace-a")),
      { maxConcurrentSources: 3 },
    );

    expect(executions).toHaveLength(16);
    expect(executions.every((execution) => !execution.error)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);

    await directory.resolve(context("workspace-b"));
    await directory.resolve(context("workspace-a", "admin-2"));
    expect(load).toHaveBeenCalledTimes(3);

    now += 30_001;
    await directory.resolve(context("workspace-a"));
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("hides technical Google quota identifiers from Admin errors", () => {
    const message = sportsWatchAthleteDirectoryErrorMessage(
      new Error("Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user'"),
    );

    expect(message).toBe(
      "Le registre CRM des athlètes reçoit trop de demandes. Réessayez dans une minute.",
    );
    expect(message).not.toMatch(/google|quota|read requests|metric/i);
  });
});
