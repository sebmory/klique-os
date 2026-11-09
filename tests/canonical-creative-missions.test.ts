import { describe, expect, it, vi } from "vitest";
import {
  listCanonicalCreativeMissions,
  mapCanonicalCreativeMission,
  type CanonicalCreativeMissionRepository,
} from "@/lib/canonical-creative-missions";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  record_kind: "mission" as const,
  business_state: "completed" as const,
  title: "Media Day — Athlète A & Athlète B",
  mission_type: "media_day" as const,
  scheduled_at: null,
  occurred_at: "2026-07-11T12:00:00.000Z",
  occurred_at_source: "historicalRealizationAt_best_available",
  regularization_status: "historical_completed" as const,
  regularization_note: "Terminée — historique régularisé.",
  historical_creative_name: "Créatif historique",
  historical_creative_profile_id: "22222222-2222-4222-8222-222222222222",
  operational_creative_profile_id: null,
  historical_profile_name: "Profil canonique",
  operational_profile_name: null,
  athletes: [
    { id: "athlete-a", name: "Athlète A" },
    { id: "athlete-b", name: "Athlète B" },
  ],
  sources: [
    {
      type: "athlete_service_request" as const,
      relation: "service" as const,
      id: "request-1",
      snapshot: {
        productName: "Session photo KLIQUE",
        status: "completed",
        requestedDetails: {},
      },
    },
    {
      type: "production_sheet" as const,
      relation: "production" as const,
      id: "google_sheets:fingerprint",
      snapshot: { published: true },
    },
  ],
  events: [{
    action: "historical_completed",
    fromState: null,
    toState: "completed" as const,
    actor: "system",
    note: "Régularisée.",
    createdAt: "2026-11-09T12:00:00.000Z",
  }],
  updated_at: "2026-11-09T12:00:00.000Z",
};

describe("canonical creative mission projection", () => {
  it("maps multi-athlete historical evidence without creating an operational assignment", () => {
    const mission = mapCanonicalCreativeMission(row);
    expect(mission.view).toBe("history");
    expect(mission.athletes).toHaveLength(2);
    expect(mission.services).toEqual([{
      requestId: "request-1",
      productName: "Session photo KLIQUE",
      status: "completed",
      requestedDetails: {},
    }]);
    expect(mission.creative).toEqual({
      kind: "historical",
      name: "Créatif historique",
      profileId: "22222222-2222-4222-8222-222222222222",
    });
    expect(mission.nextAction).toBe("Aucune action");
  });

  it("uses only the authenticated workspace and server counts", async () => {
    const repository: CanonicalCreativeMissionRepository = {
      list: vi.fn().mockResolvedValue([row]),
      countByView: vi.fn().mockResolvedValue([
        { view: "to_process", count: 2 },
        { view: "to_organize", count: 3 },
        { view: "in_progress", count: 4 },
        { view: "history", count: 7 },
      ]),
    };

    const result = await listCanonicalCreativeMissions({
      workspaceId: " workspace-a ",
      repository,
    });

    expect(repository.list).toHaveBeenCalledWith("workspace-a");
    expect(repository.countByView).toHaveBeenCalledWith("workspace-a");
    expect(result.counts).toEqual({
      to_process: 2,
      to_organize: 3,
      in_progress: 4,
      history: 7,
    });
    expect(result.missions).toHaveLength(1);
  });

  it("refuses an empty workspace", async () => {
    const repository: CanonicalCreativeMissionRepository = {
      list: vi.fn(),
      countByView: vi.fn(),
    };
    await expect(listCanonicalCreativeMissions({
      workspaceId: " ",
      repository,
    })).rejects.toThrow("workspaceId est requis");
    expect(repository.list).not.toHaveBeenCalled();
  });
});
