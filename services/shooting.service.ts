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
