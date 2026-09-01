export type WeeklyFormResponse = {
  timestamp: string;
  competition: string;
  result: string;
  notableEvent: string;
  notableEventExplanation: string;
  media: string;
  mediaLink: string;
  appointment: string;
  quickContact: string;
  quickContactReason: string;
  contactRequested: boolean;
};

export type MonthlyFormResponse = {
  timestamp: string;
  importantDates: string;
  mainObjective: string;
  plannedNews: string;
  opportunityOrNeed: string;
  momentToCover: string;
  additionalNote: string;
};

export type Athlete = {
  row?: number;
  athleteId?: string;
  profilePortraitUrl?: string;
  kliqueArrivalVisualUrl?: string;
  profilePortraitScale?: number;
  profilePortraitX?: number;
  profilePortraitY?: number;
  key: string;
  name: string;
  initials: string;
  sport: string;
  club: string;
  status: string;
  instagram: string;
  phone: string;
  email: string;
  nextContact: string;
  notes: string;
  palmares: string;
  objective: string;
  longTerm: string;
  desiredAreas: string;
  lastContact: string;
  nextAction: string;
  followUpNotes: string;
  lastResponseMonthly: string;
  lastResponseWeekly: string;
  importantRendezVousThisWeek?: string;
  weeklyFormResponse?: WeeklyFormResponse;
  monthlyFormResponse?: MonthlyFormResponse;
  lastPublication: string;
  titlesOfMonth: string;
  analysisItems: string;
  plannedContents: string;
  lastPost: string;
  lastStory: string;
  daysWithoutVisibility: number;
  lastShoot: string;
  media: number;
  premium: number;
  coverage: number;
  tone: "solid" | "correct" | "fragile" | "critical";
  heightWeight: string;
  birthDate: string;
  nationality: string;
  position: string;
  competitionPhoto: boolean;
  adhesionDate: string;
};

export type AthleteUpdate = Pick<Athlete, "row"> &
  Partial<
    Pick<
      Athlete,
      | "name"
      | "sport"
      | "club"
      | "status"
      | "instagram"
      | "phone"
      | "email"
      | "nextContact"
      | "notes"
      | "palmares"
      | "objective"
      | "longTerm"
      | "desiredAreas"
      | "lastContact"
      | "nextAction"
      | "followUpNotes"
      | "lastResponseMonthly"
      | "lastResponseWeekly"
      | "importantRendezVousThisWeek"
      | "lastPublication"
      | "titlesOfMonth"
      | "analysisItems"
      | "plannedContents"
      | "lastPost"
      | "lastStory"
      | "daysWithoutVisibility"
      | "lastShoot"
      | "media"
      | "premium"
      | "coverage"
    >
  >;

export type AthletesResponse = {
  athletes: Athlete[];
  source: "google-sheets" | "demo";
  message?: string;
};

export type PublicAthleteDirectoryEntry = {
  athleteId: string;
  name: string;
  sport: string;
  club: string;
  city: string;
  country: string;
  portraitUrl: string;
  presentation: string;
};

export type PublicAthleteDistinction = {
  type: string;
  awardMonth: number;
  awardYear: number;
  description: string;
};

export type PublicAthleteSocialLink = {
  label: string;
  url: string;
};

export type PublicAthleteProfile = {
  name: string;
  sport: string;
  club: string;
  portraitUrl: string;
  presentation: string;
  journey: string;
  goals: string;
  distinctions: PublicAthleteDistinction[];
  socialLinks: PublicAthleteSocialLink[];
};
