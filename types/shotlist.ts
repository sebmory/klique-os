export type ShotListItem = {
  row?: number;
  id: string;
  shootingRow?: number;
  athlete: string;
  sport: string;
  shootingTitle: string;
  category: string;
  title: string;
  priority: "Faible" | "Moyenne" | "Haute" | "Urgente";
  done: boolean;
  notes: string;
  order: number;
};

export type NewShotListItem = Omit<ShotListItem, "row" | "id">;

export type ShotListUpdate = Pick<ShotListItem, "row"> &
  Partial<
    Pick<
      ShotListItem,
      "category" | "title" | "priority" | "done" | "notes" | "order"
    >
  >;

export type ShotListResponse = {
  items: ShotListItem[];
  source: "google-sheets" | "demo";
  message?: string;
};
