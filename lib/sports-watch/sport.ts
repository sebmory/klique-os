import type { SportsWatchCollectionSourceKey } from "@/types/sports-watch";

export const normalizeSportsWatchSport = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const isSportCompatibleWithWatchSource = (
  sport: string,
  sourceKey: SportsWatchCollectionSourceKey,
): boolean => {
  const normalized = normalizeSportsWatchSport(sport);
  if (sourceKey === "bc-bulle" || sourceKey === "swiss-badminton") {
    return normalized.includes("badminton");
  }
  if (sourceKey === "iwwf-wakesurf") {
    return normalized.includes("wakesurf") || normalized.includes("wake surf");
  }
  if (sourceKey === "kenpokan") {
    return normalized.includes("kempo");
  }
  if (sourceKey === "bebasket") {
    return normalized.includes("basket");
  }
  return [
    "football americain",
    "foot americain",
    "football us",
    "foot us",
    "american football",
  ].some((label) => normalized.includes(label));
};
