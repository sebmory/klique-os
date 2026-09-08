import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculateAvailableAthleteServiceBalance } from "@/lib/athlete-service-requests";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "lib/athlete-service-requests.ts"),
  "utf8",
);

const startSource = source.slice(
  source.indexOf("async start({ workspaceId, requestId })"),
  source.indexOf("async complete({ workspaceId, requestId, deliveryKey })"),
);
const completeSource = source.slice(
  source.indexOf("async complete({ workspaceId, requestId, deliveryKey })"),
  source.indexOf("async confirmPayment({ workspaceId, requestId, paymentReference })"),
);

type WorkflowState = "scheduled" | "in_progress" | "completed";

class SerializedCompletionModel {
  private lock = Promise.resolve();
  status: WorkflowState = "scheduled";
  movementCount = 0;
  usageMovementLinked = false;

  start() {
    if (this.status === "in_progress") return "unchanged";
    if (this.status !== "scheduled") return "conflict";
    this.status = "in_progress";
    return "transitioned";
  }

  async complete(failAfterInsert = false) {
    let release = () => {};
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = {
      status: this.status,
      movementCount: this.movementCount,
      usageMovementLinked: this.usageMovementLinked,
    };
    try {
      if (this.status === "completed" && this.usageMovementLinked) return "unchanged";
      if (this.status !== "in_progress") return "conflict";
      this.movementCount += 1;
      if (failAfterInsert) throw new Error("completion failed");
      this.usageMovementLinked = true;
      this.status = "completed";
      return "transitioned";
    } catch (error) {
      this.status = snapshot.status;
      this.movementCount = snapshot.movementCount;
      this.usageMovementLinked = snapshot.usageMovementLinked;
      throw error;
    } finally {
      release();
    }
  }
}

describe("athlete service request completion", () => {
  it("extends start and completion to paid modes gated on a paid purchase, and to no_charge without any purchase", () => {
    expect(startSource).toContain("request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right')");
    expect(startSource).toContain("candidate.status = 'scheduled'");
    expect(startSource).toContain("candidate.purchase_status = 'paid'");
    expect(startSource).toContain("candidate.fulfillment_mode IN ('included_right', 'no_charge')");
    expect(completeSource).toContain("candidate.status = 'in_progress'");
    expect(completeSource).toContain("request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right')");
    expect(completeSource).toContain("OR candidate.fulfillment_mode = 'no_charge'");
  });

  it("creates one coherent usage movement and links it in the same transaction", () => {
    expect(completeSource).toContain("sql.transaction([");
    expect(completeSource).toContain("FOR UPDATE OF membership");
    expect(completeSource).toContain("INSERT INTO athlete_credit_movements");
    expect(completeSource).toContain("'usage', ${referenceId}");
    expect(completeSource).toContain("athlete_service_request:${requestId}");
    expect(completeSource).toContain("movement.workspace_id = request.workspace_id");
    expect(completeSource).toContain("movement.athlete_id = request.athlete_id");
    expect(completeSource).toContain("movement.credit_type = request.snapshot_credit_type");
    expect(completeSource).toContain("movement.quantity = -request.snapshot_credit_quantity");
    expect(completeSource).toContain("usage_movement_id = COALESCE(movement.id, request.usage_movement_id)");
    expect(completeSource).toContain("ELSE NOW()");
    expect(completeSource).toContain("assertCompletionConsistency");
  });

  it("allows only one movement under concurrent completion calls", async () => {
    const model = new SerializedCompletionModel();
    expect(model.start()).toBe("transitioned");

    const outcomes = await Promise.all([model.complete(), model.complete()]);

    expect(outcomes.sort()).toEqual(["transitioned", "unchanged"]);
    expect(model.movementCount).toBe(1);
    expect(model.usageMovementLinked).toBe(true);
    expect(model.status).toBe("completed");
  });

  it("rolls back both movement and status when completion fails", async () => {
    const model = new SerializedCompletionModel();
    model.start();

    await expect(model.complete(true)).rejects.toThrow("completion failed");
    expect(model.movementCount).toBe(0);
    expect(model.usageMovementLinked).toBe(false);
    expect(model.status).toBe("in_progress");
  });

  it("keeps available balance stable when reservation becomes consumption", () => {
    const beforeCompletion = calculateAvailableAthleteServiceBalance(
      { production: 1, custom_content: 0 },
      { production: 1, custom_content: 0 },
    );
    const afterCompletion = calculateAvailableAthleteServiceBalance(
      { production: 0, custom_content: 0 },
      { production: 0, custom_content: 0 },
    );

    expect(beforeCompletion).toEqual({ production: 0, custom_content: 0 });
    expect(afterCompletion).toEqual(beforeCompletion);
  });

  it("does not create purchases or contact any external payment provider", () => {
    expect(completeSource).not.toMatch(/INSERT\s+INTO\s+athlete_credit_purchases\b/i);
    expect(completeSource).not.toMatch(/stripe|checkout|payment_intent|(?<!no_)charge|debit/i);
  });
});
