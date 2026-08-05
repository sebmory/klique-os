export type Shooting = {
  row?: number;
  date: string;
  athlete: string;
  sport: string;
  type: string;
  place: string;
  objective: string;
  photographer: string;
  status: string;
  photos: number;
  videos: number;
  lightroomLink: string;
  driveLink: string;
  clientGalleryLink: string;
  instagramLink: string;
  shootingDone: boolean;
  importDone: boolean;
  backupDone: boolean;
  sortDone: boolean;
  retouchDone: boolean;
  exportDone: boolean;
  driveDone: boolean;
  publishedInstagram: boolean;
  publishedFacebook: boolean;
  publishedLinkedIn: boolean;
  published: boolean;
  deliverableClub: boolean;
  deliverableAthlete: boolean;
  deliverableSponsor: boolean;
  deliverableMedia: boolean;
  deliverableAgency: boolean;
  deliverableOther: boolean;
  notes: string;
};

export type ShootingsResponse = {
  shootings: Shooting[];
  source: "google-sheets" | "demo";
  message?: string;
};

export type NewShooting = Omit<Shooting, "row">;

export type ShootingUpdate = Pick<Shooting, "row"> &
  Partial<
    Pick<
      Shooting,
      | "date"
      | "athlete"
      | "sport"
      | "type"
      | "place"
      | "objective"
      | "photographer"
      | "status"
      | "photos"
      | "videos"
      | "lightroomLink"
      | "driveLink"
      | "clientGalleryLink"
      | "instagramLink"
      | "shootingDone"
      | "importDone"
      | "backupDone"
      | "sortDone"
      | "retouchDone"
      | "exportDone"
      | "driveDone"
      | "publishedInstagram"
      | "publishedFacebook"
      | "publishedLinkedIn"
      | "published"
      | "deliverableClub"
      | "deliverableAthlete"
      | "deliverableSponsor"
      | "deliverableMedia"
      | "deliverableAgency"
      | "deliverableOther"
      | "notes"
    >
  >;
