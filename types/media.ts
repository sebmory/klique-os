export type MediaLot = {
  row?: number;
  date: string;
  athlete: string;
  sport: string;
  mediaType: string;
  event: string;
  place: string;
  totalFiles: number;
  vertical: number;
  horizontal: number;
  square: number;
  premiumTotal: number;
  filesUsed: number;
  filesRemaining: number;
  premiumUsed: number;
  premiumRemaining: number;
  favorites: number;
  videos: number;
  source: string;
  driveLink: string;
  lastUse: string;
  associatedContent: string;
  rights: string;
  notes: string;
};

export type NewMediaLot = Omit<
  MediaLot,
  "row" | "filesRemaining" | "premiumRemaining"
>;

export type MediaResponse = {
  media: MediaLot[];
  source: "google-sheets" | "demo";
  message?: string;
};
