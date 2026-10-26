export const SPORTS_WATCH_ENABLED_VALUE = "true";

export const isSportsWatchEnabled = (
  value: string | undefined = process.env.KLIQUE_SPORTS_WATCH_ENABLED,
): boolean => value === SPORTS_WATCH_ENABLED_VALUE;
