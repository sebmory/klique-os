import type {
  Athlete,
  PublicAthleteDirectoryEntry,
  PublicAthleteProfile,
} from "@/types/athlete";
import type { Partner } from "@/types/partner";

export const LOCAL_INTRODUCTION_WORKSPACE_ID = "intro-workspace-test";
export const LOCAL_INTRODUCTION_ATHLETE_ID = "intro-athlete-test";
export const LOCAL_INTRODUCTION_PARTNER_ID = "intro-partner-test";

export const localIntroductionFixturesEnabled = (): boolean =>
  process.env.NODE_ENV === "development"
  && process.env.KLIQUE_PARTNER_INTRO_LOCAL_FIXTURES === "true";

export const localIntroductionAthlete: Athlete = {
  key: LOCAL_INTRODUCTION_ATHLETE_ID,
  athleteId: LOCAL_INTRODUCTION_ATHLETE_ID,
  name: "Athlète Test KLIQUE",
  initials: "AT",
  sport: "Sport fictif",
  club: "Club Test",
  status: "Actif",
  instagram: "@klique_athlete_test",
  phone: "",
  email: "athlete.intro@example.test",
  nextContact: "",
  notes: "",
  palmares: "Profil entièrement fictif",
  objective: "Valider le parcours local",
  longTerm: "",
  desiredAreas: "",
  lastContact: "",
  nextAction: "",
  followUpNotes: "",
  lastResponseMonthly: "",
  lastResponseWeekly: "",
  lastPublication: "",
  titlesOfMonth: "",
  analysisItems: "",
  plannedContents: "",
  lastPost: "",
  lastStory: "",
  daysWithoutVisibility: 0,
  lastShoot: "",
  media: 0,
  premium: 0,
  coverage: 0,
  tone: "solid",
  heightWeight: "",
  birthDate: "",
  nationality: "Fictive",
  position: "",
  competitionPhoto: false,
  adhesionDate: "",
};

export const localIntroductionAthleteDirectoryEntry: PublicAthleteDirectoryEntry = {
  athleteId: LOCAL_INTRODUCTION_ATHLETE_ID,
  name: localIntroductionAthlete.name,
  sport: localIntroductionAthlete.sport,
  club: localIntroductionAthlete.club,
  city: "Ville Test",
  country: "Suisse",
  portraitUrl: "",
  presentation: "Profil fictif réservé à la validation locale.",
};

export const localIntroductionAthleteProfile: Omit<PublicAthleteProfile, "distinctions"> = {
  name: localIntroductionAthlete.name,
  sport: localIntroductionAthlete.sport,
  club: localIntroductionAthlete.club,
  nationality: localIntroductionAthlete.nationality,
  palmares: localIntroductionAthlete.palmares,
  shortTermGoals: localIntroductionAthlete.objective,
  longTermGoals: localIntroductionAthlete.longTerm,
  city: localIntroductionAthleteDirectoryEntry.city,
  country: localIntroductionAthleteDirectoryEntry.country,
  portraitUrl: "",
  presentation: localIntroductionAthleteDirectoryEntry.presentation,
  journey: "Parcours fictif.",
  goals: "Valider la demande, la réponse et la modération.",
  socialLinks: [{ label: "Instagram", url: localIntroductionAthlete.instagram }],
};

export const localIntroductionPartner: Partner = {
  id: LOCAL_INTRODUCTION_PARTNER_ID,
  name: "Partenaire Test KLIQUE",
  category: "Expert fictif",
  expertKlique: true,
  contact: "Contact Test",
  email: "partner.intro@example.test",
  phone: "",
  website: "",
  instagram: "@klique_partner_test",
  description: "Profil entièrement fictif réservé à la validation locale.",
  benefits: "",
  notes: "",
  status: "Actif",
  athletes: "",
};
