import { describe, expect, it } from "vitest";
import { getProductionWorkflow } from "@/services/production-workflow";
import type { Production } from "@/types/production";

const baseProduction = (statut: string): Production => ({
  id: "prod-1",
  row: 4,
  date: "2026-08-08",
  type: "Shooting",
  athlete: "Alpha Martin",
  sport: "Tennis",
  lieu: "Lausanne",
  objectif: "Test",
  materiel: "Camera",
  photographe: "Team",
  statut,
  nbPhotos: 10,
  nbVideos: 2,
  importDone: true,
  triDone: true,
  retoucheDone: true,
  exportDone: true,
  driveDone: true,
  published: true,
  raw: {},
});

describe("production workflow status compatibility at 100%", () => {
  it("does not flag incompatibility when source status is needs_review", () => {
    const workflow = getProductionWorkflow(baseProduction("A verifier"));

    expect(
      workflow.inconsistencies.some(
        (issue) => issue.code === "PROGRESS_COMPLETE_BUT_STATUS_INCOMPATIBLE"
      )
    ).toBe(false);
  });

  it("flags incompatibility when source status is in_progress", () => {
    const workflow = getProductionWorkflow(baseProduction("En production"));

    expect(
      workflow.inconsistencies.some(
        (issue) => issue.code === "PROGRESS_COMPLETE_BUT_STATUS_INCOMPATIBLE"
      )
    ).toBe(true);
  });
});
