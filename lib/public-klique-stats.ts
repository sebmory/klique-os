import { unstable_cache } from "next/cache";
import { getAthletesFromGoogleSheets, getEcosystemPartnersFrom06Partenaires } from "@/lib/google-sheets";
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
};

type StatsAthlete = Pick<Athlete, "row" | "athleteId" | "name" | "sport" | "status">;
type StatsPartner = Pick<Partner, "row" | "name" | "status" | "relationType" | "type" | "expertKlique">;

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
  const relationType = normalize(partner.relationType ?? partner.type);
  return partner.expertKlique || relationType.includes("partenaire") || relationType.includes("expert");
};

export const calculatePublicKliqueStats = (
  athletes: readonly StatsAthlete[],
  partners: readonly StatsPartner[],
): PublicKliqueStats => {
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
  };
};

export const loadPublicKliqueStats = async (): Promise<PublicKliqueStats> => {
  const [athletes, partners] = await Promise.all([
    getAthletesFromGoogleSheets(),
    getEcosystemPartnersFrom06Partenaires(),
  ]);
  return calculatePublicKliqueStats(athletes, partners);
};

export const loadCachedPublicKliqueStats = unstable_cache(
  loadPublicKliqueStats,
  ["public-klique-stats-v1"],
  { revalidate: 900, tags: ["public-klique-stats"] },
);