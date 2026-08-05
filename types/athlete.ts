export type Athlete = {
  name: string;
  initials: string;
  sport: string;
  club: string;
  status: string;
  lastShoot: string;
  media: number;
  premium: number;
  coverage: number;
  tone: "solid" | "correct" | "fragile" | "critical";
  instagram: string;
  email: string;
  phone: string;
  nextAction: string;
  objective: string;
  longTerm: string;
};

export type AthletesResponse = {
  athletes: Athlete[];
  source: "google-sheets" | "demo";
  message?: string;
};
