import {
  getAthletesFromGoogleSheets,
  getEcosystemPartnersFrom06Partenaires,
  resolvePartnerReference,
} from "@/lib/google-sheets";
import {
  LOCAL_INTRODUCTION_ATHLETE_ID,
  LOCAL_INTRODUCTION_PARTNER_ID,
  localIntroductionAthlete,
  localIntroductionFixturesEnabled,
  localIntroductionPartner,
} from "@/lib/partner-athlete-introductions/local-fixtures";

export type IntroductionPartnerProfile = {
  active: boolean;
  publicName: string;
};

export type IntroductionAthleteProfile = {
  publicName: string;
  instagram: string;
};

export type PartnerAthleteIntroductionDirectory = {
  resolvePartnerProfile(partnerId: string): Promise<IntroductionPartnerProfile | null>;
  resolveAthleteProfile(athleteId: string): Promise<IntroductionAthleteProfile | null>;
};

export const createPartnerAthleteIntroductionDirectory =
  (): PartnerAthleteIntroductionDirectory => ({
    async resolvePartnerProfile(partnerId) {
      if (localIntroductionFixturesEnabled()) {
        return partnerId === LOCAL_INTRODUCTION_PARTNER_ID
          ? { active: true, publicName: localIntroductionPartner.name }
          : null;
      }
      const partners = await getEcosystemPartnersFrom06Partenaires();
      const partner = resolvePartnerReference(partners, partnerId);
      if (!partner) return null;
      return {
        active: partner.status.trim().toLowerCase() === "actif",
        publicName: partner.name.trim(),
      };
    },
    async resolveAthleteProfile(athleteId) {
      if (localIntroductionFixturesEnabled()) {
        return athleteId === LOCAL_INTRODUCTION_ATHLETE_ID
          ? {
              publicName: localIntroductionAthlete.name,
              instagram: localIntroductionAthlete.instagram,
            }
          : null;
      }
      const normalizedAthleteId = athleteId.trim();
      const athlete = (await getAthletesFromGoogleSheets())
        .find((candidate) => candidate.key === normalizedAthleteId);
      if (!athlete) return null;
      return {
        publicName: athlete.name.trim(),
        instagram: athlete.instagram.trim(),
      };
    },
  });
