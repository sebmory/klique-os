import { describe, expect, it, vi } from "vitest";
import {
  parseCreativeMissionResponseInput,
  type CreativePortalMission,
} from "@/lib/creative-missions";
import {
  createCreativeMissionHandlers,
  logUnexpectedCreativeMissionPostError,
} from "@/app/api/creative/missions/route";
import { createAdminCreativeMissionResponseHandlers } from "@/app/api/admin/creative-mission-responses/route";

const creativeId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";

const access = {
  workspaceId: "workspace-a",
  creativeProfileId: creativeId,
  clerkUserId: "user-creative",
  status: "active",
  creativeProfileStatus: "active",
};

const mission: CreativePortalMission = {
  reference: "KLIQUE-A1B2C3D4",
  title: "Couverture du match",
  discipline: "Football",
  missionType: "photo",
  missionContext: "match",
  missionDate: "2026-10-25",
  startTime: "14:30",
  endTime: "17:00",
  locationName: "Stade de la Tuilière",
  locationDetails: "Entrée média B",
  brief: "Créer une sélection dynamique.",
  deliverables: "30 photos retouchées",
  deliveryDueDate: "2026-10-27",
  compensationType: "paid_mandate",
  compensationAmountChfCents: 25000,
  expenseDetails: "Train remboursé",
  missionStatus: "ready",
  response: {
    state: "pending",
    note: null,
    respondedAt: null,
    history: [],
  },
};

const postRequest = (body: unknown) => new Request(
  "http://localhost/api/creative/missions",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("creative missions 6C", () => {
  it("derives the scope exclusively from the linked creative access", async () => {
    const listMissions = vi.fn(async () => [mission]);
    const handlers = createCreativeMissionHandlers({
      getAccess: vi.fn(async () => access),
      listMissions,
      respond: vi.fn(),
    });
    const response = await handlers.GET(new Request("http://localhost/api/creative/missions"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listMissions).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      creativeProfileId: creativeId,
    });
    expect(payload.missions).toEqual([mission]);
    expect(JSON.stringify(payload)).not.toMatch(
      /athleteId|athleteEmail|athletePhone|internalAdminNotes|clerkUserId|workspaceId|requestId|creativeProfileId|subscription|credit|payment/i,
    );
  });

  it("returns only the personally assigned mission supplied by the scoped repository", async () => {
    const otherMission = { ...mission, reference: "KLIQUE-EEEEEEEE" };
    const allRows = [
      { mission, workspaceId: "workspace-a", creativeProfileId: creativeId, assigned: true },
      { mission: otherMission, workspaceId: "workspace-a", creativeProfileId: "other", assigned: true },
      { mission: otherMission, workspaceId: "workspace-a", creativeProfileId: creativeId, assigned: false },
      { mission: otherMission, workspaceId: "workspace-b", creativeProfileId: creativeId, assigned: true },
    ];
    const handlers = createCreativeMissionHandlers({
      getAccess: vi.fn(async () => access),
      listMissions: vi.fn(async (scope) => allRows
        .filter((row) => row.workspaceId === scope.workspaceId
          && row.creativeProfileId === scope.creativeProfileId
          && row.assigned)
        .map((row) => row.mission)),
      respond: vi.fn(),
    });
    const payload = await (
      await handlers.GET(new Request("http://localhost/api/creative/missions"))
    ).json();

    expect(payload.missions).toHaveLength(1);
    expect(payload.missions[0].reference).toBe(mission.reference);
  });

  it("accepts a mission with a server-derived identity and supports idempotent replay", async () => {
    const respond = vi.fn()
      .mockResolvedValueOnce("changed")
      .mockResolvedValueOnce("unchanged");
    const handlers = createCreativeMissionHandlers({
      getAccess: vi.fn(async () => access),
      listMissions: vi.fn(),
      respond,
    });

    const body = {
      reference: mission.reference,
      action: "accepted",
      note: "Disponible dès 14 h.",
      idempotencyKey,
    };
    const first = await handlers.POST(postRequest(body));
    const replay = await handlers.POST(postRequest(body));

    expect(first.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, unchanged: true });
    expect(respond).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      creativeProfileId: creativeId,
      clerkUserId: "user-creative",
      reference: mission.reference,
      action: "accepted",
      note: "Disponible dès 14 h.",
      idempotencyKey,
    });
  });

  it("logs only PostgreSQL code and constraint for an unexpected acceptance failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = Object.assign(
      new Error(`private ${creativeId} creative@example.com`),
      {
        code: "0A000",
        constraint: "private_constraint",
        detail: `private ${requestId}`,
      },
    );
    const handlers = createCreativeMissionHandlers({
      getAccess: vi.fn(async () => access),
      listMissions: vi.fn(),
      respond: vi.fn(async () => { throw failure; }),
    });
    const response = await handlers.POST(postRequest({
      reference: mission.reference,
      action: "accepted",
      note: "Disponible dès 14 h.",
      idempotencyKey,
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Impossible d’enregistrer la réponse.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[creative_missions][post_failed]",
      { code: "0A000", constraint: "private_constraint" },
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(creativeId);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(requestId);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("creative@example.com");
    consoleError.mockRestore();
  });

  it("sanitizes non-database errors without exposing their message", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logUnexpectedCreativeMissionPostError(new Error("private payload"));
    expect(consoleError).toHaveBeenCalledWith(
      "[creative_missions][post_failed]",
      { code: null, constraint: null },
    );
    consoleError.mockRestore();
  });

  it("requires a refusal reason and limits notes", () => {
    expect(() => parseCreativeMissionResponseInput({
      action: "refused",
      note: " ",
      idempotencyKey,
    })).toThrow("obligatoire");
    expect(() => parseCreativeMissionResponseInput({
      action: "accepted",
      note: "x".repeat(501),
      idempotencyKey,
    })).toThrow("500");
  });

  it.each([
    ["mission_cancelled", 409, "annulée"],
    ["assignment_changed", 409, "plus affectée"],
    ["access_denied", 403, "refusé"],
  ] as const)("rejects %s responses", async (outcome, status, message) => {
    const handlers = createCreativeMissionHandlers({
      getAccess: vi.fn(async () => access),
      listMissions: vi.fn(),
      respond: vi.fn(async () => outcome),
    });
    const response = await handlers.POST(postRequest({
      reference: mission.reference,
      action: "accepted",
      note: null,
      idempotencyKey,
    }));

    expect(response.status).toBe(status);
    expect((await response.json()).error).toContain(message);
  });

  it.each([
    [{ ...access, status: "revoked" }, 403],
    [{ ...access, creativeProfileStatus: "inactive" }, 403],
    [null, 401],
  ])("denies revoked, inactive or unlinked creative access", async (resolvedAccess, status) => {
    const handlers = createCreativeMissionHandlers({
      getAccess: vi.fn(async () => resolvedAccess),
      listMissions: vi.fn(),
      respond: vi.fn(),
    });
    const response = await handlers.GET(new Request("http://localhost/api/creative/missions"));
    expect(response.status).toBe(status);
  });

  it("exposes current response and append-only history to Admin request details", async () => {
    const creativeResponse = {
      state: "assignment_changed" as const,
      note: "Déjà engagé ce jour-là.",
      respondedAt: "2026-10-12T08:00:00.000Z",
      history: [{
        action: "refused" as const,
        note: "Déjà engagé ce jour-là.",
        authoredBy: "creative" as const,
        createdAt: "2026-10-12T08:00:00.000Z",
      }],
    };
    const getResponse = vi.fn(async () => creativeResponse);
    const handlers = createAdminCreativeMissionResponseHandlers({
      getAccess: vi.fn(async () => ({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      })),
      getResponse,
    });
    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/creative-mission-responses?requestId=${requestId}`,
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ response: creativeResponse });
    expect(getResponse).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      requestId,
    });
  });
});
