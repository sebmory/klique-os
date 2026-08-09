import { describe, expect, it } from "vitest";
import { advanceProductionWorkflow } from "@/services/production-workflow";
import type { Production } from "@/types/production";

const baseProduction = (): Production => ({
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
  statut: "Planifié",
  nbPhotos: 10,
  nbVideos: 2,
  importDone: false,
  triDone: false,
  retoucheDone: false,
  exportDone: false,
  driveDone: false,
  published: false,
  raw: {},
});

describe("production workflow advance", () => {
  it("moves the workflow from import to tri and updates the operational status", () => {
    const result = advanceProductionWorkflow(baseProduction(), "import");

    expect(result.canAdvance).toBe(true);
    expect(result.completedStepId).toBe("import");
    expect(result.nextStepId).toBe("tri");
    expect(result.update.importDone).toBe(true);
    expect(result.update.statut).toBe("En production");
  });

  it("completes publication and marks the workflow as fully complete", () => {
    const production = baseProduction();
    production.importDone = true;
    production.triDone = true;
    production.retoucheDone = true;
    production.exportDone = true;
    production.statut = "Pret a publier";

    const result = advanceProductionWorkflow(production, "publication");

    expect(result.canAdvance).toBe(true);
    expect(result.completedStepId).toBe("publication");
    expect(result.nextStepId).toBe(null);
    expect(result.update.published).toBe(true);
    expect(result.update.statut).toBe("Terminé");
  });
});
