export type Production = {
  id: string;
  row?: number;
  date: string;
  type: string;
  athlete: string;
  sport: string;
  lieu: string;
  objectif: string;
  materiel: string;
  photographe: string;
  statut: string;
  nbPhotos: number;
  nbVideos: number;
  importDone: boolean;
  triDone: boolean;
  retoucheDone: boolean;
  exportDone: boolean;
  driveDone: boolean;
  published: boolean;
  raw: Record<string, unknown>;
};

export type ProductionResponse = {
  productions: Production[];
  source: "google-sheets" | "demo";
  message?: string;
};

export type ProductionByIdResponse = {
  production: Production | null;
  source: "google-sheets" | "demo";
  message?: string;
};
