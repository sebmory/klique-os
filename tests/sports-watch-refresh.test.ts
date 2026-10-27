import { describe, expect, it } from "vitest";
import {
  buildSportsWatchRefreshTasks,
  runSportsWatchRefreshPlan,
  type SportsWatchRefreshTask,
} from "@/lib/sports-watch/refresh";

describe("sports watch refresh orchestration", () => {
  it("uses active CRM athletes and bindings without duplicating multi-team collections", () => {
    const tasks = buildSportsWatchRefreshTasks({
      athletes: [
        {
          key: "alice",
          athleteId: "alice",
          name: "Alice Badminton",
          sport: "Badminton",
          club: "BC Bulle",
          status: "Actif",
        },
        {
          key: "bruno",
          athleteId: "bruno",
          name: "Bruno Kempo",
          sport: "Kempo",
          club: "Kenpokan Dojo",
          status: "active",
        },
        {
          key: "mila",
          athleteId: "mila",
          name: "Mila Basket",
          sport: "Basketball",
          club: "Elfic Fribourg",
          status: "Actif",
        },
        {
          key: "inactive",
          athleteId: "inactive",
          name: "Athlète inactif",
          sport: "Badminton",
          club: "BC Bulle",
          status: "Inactif",
        },
        {
          key: "unconfigured",
          athleteId: "unconfigured",
          name: "Basket sans rattachement",
          sport: "Basketball",
          club: "Autre club",
          status: "Actif",
        },
      ],
      swissBindings: [
        { athleteId: "alice", active: true },
        { athleteId: "inactive", active: true },
      ],
      iwwfBindings: [],
      safvBindings: [],
      beBasketBindings: [{ athleteId: "mila", active: true }],
      swissBasketballBindings: [
        { athleteId: "mila", active: true },
        { athleteId: "mila", active: true },
        { athleteId: "mila", active: false },
      ],
    });

    expect(tasks).toEqual([
      { sourceKey: "bc-bulle", athleteId: "alice", athleteName: "Alice Badminton" },
      { sourceKey: "swiss-badminton", athleteId: "alice", athleteName: "Alice Badminton" },
      { sourceKey: "kenpokan", athleteId: "bruno", athleteName: "Bruno Kempo" },
      { sourceKey: "bebasket", athleteId: "mila", athleteName: "Mila Basket" },
      { sourceKey: "swiss-basketball", athleteId: "mila", athleteName: "Mila Basket" },
    ]);
  });

  it("bounds source concurrency, serializes a source and preserves other results after a failure", async () => {
    const tasks: SportsWatchRefreshTask[] = [
      { sourceKey: "bc-bulle", athleteId: "alice", athleteName: "Alice" },
      { sourceKey: "bc-bulle", athleteId: "bruno", athleteName: "Bruno" },
      { sourceKey: "kenpokan", athleteId: "camille", athleteName: "Camille" },
      { sourceKey: "bebasket", athleteId: "diane", athleteName: "Diane" },
    ];
    const activeBySource = new Map<string, number>();
    let active = 0;
    let maximumActive = 0;
    let maximumSameSource = 0;
    const progress: number[] = [];

    const executions = await runSportsWatchRefreshPlan(
      tasks,
      async (task) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const sourceActive = (activeBySource.get(task.sourceKey) ?? 0) + 1;
        activeBySource.set(task.sourceKey, sourceActive);
        maximumSameSource = Math.max(maximumSameSource, sourceActive);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        activeBySource.set(task.sourceKey, sourceActive - 1);
        if (task.athleteId === "camille") throw new Error("Source indisponible");
        return task.athleteId;
      },
      {
        maxConcurrentSources: 2,
        onSettled: (_execution, completed) => progress.push(completed),
      },
    );

    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(maximumSameSource).toBe(1);
    expect(executions).toHaveLength(4);
    expect(executions.filter((execution) => execution.error)).toHaveLength(1);
    expect(executions.filter((execution) => execution.value).map((execution) => execution.value))
      .toEqual(expect.arrayContaining(["alice", "bruno", "diane"]));
    expect(progress).toEqual([1, 2, 3, 4]);
  });
});
