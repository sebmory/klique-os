export type PlanningStepKey =
  | "departureDone"
  | "arrivalDone"
  | "setupDone"
  | "shootingDone"
  | "selectionDone"
  | "editingDone"
  | "exportDone"
  | "uploadDone"
  | "publicationDone";

export type ShootingPlanning = {
  row?: number;
  id: string;
  shootingRow?: number;
  athlete: string;
  sport: string;
  title: string;
  date: string;
  shootingTime: string;
  place: string;
  travelMinutes: number;
  setupMinutes: number;
  shootingMinutes: number;
  selectionMinutes: number;
  editingMinutes: number;
  exportMinutes: number;
  uploadMinutes: number;
  publicationTime: string;
  status: string;
  notes: string;
  departureDone: boolean;
  arrivalDone: boolean;
  setupDone: boolean;
  shootingDone: boolean;
  selectionDone: boolean;
  editingDone: boolean;
  exportDone: boolean;
  uploadDone: boolean;
  publicationDone: boolean;
};

export type NewShootingPlanning = Omit<ShootingPlanning, "row" | "id">;

export type PlanningUpdate = Pick<ShootingPlanning, "row"> &
  Partial<
    Pick<
      ShootingPlanning,
      | "status"
      | "notes"
      | PlanningStepKey
    >
  >;

export type PlanningResponse = {
  planning: ShootingPlanning[];
  source: "google-sheets" | "demo";
  message?: string;
};
