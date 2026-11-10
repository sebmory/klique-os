import type { PublicAthleteDirectoryEntry } from "@/types/athlete";

const externallyHiddenAthleteIds = new Set(["seb-mory"]);

const normalizeAthleteId = (athleteId: unknown): string =>
  String(athleteId ?? "").trim().toLowerCase();

const normalizeText = (value: unknown): string =>
  String(value ?? "").trim().replace(/\s+/g, " ");

const normalizeSearchKey = (value: unknown): string =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

export const isTestAthlete = (athleteId: unknown): boolean =>
  externallyHiddenAthleteIds.has(normalizeAthleteId(athleteId));

export const isAthleteVisibleToExternalRoles = (athleteId: unknown): boolean =>
  !isTestAthlete(athleteId);

export const isPublicDirectoryAthleteStatus = (value: unknown): boolean => {
  const status = normalizeSearchKey(value);
  if (!status || status.includes("prospect") || status.includes("inactif") || status.includes("refuse")) {
    return false;
  }
  return status.includes("actif") || status.includes("membre");
};

export const canViewAthleteById = (
  athleteId: unknown,
  viewer: { role?: string | null; athleteId?: string | null },
): boolean => {
  const normalizedAthleteId = normalizeAthleteId(athleteId);
  if (!isTestAthlete(normalizedAthleteId)) return true;
  if (viewer.role === "admin") return true;
  return viewer.role === "athlete" && normalizeAthleteId(viewer.athleteId) === normalizedAthleteId;
};

export const normalizePublicSportLabel = (value: unknown): string => {
  const label = normalizeText(value);
  const key = normalizeSearchKey(label)
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:football|foot|american football)\s+americain(?:e)?$/.test(key)) return "Football américain";
  if (/^basket(?:ball)?(?:\s+u(?:\s*\d+)?)?$/.test(key)) return "Basketball";
  if (/^(?:foot|football)(?:\s+u(?:\s*\d+)?)?$/.test(key)) return "Football";
  if (key === "badminton") return "Badminton";
  if (key === "tennis") return "Tennis";
  return label;
};

export type PublicSportColorCategory =
  | "field"
  | "court"
  | "combat"
  | "endurance"
  | "water"
  | "other";

export type PublicAthleteCard = {
  slug: string;
  name: string;
  sport: string;
  club: string;
  portrait?: string;
  colorCategory: PublicSportColorCategory;
};

export type PublicAthletePage = PublicAthleteCard & {
  position?: string;
  publicBio: string;
  journey?: string;
  goals?: string[];
  publishedAchievements?: string[];
  publishedFacts?: string[];
};

export type ResolvedPublicAthleteDirectoryEntry = PublicAthleteCard & {
  sourceAthleteId: string;
  publicBio: string;
};

export const slugifyPublicAthleteName = (value: unknown): string =>
  normalizeSearchKey(value)
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const getPublicSportColorCategory = (sport: unknown): PublicSportColorCategory => {
  const key = normalizeSearchKey(sport);
  if (/football|rugby|hockey|baseball/.test(key)) return "field";
  if (/tennis|badminton|basket|volley|padel/.test(key)) return "court";
  if (/judo|boxe|karate|taekwondo|lutte/.test(key)) return "combat";
  if (/natation|surf|voile|aviron/.test(key)) return "water";
  if (/course|athletisme|triathlon|cyclisme|ski/.test(key)) return "endurance";
  return "other";
};

export const isMinimumPublishableAthlete = (
  athlete: PublicAthleteDirectoryEntry,
): boolean =>
  isAthleteVisibleToExternalRoles(athlete.athleteId)
  && Boolean(
    normalizeText(athlete.athleteId)
    && normalizeText(athlete.name)
    && normalizeText(athlete.sport)
    && normalizeText(athlete.club),
  );

const comparePublicEntries = (
  left: PublicAthleteDirectoryEntry,
  right: PublicAthleteDirectoryEntry,
): number =>
  normalizeSearchKey(left.name).localeCompare(normalizeSearchKey(right.name), "fr")
  || normalizeSearchKey(left.sport).localeCompare(normalizeSearchKey(right.sport), "fr")
  || normalizeAthleteId(left.athleteId).localeCompare(normalizeAthleteId(right.athleteId), "fr");

export const resolvePublicAthleteDirectory = (
  entries: readonly PublicAthleteDirectoryEntry[],
): ResolvedPublicAthleteDirectoryEntry[] => {
  const slugCounts = new Map<string, number>();
  return entries
    .filter(isMinimumPublishableAthlete)
    .slice()
    .sort(comparePublicEntries)
    .flatMap((athlete) => {
      const baseSlug = slugifyPublicAthleteName(athlete.name);
      if (!baseSlug) return [];
      const occurrence = (slugCounts.get(baseSlug) ?? 0) + 1;
      slugCounts.set(baseSlug, occurrence);
      return [{
        slug: occurrence === 1 ? baseSlug : `${baseSlug}-${occurrence}`,
        name: normalizeText(athlete.name),
        sport: normalizePublicSportLabel(athlete.sport),
        club: normalizeText(athlete.club),
        ...(normalizeText(athlete.portraitUrl) ? { portrait: normalizeText(athlete.portraitUrl) } : {}),
        colorCategory: getPublicSportColorCategory(athlete.sport),
        sourceAthleteId: normalizeText(athlete.athleteId),
        publicBio: normalizeText(athlete.presentation)
          || `Athlète de ${normalizePublicSportLabel(athlete.sport)} au sein de ${normalizeText(athlete.club)}.`,
      }];
    });
};

export const buildPublicAthleteDirectory = (
  entries: readonly PublicAthleteDirectoryEntry[],
): PublicAthleteCard[] =>
  resolvePublicAthleteDirectory(entries).map((athlete) => ({
    slug: athlete.slug,
    name: athlete.name,
    sport: athlete.sport,
    club: athlete.club,
    ...(athlete.portrait ? { portrait: athlete.portrait } : {}),
    colorCategory: athlete.colorCategory,
  }));

const stableScore = (value: string): number => {
  let score = 2166136261;
  for (const character of value) {
    score ^= character.charCodeAt(0);
    score = Math.imul(score, 16777619);
  }
  return score >>> 0;
};

export const selectFeaturedPublicAthletes = (
  athletes: readonly PublicAthleteCard[],
  limit = 8,
): PublicAthleteCard[] => {
  if (limit <= 0) return [];
  const groups = new Map<string, PublicAthleteCard[]>();
  for (const athlete of athletes) {
    const sportKey = normalizeSearchKey(athlete.sport);
    const group = groups.get(sportKey) ?? [];
    group.push(athlete);
    groups.set(sportKey, group);
  }

  // Sports and members use stable public-data hashes, then one member is taken per
  // sport per round. CRM row order therefore never influences editorial placement.
  const orderedGroups = [...groups.entries()]
    .sort(([left], [right]) => stableScore(left) - stableScore(right) || left.localeCompare(right, "fr"))
    .map(([, group]) =>
      group.slice().sort((left, right) =>
        stableScore(left.slug) - stableScore(right.slug)
        || left.slug.localeCompare(right.slug, "fr")));
  const selected: PublicAthleteCard[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let found = false;
    for (const group of orderedGroups) {
      const athlete = group[round];
      if (!athlete) continue;
      selected.push(athlete);
      found = true;
      if (selected.length === limit) break;
    }
    if (!found) break;
  }
  return selected;
};
