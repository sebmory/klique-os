import { cache } from "react";
import {
  getEditorialAthleteProjectionFromGoogleSheets,
  getPublicAthleteDirectoryFromGoogleSheets,
  getPublicAthleteProfileFromGoogleSheets,
} from "@/lib/google-sheets";
import {
  buildPublicAthleteDirectory,
  resolvePublicAthleteDirectory,
  slugifyPublicAthleteName,
  type PublicAthleteCard,
  type PublicAthletePage,
} from "@/lib/public-athletes";
import type { PublicAthleteDirectoryEntry, PublicAthleteProfile } from "@/types/athlete";
import type { EditorialAthleteProjection } from "@/types/editorial-athlete";

type PublicAthleteSources = {
  listDirectory: () => Promise<PublicAthleteDirectoryEntry[]>;
  getProfile: (athleteId: string) => Promise<Omit<PublicAthleteProfile, "distinctions"> | null>;
  getEditorialProjection: (
    athleteId: string,
    role: "media",
  ) => Promise<EditorialAthleteProjection | null>;
};

const defaultSources: PublicAthleteSources = {
  listDirectory: getPublicAthleteDirectoryFromGoogleSheets,
  getProfile: getPublicAthleteProfileFromGoogleSheets,
  getEditorialProjection: getEditorialAthleteProjectionFromGoogleSheets,
};

const normalizeText = (value: unknown): string =>
  String(value ?? "").trim().replace(/\s+/g, " ");

const splitPublishedText = (value: string | undefined): string[] =>
  String(value ?? "")
    .split(/\r?\n|;/)
    .map(normalizeText)
    .filter(Boolean);

export const listPublicAthletes = async (
  sources: PublicAthleteSources = defaultSources,
): Promise<PublicAthleteCard[]> =>
  buildPublicAthleteDirectory(await sources.listDirectory());

export const getPublicAthleteBySlug = async (
  requestedSlug: string,
  sources: PublicAthleteSources = defaultSources,
): Promise<PublicAthletePage | null> => {
  const slug = slugifyPublicAthleteName(requestedSlug);
  if (!slug || slug !== requestedSlug) return null;
  const athlete = resolvePublicAthleteDirectory(await sources.listDirectory())
    .find((candidate) => candidate.slug === slug);
  if (!athlete) return null;

  const [profile, editorial] = await Promise.all([
    sources.getProfile(athlete.sourceAthleteId),
    sources.getEditorialProjection(athlete.sourceAthleteId, "media"),
  ]);
  if (!profile) return null;

  const goals = [
    ...splitPublishedText(profile.goals),
    ...(editorial?.communicationObjectives ?? []).map(normalizeText).filter(Boolean),
  ];
  const achievements = splitPublishedText(editorial?.palmares);
  const facts = (editorial?.publishedFacts ?? []).map(normalizeText).filter(Boolean);
  return {
    slug: athlete.slug,
    name: athlete.name,
    sport: athlete.sport,
    club: athlete.club,
    ...(athlete.portrait ? { portrait: athlete.portrait } : {}),
    colorCategory: athlete.colorCategory,
    ...(normalizeText(editorial?.position) ? { position: normalizeText(editorial?.position) } : {}),
    publicBio: athlete.publicBio,
    ...(normalizeText(profile.journey) ? { journey: normalizeText(profile.journey) } : {}),
    ...(goals.length ? { goals: [...new Set(goals)] } : {}),
    ...(achievements.length ? { publishedAchievements: achievements } : {}),
    ...(facts.length ? { publishedFacts: [...new Set(facts)] } : {}),
  };
};

export const getCachedPublicAthleteBySlug = cache(getPublicAthleteBySlug);
