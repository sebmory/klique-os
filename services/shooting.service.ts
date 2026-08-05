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
      shooting.importDone,
      shooting.sortDone,
      shooting.retouchDone,
      shooting.exportDone,
      shooting.driveDone,
      shooting.published,
    ];
    return Math.round(
      (steps.filter(Boolean).length / steps.length) * 100
    );
  },
};
