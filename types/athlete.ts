export type Athlete = {
  row?: number;
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
