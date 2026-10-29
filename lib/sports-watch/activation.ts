export const SPORTS_WATCH_ENABLED_VALUE = "true";

export const isSportsWatchEnabled = (
  value: string | undefined = process.env.KLIQUE_SPORTS_WATCH_ENABLED,
): boolean => value === SPORTS_WATCH_ENABLED_VALUE;

export const isScheduledSportsWatchRefreshEnabled = (
  value: string | undefined = process.env.KLIQUE_SPORTS_WATCH_SCHEDULED_ENABLED,
): boolean => value === SPORTS_WATCH_ENABLED_VALUE;
