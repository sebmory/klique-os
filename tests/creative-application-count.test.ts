import { describe, expect, it, vi } from "vitest";
import {
  countCreativeApplicationsByModeration,
  creativeApplicationTechnicalHeaders,
  summarizeCreativeApplicationsModeration,
  type CreativeApplicationsSheetRepository,
} from "@/lib/creatives/applications-sheet";

describe("compteur de candidatures créatives", () => {
  it("ne charge que la colonne de statut et ne réalise aucune écriture", async () => {
    const readSnapshot = vi.fn();
    const appendTechnicalHeaders = vi.fn();
    const writeTechnicalCells = vi.fn();
    const repository: CreativeApplicationsSheetRepository = {
      readSnapshot,
      readHeaders: vi.fn().mockResolvedValue([
        "Nom",
        creativeApplicationTechnicalHeaders.moderationStatus,
      ]),
      readColumnValues: vi.fn().mockResolvedValue([
        "pending",
        "approved",
        "pending",
        "rejected",
        "",
      ]),
      appendTechnicalHeaders,
      readCell: vi.fn(),
      writeTechnicalCells,
    };

    await expect(countCreativeApplicationsByModeration({
      repository,
      createUuid: () => "unused",
      now: () => new Date("2026-11-10T00:00:00.000Z"),
    })).resolves.toEqual({ pending: 2, approved: 1, rejected: 1 });
    expect(readSnapshot).not.toHaveBeenCalled();
    expect(appendTechnicalHeaders).not.toHaveBeenCalled();
    expect(writeTechnicalCells).not.toHaveBeenCalled();
  });

  it("résume le volume et la plus ancienne attente depuis deux colonnes ciblées", async () => {
    const repository: CreativeApplicationsSheetRepository = {
      readSnapshot: vi.fn(),
      readHeaders: vi.fn().mockResolvedValue([
        "Horodateur",
        creativeApplicationTechnicalHeaders.moderationStatus,
      ]),
      readColumnValues: vi.fn()
        .mockResolvedValueOnce(["pending", "approved", "pending"])
        .mockResolvedValueOnce(["01/11/2026 10:00:00", "03/11/2026 10:00:00", "02/11/2026 10:00:00"]),
      appendTechnicalHeaders: vi.fn(),
      readCell: vi.fn(),
      writeTechnicalCells: vi.fn(),
    };
    const summary = await summarizeCreativeApplicationsModeration({
      repository,
      createUuid: () => "unused",
      now: () => new Date("2026-11-10T00:00:00.000Z"),
    });
    expect(summary.counts).toEqual({ pending: 2, approved: 1, rejected: 0 });
    expect(summary.oldestPendingAt).toBe("2026-11-01T09:00:00.000Z");
    expect(repository.readColumnValues).toHaveBeenCalledTimes(2);
    expect(repository.writeTechnicalCells).not.toHaveBeenCalled();
  });
});
