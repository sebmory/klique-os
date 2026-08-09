import type { Production, ProductionByIdResponse, ProductionResponse } from "@/types/production";
import type { Shooting, ShootingsResponse, ShootingUpdate } from "@/types/shooting";
import { getProductionWorkflow, type ProductionWorkflowResult } from "@/services/production-workflow";

const normalize = (value: unknown): string => String(value ?? "").trim();

const stableKey = (value: string) =>
  normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const inferStatus = (shooting: Shooting): string => {
  const raw = normalize(shooting.status);
  if (raw) return raw;

  const doneSteps = [
    shooting.importDone,
    shooting.sortDone,
    shooting.retouchDone,
    shooting.exportDone,
    shooting.driveDone,
    shooting.published,
  ].filter(Boolean).length;

  if (doneSteps === 0) return "Planifié";
  if (doneSteps === 6) return "Terminé";
  return "En cours";
};

const toProduction = (shooting: Shooting): Production => {
  const idFromRow = shooting.row ? `production-${shooting.row}` : "";
  const idFromValues = stableKey(`${shooting.date}-${shooting.athlete}-${shooting.type}`) || "production";

  return {
    id: idFromRow || idFromValues,
    row: shooting.row,
    date: normalize(shooting.date),
    type: normalize(shooting.type) || "—",
    athlete: normalize(shooting.athlete) || "—",
    sport: normalize(shooting.sport) || "—",
    lieu: normalize(shooting.place) || "—",
    objectif: normalize(shooting.objective) || "—",
    materiel: normalize((shooting as Shooting & { equipment?: string }).equipment ?? "") || "—",
    photographe: normalize(shooting.photographer) || "—",
    statut: inferStatus(shooting),
    nbPhotos: Number.isFinite(shooting.photos) ? shooting.photos : 0,
    nbVideos: Number.isFinite(shooting.videos) ? shooting.videos : 0,
    importDone: Boolean(shooting.importDone),
    triDone: Boolean(shooting.sortDone),
    retoucheDone: Boolean(shooting.retouchDone),
    exportDone: Boolean(shooting.exportDone),
    driveDone: Boolean(shooting.driveDone),
    published: Boolean(shooting.published),
    raw: {
      ...shooting,
      materiel: normalize((shooting as Shooting & { equipment?: string }).equipment ?? ""),
    },
  };
};

export type ProductionEditFormValues = {
  date: string;
  athlete: string;
  type: string;
  lieu: string;
  objectif: string;
  materiel: string;
  photographe: string;
  sport: string;
};

export const buildProductionEditPayload = (
  production: Production,
  values: ProductionEditFormValues
): ShootingUpdate => ({
  row: production.row,
  date: values.date,
  athlete: values.athlete,
  type: values.type,
  place: values.lieu,
  objective: values.objectif,
  equipment: values.materiel,
  photographer: values.photographe,
  sport: values.sport,
});

export const ProductionService = {
  async list(): Promise<ProductionResponse> {
    const response = await fetch("/api/shootings", { cache: "no-store" });
    const payload = (await response.json()) as ShootingsResponse | { error?: string };

    if (!response.ok) {
      throw new Error("error" in payload ? payload.error || "Impossible de charger la production." : "Impossible de charger la production.");
    }

    const data = payload as ShootingsResponse;

    return {
      productions: data.shootings.map(toProduction),
      source: data.source,
      message: data.message,
    };
  },

  async getById(id: string): Promise<ProductionByIdResponse> {
    const payload = await this.list();
    return {
      production: payload.productions.find((production) => production.id === id) ?? null,
      source: payload.source,
      message: payload.message,
    };
  },

  workflow(production: Production): ProductionWorkflowResult {
    return getProductionWorkflow(production);
  },

  workflowProgress(production: Production): number {
    return getProductionWorkflow(production).progressPercentage;
  },
};
