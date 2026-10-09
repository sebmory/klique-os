import { unstable_cache } from "next/cache";
import { CreativeProfileRepository } from "@/lib/creatives/repository";
import { getAthletesFromGoogleSheets, getEcosystemPartnersFrom06Partenaires } from "@/lib/google-sheets";
import {
  PUBLIC_KLIQUE_STATS_CACHE_TAG,
  PUBLIC_KLIQUE_STATS_WORKSPACE_ID,
} from "@/lib/public-klique-stats-cache";
import {
  isAthleteVisibleToExternalRoles,
  isPublicDirectoryAthleteStatus,
  normalizePublicSportLabel,
} from "@/lib/public-athletes";
import type { Athlete } from "@/types/athlete";
import type { Partner } from "@/types/partner";

export type PublicKliqueStats = {
  athleteCount: number;
  partnerExpertCount: number;
  sportCount: number;
  creativeCount: number;
};

type StatsAthlete = Pick<Athlete, "row" | "athleteId" | "name" | "sport" | "status">;
type StatsPartner = Pick<Partner, "row" | "name" | "status" | "relationType" | "type" | "expertKlique">
  & { category?: Partner["category"] };

type PublicKliqueStatsDependencies = {
  getAthletes: () => Promise<StatsAthlete[]>;
  getPartners: () => Promise<StatsPartner[]>;
  countActiveCreatives: (workspaceId: string) => Promise<number>;
};

const normalize = (value: unknown): string => String(value ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr");

const isCanonicalPublicAthlete = (athlete: StatsAthlete): boolean =>
  typeof athlete.row === "number"
  && athlete.row > 0
  && Boolean(athlete.name.trim())
  && isPublicDirectoryAthleteStatus(athlete.status)
  && isAthleteVisibleToExternalRoles(athlete.athleteId);

const isCanonicalActivePartnerExpert = (partner: StatsPartner): boolean => {
  if (typeof partner.row !== "number" || partner.row <= 0 || !partner.name.trim()) return false;
  if (normalize(partner.status) !== "actif") return false;
  if (normalize(partner.category) === "test") return false;
  const relationType = normalize(partner.relationType ?? partner.type);
  return partner.expertKlique || relationType.includes("partenaire") || relationType.includes("expert");
};

export const calculatePublicKliqueStats = (
  athletes: readonly StatsAthlete[],
  partners: readonly StatsPartner[],
  creativeCount = 0,
): PublicKliqueStats => {
  if (!Number.isSafeInteger(creativeCount) || creativeCount < 0) {
    throw new Error("Le compteur public des creatifs est invalide.");
  }
  const publicAthletes = athletes.filter(isCanonicalPublicAthlete);
  const normalizedSports = new Set(
    publicAthletes
      .map((athlete) => normalizePublicSportLabel(athlete.sport))
      .map(normalize)
      .filter(Boolean),
  );

  return {
    athleteCount: publicAthletes.length,
    partnerExpertCount: partners.filter(isCanonicalActivePartnerExpert).length,
    sportCount: normalizedSports.size,
    creativeCount,
  };
};

const defaultDependencies: PublicKliqueStatsDependencies = {
  getAthletes: getAthletesFromGoogleSheets,
  getPartners: getEcosystemPartnersFrom06Partenaires,
  countActiveCreatives: CreativeProfileRepository.countActive.bind(CreativeProfileRepository),
};

export const loadPublicKliqueStats = async (
  dependencies: PublicKliqueStatsDependencies = defaultDependencies,
): Promise<PublicKliqueStats> => {
  const [athletes, partners, creativeCount] = await Promise.all([
    dependencies.getAthletes(),
    dependencies.getPartners(),
    dependencies.countActiveCreatives(PUBLIC_KLIQUE_STATS_WORKSPACE_ID),
  ]);
  return calculatePublicKliqueStats(athletes, partners, creativeCount);
};

export const loadCachedPublicKliqueStats = unstable_cache(
  loadPublicKliqueStats,
  ["public-klique-stats-v2"],
  { revalidate: 900, tags: [PUBLIC_KLIQUE_STATS_CACHE_TAG] },
);