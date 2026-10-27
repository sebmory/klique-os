import {
  isAthleteAutomaticallyCoveredByWatchSource,
} from "@/lib/sports-watch/sport";
import type { SportsWatchCollectionSourceKey } from "@/types/sports-watch";

export type SportsWatchRefreshAthlete = {
  key: string;
  athleteId?: string;
  name: string;
  sport: string;
  club: string;
  status: string;
};

type SportsWatchRefreshBinding = {
  athleteId: string;
  active: boolean;
};

export type SportsWatchRefreshTask = {
  sourceKey: SportsWatchCollectionSourceKey;
  athleteId: string;
  athleteName: string;
};

export type SportsWatchRefreshPlanInput = {
  athletes: readonly SportsWatchRefreshAthlete[];
  swissBindings: readonly SportsWatchRefreshBinding[];
  iwwfBindings: readonly SportsWatchRefreshBinding[];
  safvBindings: readonly SportsWatchRefreshBinding[];
  beBasketBindings: readonly SportsWatchRefreshBinding[];
  swissBasketballBindings: readonly SportsWatchRefreshBinding[];
};

export type SportsWatchRefreshExecution<T> = {
  task: SportsWatchRefreshTask;
  value?: T;
  error?: Error;
};

const sourceOrder: SportsWatchCollectionSourceKey[] = [
  "bc-bulle",
  "swiss-badminton",
  "iwwf-wakesurf",
  "kenpokan",
  "safv",
  "bebasket",
  "swiss-basketball",
];

const normalize = (value: unknown): string => String(value ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const athleteId = (athlete: SportsWatchRefreshAthlete): string =>
  athlete.athleteId?.trim() || athlete.key.trim();

export const buildSportsWatchRefreshTasks = (
  input: SportsWatchRefreshPlanInput,
): SportsWatchRefreshTask[] => {
  const activeAthletes = input.athletes.filter((athlete) =>
    ["actif", "active"].includes(normalize(athlete.status)));
  const athletesById = new Map(activeAthletes.map((athlete) => [athleteId(athlete), athlete]));
  const tasks = new Map<string, SportsWatchRefreshTask>();
  const addTask = (sourceKey: SportsWatchCollectionSourceKey, id: string) => {
    const athlete = athletesById.get(id);
    if (!athlete || !id) return;
    tasks.set(`${sourceKey}:${id}`, {
      sourceKey,
      athleteId: id,
      athleteName: athlete.name,
    });
  };

  for (const athlete of activeAthletes) {
    const id = athleteId(athlete);
    if (isAthleteAutomaticallyCoveredByWatchSource(athlete.sport, athlete.club, "bc-bulle")) {
      addTask("bc-bulle", id);
    }
    if (isAthleteAutomaticallyCoveredByWatchSource(athlete.sport, athlete.club, "kenpokan")) {
      addTask("kenpokan", id);
    }
  }

  const addActiveBindings = (
    sourceKey: SportsWatchCollectionSourceKey,
    bindings: readonly SportsWatchRefreshBinding[],
  ) => {
    for (const binding of bindings) {
      if (binding.active) addTask(sourceKey, binding.athleteId);
    }
  };
  addActiveBindings("swiss-badminton", input.swissBindings);
  addActiveBindings("iwwf-wakesurf", input.iwwfBindings);
  addActiveBindings("safv", input.safvBindings);
  addActiveBindings("bebasket", input.beBasketBindings);
  addActiveBindings("swiss-basketball", input.swissBasketballBindings);

  return [...tasks.values()].sort((left, right) => {
    const sourceComparison = sourceOrder.indexOf(left.sourceKey) - sourceOrder.indexOf(right.sourceKey);
    return sourceComparison || left.athleteName.localeCompare(right.athleteName, "fr");
  });
};

export const runSportsWatchRefreshPlan = async <T>(
  tasks: readonly SportsWatchRefreshTask[],
  worker: (task: SportsWatchRefreshTask) => Promise<T>,
  options: {
    maxConcurrentSources?: number;
    onSettled?: (
      execution: SportsWatchRefreshExecution<T>,
      completedCount: number,
      totalCount: number,
    ) => void;
  } = {},
): Promise<SportsWatchRefreshExecution<T>[]> => {
  const groups = new Map<SportsWatchCollectionSourceKey, SportsWatchRefreshTask[]>();
  for (const task of tasks) {
    const group = groups.get(task.sourceKey) ?? [];
    group.push(task);
    groups.set(task.sourceKey, group);
  }
  const sourceGroups = [...groups.values()];
  const concurrency = Math.max(
    1,
    Math.min(options.maxConcurrentSources ?? 3, sourceGroups.length || 1),
  );
  const executions: SportsWatchRefreshExecution<T>[] = [];
  let nextGroupIndex = 0;
  let completedCount = 0;

  const processGroups = async () => {
    while (nextGroupIndex < sourceGroups.length) {
      const groupIndex = nextGroupIndex;
      nextGroupIndex += 1;
      for (const task of sourceGroups[groupIndex]) {
        let execution: SportsWatchRefreshExecution<T>;
        try {
          execution = { task, value: await worker(task) };
        } catch (error) {
          execution = {
            task,
            error: error instanceof Error ? error : new Error("La collecte a échoué."),
          };
        }
        executions.push(execution);
        completedCount += 1;
        options.onSettled?.(execution, completedCount, tasks.length);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => processGroups()));
  return executions;
};
