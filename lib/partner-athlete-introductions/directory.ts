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

export type CanonicalProfileResolution<T> =
  | { outcome: "resolved"; profile: T }
  | { outcome: "missing" | "ambiguous"; profile: null };

export type PartnerAthleteIntroductionDirectory = {
  resolvePartnerProfile(partnerId: string): Promise<IntroductionPartnerProfile | null>;
  resolveAthleteProfile(athleteId: string): Promise<IntroductionAthleteProfile | null>;
  resolveCanonicalPartnerProfile(
    partnerId: string,
  ): Promise<CanonicalProfileResolution<IntroductionPartnerProfile>>;
  resolveCanonicalAthleteProfile(
    athleteId: string,
  ): Promise<CanonicalProfileResolution<IntroductionAthleteProfile>>;
};

export const createPartnerAthleteIntroductionDirectory =
  (): PartnerAthleteIntroductionDirectory => {
    let partnersPromise: ReturnType<typeof getEcosystemPartnersFrom06Partenaires> | null = null;
    let athletesPromise: ReturnType<typeof getAthletesFromGoogleSheets> | null = null;
    const loadPartners = () => {
      partnersPromise ??= getEcosystemPartnersFrom06Partenaires();
      return partnersPromise;
    };
    const loadAthletes = () => {
      athletesPromise ??= getAthletesFromGoogleSheets();
      return athletesPromise;
    };

    return {
    async resolvePartnerProfile(partnerId) {
      if (localIntroductionFixturesEnabled()) {
        return partnerId === LOCAL_INTRODUCTION_PARTNER_ID
          ? { active: true, publicName: localIntroductionPartner.name }
          : null;
      }
      const partners = await loadPartners();
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
      const athlete = (await loadAthletes())
        .find((candidate) => candidate.key === normalizedAthleteId);
      if (!athlete) return null;
      return {
        publicName: athlete.name.trim(),
        instagram: athlete.instagram.trim(),
      };
    },
    async resolveCanonicalPartnerProfile(partnerId) {
      if (localIntroductionFixturesEnabled()) {
        return partnerId === LOCAL_INTRODUCTION_PARTNER_ID
          ? {
              outcome: "resolved",
              profile: { active: true, publicName: localIntroductionPartner.name },
            }
          : { outcome: "missing", profile: null };
      }
      const matches = (await loadPartners())
        .filter((partner) => partner.id.trim() === partnerId.trim());
      if (matches.length === 0) return { outcome: "missing", profile: null };
      if (matches.length > 1) return { outcome: "ambiguous", profile: null };
      return {
        outcome: "resolved",
        profile: {
          active: matches[0].status.trim().toLowerCase() === "actif",
          publicName: matches[0].name.trim(),
        },
      };
    },
    async resolveCanonicalAthleteProfile(athleteId) {
      if (localIntroductionFixturesEnabled()) {
        return athleteId === LOCAL_INTRODUCTION_ATHLETE_ID
          ? {
              outcome: "resolved",
              profile: {
                publicName: localIntroductionAthlete.name,
                instagram: localIntroductionAthlete.instagram,
              },
            }
          : { outcome: "missing", profile: null };
      }
      const matches = (await loadAthletes())
        .filter((athlete) => athlete.key.trim() === athleteId.trim());
      if (matches.length === 0) return { outcome: "missing", profile: null };
      if (matches.length > 1) return { outcome: "ambiguous", profile: null };
      return {
        outcome: "resolved",
        profile: {
          publicName: matches[0].name.trim(),
          instagram: matches[0].instagram.trim(),
        },
      };
    },
  };
  };
