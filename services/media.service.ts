import type { MediaFilter, MediaLot, MediaResponse, NewMediaLot } from "@/types/media";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return data as T;
}

export const MediaService = {
  async list(): Promise<MediaResponse> {
    const response = await fetch("/api/media", { cache: "no-store" });
    return parseResponse<MediaResponse>(response);
  },

  async create(media: NewMediaLot): Promise<void> {
    const response = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(media),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  filter(media: MediaLot[], filter: MediaFilter): MediaLot[] {
    return media.filter((lot) => {
      const searchable = `${lot.athlete} ${lot.event} ${lot.sport} ${lot.mediaType} ${lot.place}`.toLowerCase();
      const matchesSearch = searchable.includes(filter.search.toLowerCase());
      const matchesSport = filter.sport === "Tous" || lot.sport === filter.sport;

      const matchesOrientation =
        filter.orientation === "Tous" ||
        (filter.orientation === "Vertical" && lot.vertical > 0) ||
        (filter.orientation === "Horizontal" && lot.horizontal > 0) ||
        (filter.orientation === "Carré" && lot.square > 0) ||
        (filter.orientation === "Vidéo" && lot.videos > 0);

      const matchesQuality =
        filter.quality === "Tous" ||
        (filter.quality === "Premium" && lot.premiumRemaining > 0) ||
        (filter.quality === "À renouveler" && lot.premiumRemaining <= 3) ||
        (filter.quality === "Disponible" && lot.filesRemaining > 0);

      return matchesSearch && matchesSport && matchesOrientation && matchesQuality;
    });
  },

  usagePercent(lot: MediaLot): number {
    if (lot.totalFiles <= 0) return 0;
    return Math.min(100, Math.round((lot.filesUsed / lot.totalFiles) * 100));
  },

  health(lot: MediaLot): "solid" | "correct" | "fragile" | "critical" {
    if (lot.premiumRemaining >= 10 && lot.filesRemaining >= 30) return "solid";
    if (lot.premiumRemaining >= 5 && lot.filesRemaining >= 15) return "correct";
    if (lot.premiumRemaining >= 2 && lot.filesRemaining > 0) return "fragile";
    return "critical";
  },
};
