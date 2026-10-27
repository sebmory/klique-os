import { unstable_cache } from "next/cache";
import {
  getSportsWatchAthletesFromGoogleSheets,
  type SportsWatchCrmAthlete,
} from "@/lib/google-sheets";
import type { SportsWatchAdminIdentity } from "@/lib/sports-watch/service";

export const SPORTS_WATCH_ATHLETE_CACHE_TTL_MS = 30_000;

type SportsWatchAthleteDirectoryContext = SportsWatchAdminIdentity & {
  accessRole: "admin";
  accessStatus: "active";
};

type SportsWatchAthleteDirectoryOptions = {
  load: (context: SportsWatchAthleteDirectoryContext) => Promise<SportsWatchCrmAthlete[]>;
  now?: () => number;
  ttlMs?: number;
};

type CacheEntry = {
  expiresAt: number;
  athletes: SportsWatchCrmAthlete[];
};

const contextKey = (context: SportsWatchAthleteDirectoryContext): string =>
  [
    context.workspaceId,
    context.accessRole,
    context.accessStatus,
    context.clerkUserId,
  ].join(":");

export const createSportsWatchAthleteDirectory = (
  options: SportsWatchAthleteDirectoryOptions,
) => {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? SPORTS_WATCH_ATHLETE_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<SportsWatchCrmAthlete[]>>();

  return {
    async resolve(
      context: SportsWatchAthleteDirectoryContext,
    ): Promise<SportsWatchCrmAthlete[]> {
      const key = contextKey(context);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return cached.athletes;
      if (cached) cache.delete(key);
      const pending = inFlight.get(key);
      if (pending) return pending;

      const request = options.load(context)
        .then((athletes) => {
          cache.set(key, { athletes, expiresAt: now() + ttlMs });
          return athletes;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, request);
      return request;
    },
  };
};

const loadSharedSportsWatchAthletes = unstable_cache(
  async (
    workspaceId: string,
    accessRole: "admin",
    accessStatus: "active",
    clerkUserId: string,
  ) => {
    void workspaceId;
    void accessRole;
    void accessStatus;
    void clerkUserId;
    return getSportsWatchAthletesFromGoogleSheets();
  },
  ["sports-watch-authoritative-athlete-directory-v1"],
  { revalidate: SPORTS_WATCH_ATHLETE_CACHE_TTL_MS / 1000 },
);

export const SportsWatchAthleteDirectory = createSportsWatchAthleteDirectory({
  load: (context) => loadSharedSportsWatchAthletes(
    context.workspaceId,
    context.accessRole,
    context.accessStatus,
    context.clerkUserId,
  ),
});

export const sportsWatchAthleteDirectoryErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/quota|resource[_ -]?exhausted|read requests per minute|rate limit|429/i.test(message)) {
    return "Le registre CRM des athlètes reçoit trop de demandes. Réessayez dans une minute.";
  }
  return "Le registre CRM des athlètes est temporairement indisponible.";
};
