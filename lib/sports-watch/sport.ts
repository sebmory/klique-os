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
  if (sourceKey === "bebasket" || sourceKey === "swiss-basketball") {
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

export const isAthleteAutomaticallyCoveredByWatchSource = (
  sport: string,
  club: string,
  sourceKey: SportsWatchCollectionSourceKey,
): boolean => {
  if (!isSportCompatibleWithWatchSource(sport, sourceKey)) return false;
  const normalizedClub = normalizeSportsWatchSport(club);
  if (sourceKey === "bc-bulle") return normalizedClub.includes("bulle");
  if (sourceKey === "kenpokan") {
    return normalizedClub.includes("kenpokan") || normalizedClub.includes("kenpokan dojo");
  }
  return false;
};
