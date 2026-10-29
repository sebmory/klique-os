import type { SportsWatchCrmAthlete } from "@/lib/google-sheets";
import {
  localAdminFixtureAthletes,
  localIntroductionFixturesEnabled,
} from "@/lib/partner-athlete-introductions/local-fixtures";
import { SportsWatchAthleteDirectory } from "@/lib/sports-watch/athlete-directory";
import {
  PostgresSportsWatchRefreshRepository,
  type SportsWatchRefreshRepository,
  type SportsWatchRefreshTaskInput,
} from "@/lib/sports-watch/refresh-repository";
import { buildSportsWatchRefreshTasks } from "@/lib/sports-watch/refresh";
import {
  SportsWatchService,
  type SportsWatchAdminIdentity,
} from "@/lib/sports-watch/service";
import type {
  BeBasketBinding,
  IwwfBinding,
  SafvBinding,
  SwissBasketballBinding,
  SwissBadmintonBinding,
} from "@/types/sports-watch";

const SCHEDULED_ACTOR = "sports-watch-scheduled-refresh";

type BindingSnapshot = {
  swissBindings: SwissBadmintonBinding[];
  iwwfBindings: IwwfBinding[];
  safvBindings: SafvBinding[];
  beBasketBindings: BeBasketBinding[];
  swissBasketballBindings: SwissBasketballBinding[];
};

type ScheduledRefreshDependencies = {
  repository: SportsWatchRefreshRepository;
  now: () => Date;
  nowMs: () => number;
  loadAthletes: (identity: SportsWatchAdminIdentity) => Promise<SportsWatchCrmAthlete[]>;
  loadBindings: (identity: SportsWatchAdminIdentity) => Promise<BindingSnapshot>;
  executeTask: (
    task: Awaited<ReturnType<SportsWatchRefreshRepository["claimNextTask"]>> & {},
    identity: SportsWatchAdminIdentity,
  ) => ReturnType<typeof SportsWatchService.run>;
};

const defaultDependencies: ScheduledRefreshDependencies = {
  repository: PostgresSportsWatchRefreshRepository,
  now: () => new Date(),
  nowMs: () => Date.now(),
  loadAthletes: (identity) => localIntroductionFixturesEnabled()
    ? Promise.resolve(localAdminFixtureAthletes())
    : SportsWatchAthleteDirectory.resolve({
        ...identity,
        accessRole: "admin",
        accessStatus: "active",
      }),
  loadBindings: async (identity) => {
    const [
      swissBindings,
      iwwfBindings,
      safvBindings,
      beBasketBindings,
      swissBasketballBindings,
    ] = await Promise.all([
      SportsWatchService.listSwissBindings(identity),
      SportsWatchService.listIwwfBindings(identity),
      SportsWatchService.listSafvBindings(identity),
      SportsWatchService.listBeBasketBindings(identity),
      SportsWatchService.listSwissBasketballBindings(identity),
    ]);
    return {
      swissBindings,
      iwwfBindings,
      safvBindings,
      beBasketBindings,
      swissBasketballBindings,
    };
  },
  executeTask: (task, identity) => SportsWatchService.run(
    task.sourceKey,
    task.athlete.id,
    identity,
    {
      preparedAthlete: task.athlete,
      refreshBatchId: task.batchId,
    },
  ),
};

const utcDate = (date: Date): string => date.toISOString().slice(0, 10);

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export const createScheduledSportsWatchRefresh = (
  overrides: Partial<ScheduledRefreshDependencies> = {},
) => {
  const dependencies = { ...defaultDependencies, ...overrides };

  const schedule = async () => {
    const scheduledFor = utcDate(dependencies.now());
    const workspaceIds = await dependencies.repository.listEligibleWorkspaceIds();
    const results: Array<{ workspaceId: string; batchId: string | null; error?: string }> = [];
    for (const workspaceId of workspaceIds) {
      const identity = { workspaceId, clerkUserId: SCHEDULED_ACTOR };
      try {
        const [athletes, bindings] = await Promise.all([
          dependencies.loadAthletes(identity),
          dependencies.loadBindings(identity),
        ]);
        const athleteById = new Map(athletes.map((athlete) => [
          athlete.athleteId?.trim() || athlete.key.trim(),
          athlete,
        ]));
        const tasks: SportsWatchRefreshTaskInput[] = buildSportsWatchRefreshTasks({
          athletes,
          ...bindings,
        }).flatMap((task) => {
          const athlete = athleteById.get(task.athleteId);
          if (!athlete) return [];
          return [{
            sourceKey: task.sourceKey,
            athlete: {
              id: task.athleteId,
              name: athlete.name.trim(),
              sport: athlete.sport.trim(),
              club: athlete.club.trim(),
            },
          }];
        });
        const batchId = await dependencies.repository.createScheduledBatch({
          workspaceId,
          scheduledFor,
          tasks,
        });
        results.push({ workspaceId, batchId });
      } catch (error) {
        const message = errorMessage(
          error,
          "La préparation de l’actualisation quotidienne a échoué.",
        );
        const batchId = await dependencies.repository.createFailedScheduledBatch({
          workspaceId,
          scheduledFor,
          message,
        });
        results.push({ workspaceId, batchId, error: message });
      }
    }
    return results;
  };

  const work = async (options: {
    timeBudgetMs?: number;
    minimumRemainingMs?: number;
    maxConcurrentTasks?: number;
  } = {}) => {
    const timeBudgetMs = options.timeBudgetMs ?? 240_000;
    const minimumRemainingMs = options.minimumRemainingMs ?? 45_000;
    const maxConcurrentTasks = Math.max(1, Math.min(options.maxConcurrentTasks ?? 3, 3));
    const deadline = dependencies.nowMs() + timeBudgetMs;
    const now = dependencies.now().toISOString();
    await dependencies.repository.recoverExpiredTasks(now);
    let completedCount = 0;
    let failedCount = 0;
    let claimedCount = 0;

    const processTasks = async () => {
      while (dependencies.nowMs() <= deadline - minimumRemainingMs) {
        const task = await dependencies.repository.claimNextTask(
          dependencies.now().toISOString(),
        );
        if (!task) return;
        claimedCount += 1;
        const identity = {
          workspaceId: task.workspaceId,
          clerkUserId: SCHEDULED_ACTOR,
        };
        try {
          const result = await dependencies.executeTask(task, identity);
          await dependencies.repository.completeTask(task, result);
          completedCount += 1;
        } catch (error) {
          const message = errorMessage(error, "La collecte planifiée a échoué.");
          await dependencies.repository.failTask(task, message);
          failedCount += 1;
        }
      }
    };

    await Promise.all(
      Array.from({ length: maxConcurrentTasks }, () => processTasks()),
    );
    return {
      status: claimedCount === 0 ? "idle" as const : "processed" as const,
      claimedCount,
      completedCount,
      failedCount,
      stoppedForBudget: dependencies.nowMs() > deadline - minimumRemainingMs,
    };
  };

  const finalize = () =>
    dependencies.repository.finalizeDueBatches(utcDate(dependencies.now()));

  return { schedule, work, finalize };
};

export const ScheduledSportsWatchRefresh = createScheduledSportsWatchRefresh();
