import { beforeEach, describe, expect, it, vi } from "vitest";

const { createContentStorageClientMock } = vi.hoisted(() => ({
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

import { createCreativeMissionRepository } from "@/lib/creative-missions";

const creativeProfileId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";

describe("creative mission response transaction 6C", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["accepted", "Disponible dès 14 h."],
    ["refused", "Déjà engagé ce jour-là."],
  ] as const)("writes an atomic %s response with its note", async (action, note) => {
    let statement = "";
    let parameters: unknown[] = [];
    const queryToken = { statement: "creative-response" };
    const query = vi.fn((sql: string, values: unknown[]) => {
      statement = sql;
      parameters = values;
      return queryToken;
    });
    const transaction = vi.fn(async (queries: unknown[]) => {
      expect(queries).toEqual([queryToken]);
      return [[{ outcome: "changed" }]];
    });
    createContentStorageClientMock.mockReturnValue({ query, transaction });

    const repository = createCreativeMissionRepository();
    const outcome = await repository.respond({
      workspaceId: "workspace-a",
      creativeProfileId,
      clerkUserId: "user-creative",
      reference: "KLIQUE-A1B2C3D4",
      action,
      note,
      idempotencyKey,
    });

    expect(outcome).toBe("changed");
    expect(transaction).toHaveBeenCalledWith(
      [queryToken],
      { isolationLevel: "Serializable" },
    );
    expect(statement).toContain("locked_access AS MATERIALIZED");
    expect(statement).toContain("FROM creative_access");
    expect(statement).toContain("FOR UPDATE");
    expect(statement).toContain("FOR UPDATE OF request, mission, profile");
    expect(statement).not.toContain("FOR UPDATE OF request, mission, profile, access");
    expect(statement).toContain("INSERT INTO creative_mission_response_events");
    expect(statement).toContain("INSERT INTO creative_mission_responses");
    expect(parameters.slice(0, 7)).toEqual([
      "workspace-a",
      creativeProfileId,
      "user-creative",
      "KLIQUE-A1B2C3D4",
      action,
      note,
      idempotencyKey,
    ]);
  });
});
