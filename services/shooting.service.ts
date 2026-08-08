import type {
  NewShooting,
  Shooting,
  ShootingsResponse,
  ShootingUpdate,
} from "@/types/shooting";

const PRODUCTION_CHECKLIST_FIELDS = [
  "shootingDone",
  "importDone",
  "backupDone",
  "sortDone",
  "retouchDone",
  "exportDone",
  "driveDone",
  "publishedInstagram",
  "publishedFacebook",
  "publishedLinkedIn",
] as const;

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return data as T;
}

export const ShootingService = {
  async list(): Promise<ShootingsResponse> {
    const response = await fetch("/api/shootings", { cache: "no-store" });
    return parseResponse<ShootingsResponse>(response);
  },

  async create(shooting: NewShooting): Promise<void> {
    const response = await fetch("/api/shootings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shooting),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  async update(update: ShootingUpdate): Promise<void> {
    const response = await fetch("/api/shootings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  async remove(row: number): Promise<void> {
    const response = await fetch(`/api/shootings?row=${row}`, {
      method: "DELETE",
    });
    await parseResponse<{ success: boolean }>(response);
  },

  statusFromChecklist(shooting: Shooting): string {
    if (shooting.status === "Annulé") {
      return shooting.status;
    }

    const { completed, total } = ShootingService.productionChecklistState(shooting);
    if (completed === 0) return "Planifié";
    if (completed === total) return "Terminé";
    return "En cours";
  },

  isComplete(shooting: Shooting): boolean {
    return ShootingService.progress(shooting) === 100;
  },

  stageFromChecklist(shooting: Shooting): string {
    if (shooting.status === "Annulé") return "Annulé";
    if (!shooting.shootingDone) return "Shooting";
    if (!shooting.importDone) return "Import";
    if (!shooting.backupDone) return "Sauvegarde";
    if (!shooting.sortDone) return "Tri";
    if (!shooting.retouchDone) return "Retouche";
    if (!shooting.exportDone) return "Export";
    if (!shooting.driveDone) return "Drive";
    if (
      !shooting.publishedInstagram ||
      !shooting.publishedFacebook ||
      !shooting.publishedLinkedIn
    ) {
      return "Publication";
    }
    return "Terminé";
  },

  formatDate(value: string): string {
    if (!value) return "Date à compléter";
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!iso) return value;
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  },

  dashboardMetrics(shootings: Shooting[]) {
    const totalPhotos = shootings.reduce((sum, shooting) => sum + shooting.photos, 0);
    const totalVideos = shootings.reduce((sum, shooting) => sum + shooting.videos, 0);
    const planified = shootings.filter(
      (shooting) => ShootingService.statusFromChecklist(shooting) === "Planifié"
    ).length;
    const inProgress = shootings.filter(
      (shooting) => ShootingService.statusFromChecklist(shooting) === "En cours"
    ).length;
    const completed = shootings.filter(
      (shooting) => ShootingService.statusFromChecklist(shooting) === "Terminé"
    ).length;
    const toProcess = shootings.filter(
      (shooting) =>
        shooting.status !== "Annulé" &&
        shooting.shootingDone &&
        ShootingService.progress(shooting) < 100
    ).length;
    const toDeliver = shootings.filter(
      (shooting) => shooting.status !== "Annulé" && shooting.shootingDone && !shooting.driveDone
    ).length;
    const notPublished = shootings.filter(
      (shooting) =>
        shooting.status !== "Annulé" &&
        shooting.shootingDone &&
        !shooting.publishedInstagram &&
        !shooting.publishedFacebook &&
        !shooting.publishedLinkedIn
    ).length;

    return {
      total: shootings.length,
      planified,
      inProgress,
      completed,
      toProcess,
      toDeliver,
      notPublished,
      totalPhotos,
      totalVideos,
    };
  },

  athleteMetrics(shootings: Shooting[], athleteName: string) {
    const athleteShootings = shootings.filter(
      (shooting) => shooting.athlete === athleteName
    );

    const validDates = athleteShootings
      .map((shooting) => shooting.date.trim())
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== "1899-12-30")
      .map((date) => new Date(`${date}T00:00:00Z`))
      .filter((date) => !Number.isNaN(date.getTime()));

    const lastDate = validDates.length
      ? validDates.reduce((a, b) => (a > b ? a : b))
      : null;

    const totalPhotos = athleteShootings.reduce((sum, shooting) => sum + shooting.photos, 0);
    const totalVideos = athleteShootings.reduce((sum, shooting) => sum + shooting.videos, 0);
    const completed = athleteShootings.filter(
      (shooting) => ShootingService.statusFromChecklist(shooting) === "Terminé"
    ).length;
    const toProcess = athleteShootings.filter(
      (shooting) =>
        shooting.status !== "Annulé" &&
        shooting.shootingDone &&
        ShootingService.progress(shooting) < 100
    ).length;
    const delivered = athleteShootings.filter(
      (shooting) => shooting.status !== "Annulé" && shooting.shootingDone && shooting.driveDone
    ).length;
    const published = athleteShootings.filter(
      (shooting) =>
        shooting.status !== "Annulé" &&
        shooting.shootingDone &&
        (shooting.publishedInstagram || shooting.publishedFacebook || shooting.publishedLinkedIn)
    ).length;

    return {
      totalShootings: athleteShootings.length,
      totalPhotos,
      totalVideos,
      completed,
      toProcess,
      delivered,
      published,
      lastActivity: lastDate
        ? ShootingService.formatDate(lastDate.toISOString().slice(0, 10))
        : "—",
      shootings: athleteShootings,
    };
  },

  productionChecklistState(shooting: Shooting) {
    const values = PRODUCTION_CHECKLIST_FIELDS.map((field) => shooting[field]);
    return {
      values,
      completed: values.filter(Boolean).length,
      total: values.length,
    };
  },

  progress(shooting: Shooting): number {
    const { completed, total } = ShootingService.productionChecklistState(shooting);
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  },
};
