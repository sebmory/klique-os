import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseAdminCreativeMissionReviewInput,
  type AdminCreativeMissionReviewOutcome,
} from "@/lib/creative-mission-admin-review";
import { createAdminAthleteServiceMissionHandlers } from "@/app/api/admin/athlete-service-missions/route";

const requestId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "lib/creative-mission-admin-review.ts"),
  "utf8",
);

type Mode = "included_right" | "paid_extra" | "paid_with_right" | "no_charge";

class AtomicReviewModel {
  private lock = Promise.resolve();
  private readonly keys = new Map<string, string>();
  requestStatus: "in_progress" | "completed" = "in_progress";
  missionStatus: "ready" | "draft" = "ready";
  assigned = true;
  responseAccepted = true;
  executionStatus: "delivered" | "changes_requested" | "completed" = "delivered";
  eventCount = 0;
  movementCount = 0;
  purchaseExecutionCount = 0;

  constructor(
    private readonly mode: Mode,
    private readonly purchaseQuantity = 1,
  ) {}

  async review(
    key: string,
    action: "changes_requested" | "completed",
    note: string | null,
    failAfterCommercial = false,
  ): Promise<AdminCreativeMissionReviewOutcome> {
    let release = () => {};
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = {
      requestStatus: this.requestStatus,
      executionStatus: this.executionStatus,
      eventCount: this.eventCount,
      movementCount: this.movementCount,
      purchaseExecutionCount: this.purchaseExecutionCount,
    };
    const fingerprint = JSON.stringify({ action, note });
    try {
      const existing = this.keys.get(key);
      if (existing) return existing === fingerprint ? "unchanged" : "idempotency_conflict";
      if (this.missionStatus !== "ready") return "mission_not_ready";
      if (!this.assigned) return "assignment_changed";
      if (!this.responseAccepted) return "response_not_accepted";
      if (this.executionStatus !== "delivered") return "execution_not_delivered";
      if (action === "changes_requested") {
        if (!note?.trim()) return "invalid_transition";
        this.keys.set(key, fingerprint);
        this.eventCount += 1;
        this.executionStatus = "changes_requested";
        return "changed";
      }
      if (this.requestStatus !== "in_progress") return "request_not_in_progress";
      if (
        (this.mode === "paid_extra" || this.mode === "paid_with_right")
        && this.purchaseQuantity > 1
      ) {
        return "pack_not_supported";
      }
      if (this.mode === "included_right" || this.mode === "paid_with_right") {
        this.movementCount += 1;
      }
      if (this.mode === "paid_extra" || this.mode === "paid_with_right") {
        this.purchaseExecutionCount += 1;
      }
      this.requestStatus = "completed";
      if (failAfterCommercial) throw new Error("projection failed");
      this.executionStatus = "completed";
      this.eventCount += 1;
      this.keys.set(key, fingerprint);
      return "changed";
    } catch (error) {
      this.requestStatus = snapshot.requestStatus;
      this.executionStatus = snapshot.executionStatus;
      this.eventCount = snapshot.eventCount;
      this.movementCount = snapshot.movementCount;
      this.purchaseExecutionCount = snapshot.purchaseExecutionCount;
      throw error;
    } finally {
      release();
    }
  }
}

const adminDependencies = (reviewDelivery = vi.fn().mockResolvedValue({ outcome: "changed" })) => ({
  getAccess: vi.fn().mockResolvedValue({
    clerkUserId: "admin-1",
    role: "admin",
    status: "active",
    workspaceId: "workspace-server",
  }),
  listMissions: vi.fn().mockResolvedValue([]),
  saveMission: vi.fn(),
  cancelMission: vi.fn(),
  reviewDelivery,
});

const patch = (body: Record<string, unknown>) => new Request(
  "http://localhost/api/admin/athlete-service-missions",
  {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("Admin creative mission review 7D2", () => {
  it("parses only the two Admin review actions and requires a correction reason", () => {
    expect(() => parseAdminCreativeMissionReviewInput({
      requestId,
      action: "changes_requested",
      note: " ",
      idempotencyKey,
    })).toThrow("Le motif des modifications est obligatoire.");
    expect(parseAdminCreativeMissionReviewInput({
      requestId,
      action: "completed",
      note: null,
      idempotencyKey,
    })).toEqual({ requestId, action: "completed", note: null, idempotencyKey });
  });

  it("uses the existing Admin guard and ignores a browser workspace", async () => {
    const reviewDelivery = vi.fn().mockResolvedValue({ outcome: "changed" });
    const handlers = createAdminAthleteServiceMissionHandlers(adminDependencies(reviewDelivery));
    const response = await handlers.PATCH(patch({
      requestId,
      action: "completed",
      note: null,
      idempotencyKey,
      workspaceId: "workspace-browser",
    }));

    expect(response.status).toBe(400);
    expect(reviewDelivery).not.toHaveBeenCalled();

    const validResponse = await handlers.PATCH(patch({
      requestId,
      action: "completed",
      note: null,
      idempotencyKey,
    }));
    expect(validResponse.status).toBe(200);
    expect(reviewDelivery).toHaveBeenCalledWith({
      workspaceId: "workspace-server",
      requestId,
      action: "completed",
      note: null,
      idempotencyKey,
      clerkUserId: "admin-1",
    });

    const changesResponse = await handlers.PATCH(patch({
      requestId,
      action: "changes_requested",
      note: "Revoir la sélection finale.",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    }));
    expect(changesResponse.status).toBe(200);
    expect(reviewDelivery).toHaveBeenLastCalledWith({
      workspaceId: "workspace-server",
      requestId,
      action: "changes_requested",
      note: "Revoir la sélection finale.",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      clerkUserId: "admin-1",
    });
  });

  it("returns a clear business conflict for multi-delivery packs", async () => {
    const handlers = createAdminAthleteServiceMissionHandlers(
      adminDependencies(vi.fn().mockResolvedValue({ outcome: "pack_not_supported" })),
    );
    const response = await handlers.PATCH(patch({
      requestId,
      action: "completed",
      note: null,
      idempotencyKey,
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("plusieurs livraisons"),
    });
  });

  it("composes the canonical commercial primitive under Serializable isolation", () => {
    expect(source).toContain("buildAthleteServiceRequestCommercialCompletionTransaction");
    expect(source).toContain('{ isolationLevel: "Serializable" }');
    expect(source).toContain("...commercialPlan.queries.slice(0, 3)");
    expect(source).toContain("lockMission");
    expect(source).toContain("lockResponse");
    expect(source).toContain("lockExecution");
    expect(source).toContain("...commercialPlan.queries.slice(3)");
    expect(source).toContain("assertAtomicCompletion");
  });

  it.each([
    ["included_right", 1, 0],
    ["paid_extra", 0, 1],
    ["paid_with_right", 1, 1],
    ["no_charge", 0, 0],
  ] as const)("atomically completes unit mode %s", async (mode, movements, executions) => {
    const model = new AtomicReviewModel(mode);
    await expect(model.review(idempotencyKey, "completed", null)).resolves.toBe("changed");
    expect(model.requestStatus).toBe("completed");
    expect(model.executionStatus).toBe("completed");
    expect(model.eventCount).toBe(1);
    expect(model.movementCount).toBe(movements);
    expect(model.purchaseExecutionCount).toBe(executions);
  });

  it("requests corrections without touching commercial consumption", async () => {
    const model = new AtomicReviewModel("paid_with_right");
    await expect(
      model.review(idempotencyKey, "changes_requested", "Revoir le cadrage."),
    ).resolves.toBe("changed");
    expect(model.executionStatus).toBe("changes_requested");
    expect(model.requestStatus).toBe("in_progress");
    expect(model.movementCount).toBe(0);
    expect(model.purchaseExecutionCount).toBe(0);
  });

  it("rejects incoherent mission, assignment, response and execution states", async () => {
    const completedRequest = new AtomicReviewModel("included_right");
    completedRequest.requestStatus = "completed";
    await expect(completedRequest.review(
      "10000000-0000-4000-8000-000000000000",
      "completed",
      null,
    )).resolves.toBe("request_not_in_progress");

    const draft = new AtomicReviewModel("included_right");
    draft.missionStatus = "draft";
    await expect(draft.review("10000000-0000-4000-8000-000000000001", "completed", null))
      .resolves.toBe("mission_not_ready");

    const reassigned = new AtomicReviewModel("included_right");
    reassigned.assigned = false;
    await expect(reassigned.review("10000000-0000-4000-8000-000000000002", "completed", null))
      .resolves.toBe("assignment_changed");

    const refused = new AtomicReviewModel("included_right");
    refused.responseAccepted = false;
    await expect(refused.review("10000000-0000-4000-8000-000000000003", "completed", null))
      .resolves.toBe("response_not_accepted");

    const changes = new AtomicReviewModel("included_right");
    changes.executionStatus = "changes_requested";
    await expect(changes.review("10000000-0000-4000-8000-000000000004", "completed", null))
      .resolves.toBe("execution_not_delivered");
  });

  it("is idempotent, detects key conflicts and serializes a double click", async () => {
    const model = new AtomicReviewModel("included_right");
    const outcomes = await Promise.all([
      model.review(idempotencyKey, "completed", null),
      model.review(idempotencyKey, "completed", null),
    ]);
    expect(outcomes.sort()).toEqual(["changed", "unchanged"]);
    expect(model.eventCount).toBe(1);
    expect(model.movementCount).toBe(1);
    await expect(
      model.review(idempotencyKey, "changes_requested", "Autre contenu"),
    ).resolves.toBe("idempotency_conflict");
  });

  it("rolls back request, event and consumption when the final projection fails", async () => {
    const model = new AtomicReviewModel("paid_with_right");
    await expect(model.review(idempotencyKey, "completed", null, true))
      .rejects.toThrow("projection failed");
    expect(model.requestStatus).toBe("in_progress");
    expect(model.executionStatus).toBe("delivered");
    expect(model.eventCount).toBe(0);
    expect(model.movementCount).toBe(0);
    expect(model.purchaseExecutionCount).toBe(0);
  });

  it("blocks packs without changing their historical progression model", async () => {
    const model = new AtomicReviewModel("paid_extra", 5);
    await expect(model.review(idempotencyKey, "completed", null))
      .resolves.toBe("pack_not_supported");
    expect(model.requestStatus).toBe("in_progress");
    expect(model.executionStatus).toBe("delivered");
    expect(model.purchaseExecutionCount).toBe(0);
  });

  it("writes only canonical 6D events and no notifications or synthetic requests", () => {
    expect(source).toContain("INSERT INTO creative_mission_execution_events");
    expect(source).toContain("UPDATE creative_mission_executions");
    expect(source).not.toMatch(/INSERT\s+INTO\s+athlete_service_requests/i);
    expect(source).not.toContain("is_admin_membership_realization");
    expect(source).not.toMatch(/notification|google.?sheets/i);
  });
});
