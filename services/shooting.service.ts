import type {
  NewShooting,
  Shooting,
  ShootingsResponse,
  ShootingUpdate,
} from "@/types/shooting";

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

    const steps = [
      shooting.shootingDone,
      shooting.importDone,
      shooting.backupDone,
      shooting.sortDone,
      shooting.retouchDone,
      shooting.exportDone,
      shooting.driveDone,
      shooting.publishedInstagram,
      shooting.publishedFacebook,
      shooting.publishedLinkedIn,
    ];

    const completed = steps.filter(Boolean).length;
    if (completed === 0) return "Planifié";
    if (completed === steps.length) return "Terminé";
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

  isComplete(shooting: Shooting): boolean {
    return shooting.published || ShootingService.progress(shooting) === 100;
  },

  progress(shooting: Shooting): number {
    const steps = [
      shooting.shootingDone,
      shooting.importDone,
      shooting.backupDone,
      shooting.sortDone,
      shooting.retouchDone,
      shooting.exportDone,
      shooting.driveDone,
      shooting.publishedInstagram,
      shooting.publishedFacebook,
      shooting.publishedLinkedIn,
    ];
    return Math.round(
      (steps.filter(Boolean).length / steps.length) * 100
    );
  },
};
