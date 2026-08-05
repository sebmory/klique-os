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
  importDone: boolean;
  sortDone: boolean;
  retouchDone: boolean;
  exportDone: boolean;
  driveDone: boolean;
  published: boolean;
  notes: string;
};

export type ShootingsResponse = {
  shootings: Shooting[];
  source: "google-sheets" | "demo";
  message?: string;
};

export type NewShooting = Pick<
  Shooting,
  "date" | "athlete" | "sport" | "type" | "place" | "objective" | "photographer"
>;

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
      | "importDone"
      | "sortDone"
      | "retouchDone"
      | "exportDone"
      | "driveDone"
      | "published"
      | "notes"
    >
  >;
