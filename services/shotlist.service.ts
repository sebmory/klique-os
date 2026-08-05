import type {
  NewShotListItem,
  ShotListItem,
  ShotListResponse,
  ShotListUpdate,
} from "@/types/shotlist";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Une erreur est survenue.");
  return data as T;
}

export const ShotListService = {
  async list(): Promise<ShotListResponse> {
    const response = await fetch("/api/shotlists", { cache: "no-store" });
    return parseResponse<ShotListResponse>(response);
  },

  async create(item: NewShotListItem): Promise<void> {
    const response = await fetch("/api/shotlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  async update(update: ShotListUpdate): Promise<void> {
    const response = await fetch("/api/shotlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  progress(items: ShotListItem[]): number {
    if (items.length === 0) return 0;
    return Math.round((items.filter((item) => item.done).length / items.length) * 100);
  },
};
