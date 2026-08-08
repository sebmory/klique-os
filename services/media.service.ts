import type { MediaFilter, MediaLot, MediaResponse, NewMediaLot } from "@/types/media";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return data as T;
}

export const MediaService: {
  list: () => Promise<MediaResponse>;
  create: (media: NewMediaLot) => Promise<void>;
  filter: (media: MediaLot[], filter: MediaFilter) => MediaLot[];
  usagePercent: (lot: MediaLot) => number;
  health: (lot: MediaLot) => "solid" | "correct" | "fragile" | "critical";
  athleteMediaSummary: (media: MediaLot[], athleteName: string) => {
    mediaLotsCount: number;
    premiumRemaining: number;
    videosAvailable: number;
    lastFolder: string;
    lastDelivery: string;
    lots: MediaLot[];
  };
  athleteMediaHealth: (media: MediaLot[], athleteName: string) => "solid" | "correct" | "fragile" | "critical" | "À définir";
  athleteMediaIntelligence: (
    mediaSummary: ReturnType<typeof MediaService.athleteMediaSummary>,
    coverage: number,
    daysWithoutVisibility: number
  ) => {
    scoreCoverage: string;
    mediaHealth: string;
    mainAlert: string;
    priority: string;
    recommendation: string;
  };
} = {
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

  athleteMediaSummary(media: MediaLot[], athleteName: string) {
    const lots = media.filter((lot) => lot.athlete === athleteName);
    const premiumRemaining = lots.reduce((sum, lot) => sum + lot.premiumRemaining, 0);
    const videosAvailable = lots.reduce((sum, lot) => sum + lot.videos, 0);
    const mediaLotsCount = lots.length;

    const sortedLots = lots
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.lastUse || "");
        const dateB = new Date(b.lastUse || "");
        if (!Number.isFinite(dateA.getTime()) || !Number.isFinite(dateB.getTime())) {
          return (b.row ?? 0) - (a.row ?? 0);
        }
        return dateB.getTime() - dateA.getTime();
      });

    const lastFolder =
      sortedLots.find((lot) => lot.event || lot.place)?.event ||
      sortedLots.find((lot) => lot.event || lot.place)?.place ||
      "—";
    const lastDelivery =
      sortedLots.find((lot) => lot.lastUse || lot.driveLink)?.lastUse ||
      sortedLots.find((lot) => lot.lastUse || lot.driveLink)?.driveLink ||
      "—";

    return {
      mediaLotsCount,
      premiumRemaining,
      videosAvailable,
      lastFolder,
      lastDelivery,
      lots,
    };
  },

  athleteMediaHealth(media: MediaLot[], athleteName: string): "solid" | "correct" | "fragile" | "critical" | "À définir" {
    const lots = media.filter((lot) => lot.athlete === athleteName);
    if (lots.length === 0) return "À définir";
    const statuses = lots.map((lot) => this.health(lot));
    if (statuses.includes("critical")) return "critical";
    if (statuses.includes("fragile")) return "fragile";
    if (statuses.includes("correct")) return "correct";
    return "solid";
  },

  athleteMediaIntelligence(
    mediaSummary: ReturnType<typeof MediaService.athleteMediaSummary>,
    coverage: number,
    daysWithoutVisibility: number
  ) {
    const hasData = mediaSummary.mediaLotsCount > 0 || coverage > 0;
    const safeCoverage = coverage >= 0 && coverage <= 100 ? `${coverage}/100` : "À définir";
    const mediaHealth = mediaSummary.mediaLotsCount
      ? this.athleteMediaHealth(mediaSummary.lots, mediaSummary.lots[0]?.athlete ?? "")
      : "À définir";

    const knownHealth =
      mediaHealth === "solid"
        ? "Solide"
        : mediaHealth === "correct"
        ? "Correct"
        : mediaHealth === "fragile"
        ? "Fragile"
        : mediaHealth === "critical"
        ? "Critique"
        : "À définir";

    let mainAlert = "Aucune alerte majeure";
    let priority = "Normale";
    let recommendation = "Continuer le suivi et alimenter les contenus.";

    if (daysWithoutVisibility > 14) {
      mainAlert = "Absence de visibilité récente";
      priority = "Haute";
      recommendation = "Relancer la diffusion de posts ou stories.";
    } else if (coverage > 0 && coverage < 35) {
      mainAlert = "Couverture média faible";
      priority = "Haute";
      recommendation = "Planifier un shooting Premium rapide.";
    } else if (mediaSummary.premiumRemaining === 0) {
      mainAlert = "Aucun contenu Premium disponible";
      priority = "Moyenne";
      recommendation = "Préparer des contenus Premium pour les prochaines publications.";
    } else if (mediaSummary.videosAvailable === 0) {
      mainAlert = "Aucune vidéo disponible";
      priority = "Moyenne";
      recommendation = "Créer des formats vidéo pour maintenir la visibilité.";
    }

    if (!hasData) {
      return {
        scoreCoverage: "À définir",
        mediaHealth: "À définir",
        mainAlert: "À définir",
        priority: "À définir",
        recommendation: "À définir",
      };
    }

    return {
      scoreCoverage: safeCoverage,
      mediaHealth: knownHealth,
      mainAlert,
      priority,
      recommendation,
    };
  },
};
