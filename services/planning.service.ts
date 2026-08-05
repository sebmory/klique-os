import type {
  NewShootingPlanning,
  PlanningResponse,
  PlanningUpdate,
  ShootingPlanning,
} from "@/types/planning";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return data as T;
}

const addMinutes = (time: string, minutes: number): string => {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60
  ).padStart(2, "0")}`;
};

export const PlanningService = {
  async list(): Promise<PlanningResponse> {
    const response = await fetch("/api/planning", { cache: "no-store" });
    return parseResponse<PlanningResponse>(response);
  },

  async create(planning: NewShootingPlanning): Promise<void> {
    const response = await fetch("/api/planning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planning),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  async update(update: PlanningUpdate): Promise<void> {
    const response = await fetch("/api/planning", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  timeline(planning: ShootingPlanning) {
    const departure = addMinutes(
      planning.shootingTime,
      -(planning.travelMinutes + planning.setupMinutes)
    );
    const arrival = addMinutes(departure, planning.travelMinutes);
    const setup = arrival;
    const shootingEnd = addMinutes(planning.shootingTime, planning.shootingMinutes);
    const selectionEnd = addMinutes(shootingEnd, planning.selectionMinutes);
    const editingEnd = addMinutes(selectionEnd, planning.editingMinutes);
    const exportEnd = addMinutes(editingEnd, planning.exportMinutes);
    const uploadEnd = addMinutes(exportEnd, planning.uploadMinutes);

    return [
      { key: "departureDone", time: departure, label: "Départ", detail: `${planning.travelMinutes} min de trajet` },
      { key: "arrivalDone", time: arrival, label: "Arrivée", detail: planning.place || "Lieu à compléter" },
      { key: "setupDone", time: setup, label: "Installation", detail: `${planning.setupMinutes} min de préparation` },
      { key: "shootingDone", time: planning.shootingTime, label: "Début shooting", detail: `${planning.shootingMinutes} min` },
      { key: "selectionDone", time: shootingEnd, label: "Tri / sélection", detail: `${planning.selectionMinutes} min` },
      { key: "editingDone", time: selectionEnd, label: "Retouche", detail: `${planning.editingMinutes} min` },
      { key: "exportDone", time: editingEnd, label: "Export", detail: `${planning.exportMinutes} min` },
      { key: "uploadDone", time: exportEnd, label: "Upload / sauvegarde", detail: `${planning.uploadMinutes} min` },
      { key: "publicationDone", time: planning.publicationTime || uploadEnd, label: "Publication", detail: planning.publicationTime ? "Heure prévue" : "Après upload" },
    ] as const;
  },

  progress(planning: ShootingPlanning): number {
    const values = [
      planning.departureDone,
      planning.arrivalDone,
      planning.setupDone,
      planning.shootingDone,
      planning.selectionDone,
      planning.editingDone,
      planning.exportDone,
      planning.uploadDone,
      planning.publicationDone,
    ];
    return Math.round((values.filter(Boolean).length / values.length) * 100);
  },

  totalMinutes(planning: ShootingPlanning): number {
    return (
      planning.travelMinutes +
      planning.setupMinutes +
      planning.shootingMinutes +
      planning.selectionMinutes +
      planning.editingMinutes +
      planning.exportMinutes +
      planning.uploadMinutes
    );
  },
};
