import { describe, expect, it } from "vitest";
import { buildProductionEditPayload } from "@/services/production.service";
import type { Production } from "@/types/production";

const baseProduction = (): Production => ({
  id: "prod-1",
  row: 4,
  date: "2026-08-08",
  type: "Portrait",
  athlete: "Alpha Martin",
  sport: "Tennis",
  lieu: "Lausanne",
  objectif: "Test",
  materiel: "Camera",
  photographe: "Team",
  statut: "En production",
  nbPhotos: 10,
  nbVideos: 2,
  importDone: true,
  triDone: false,
  retoucheDone: false,
  exportDone: false,
  driveDone: false,
  published: false,
  raw: {},
});

describe("production edit payload", () => {
  it("maps the edited production fields to the shooting update payload", () => {
    const payload = buildProductionEditPayload(baseProduction(), {
      date: "2026-08-09",
      athlete: "Nina Rossi",
      type: "Action",
      lieu: "Genève",
      objectif: "Campagne",
      materiel: "Canon",
      photographe: "Camille",
      sport: "Football",
    });

    expect(payload.row).toBe(4);
    expect(payload.date).toBe("2026-08-09");
    expect(payload.athlete).toBe("Nina Rossi");
    expect(payload.type).toBe("Action");
    expect(payload.place).toBe("Genève");
    expect(payload.objective).toBe("Campagne");
    expect(payload.equipment).toBe("Canon");
    expect(payload.photographer).toBe("Camille");
    expect(payload.sport).toBe("Football");
  });
});
