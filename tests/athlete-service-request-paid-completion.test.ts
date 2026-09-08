import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

type DeliveryStatus = "scheduled" | "in_progress" | "completed";
type DeliveryOutcome = "transitioned" | "unchanged" | "conflict";

/**
 * Mirrors the shared-lock, guard, and rollback semantics of the SQL in complete(),
 * for a single purchase whose progress is the sum of its executions. Each call
 * carries the caller's stable delivery key, exactly like deliveryReferenceId in the SQL.
 */
class SerializedDeliveryModel {
  private lock = Promise.resolve();
  private readonly deliveredKeys = new Set<string>();
  status: DeliveryStatus = "scheduled";
  deliveredQuantity = 0;
  movementCreated = false;
  executionCount = 0;

  constructor(
    private readonly fulfillmentMode: "paid_extra" | "paid_with_right",
    private readonly purchasedQuantity: number,
    public purchaseStatus: "pending" | "paid",
  ) {}

  start(): DeliveryOutcome {
    if (this.status === "in_progress") return "unchanged";
    if (this.status !== "scheduled") return "conflict";
    if (this.purchaseStatus !== "paid") return "conflict";
    this.status = "in_progress";
    return "transitioned";
  }

  async complete(key: string, failAfterInsert = false): Promise<DeliveryOutcome> {
    let release = () => {};
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = {
      status: this.status,
      deliveredQuantity: this.deliveredQuantity,
      movementCreated: this.movementCreated,
      executionCount: this.executionCount,
    };
    try {
      if (this.purchaseStatus !== "paid") return "conflict";
      if (this.deliveredKeys.has(key)) return "unchanged";
      if (this.status === "completed" && this.deliveredQuantity === this.purchasedQuantity) return "unchanged";
      if (this.status !== "in_progress") return "conflict";
      if (this.deliveredQuantity >= this.purchasedQuantity) return "unchanged";

      this.executionCount += 1;
      this.deliveredQuantity += 1;
      this.deliveredKeys.add(key);
      if (this.fulfillmentMode === "paid_with_right") this.movementCreated = true;
      if (failAfterInsert) throw new Error("completion failed");
      if (this.deliveredQuantity === this.purchasedQuantity) this.status = "completed";
      return "transitioned";
    } catch (error) {
      this.status = snapshot.status;
      this.deliveredQuantity = snapshot.deliveredQuantity;
      this.movementCreated = snapshot.movementCreated;
      this.executionCount = snapshot.executionCount;
      this.deliveredKeys.delete(key);
      throw error;
    } finally {
      release();
    }
  }
}

describe("athlete service request paid start/complete", () => {
  it("gates paid start on a paid purchase under the shared Athlete lock", () => {
    expect(startSource).toContain("sql.transaction([lockAthleteBalance, startRequest])");
    expect(startSource).toContain("FOR UPDATE OF membership");
    expect(startSource).toContain("candidate.fulfillment_mode IN ('paid_extra', 'paid_with_right')");
    expect(startSource).toContain("candidate.purchase_status = 'paid'");
  });

  it("rejects start and completion when the linked purchase is not paid", async () => {
    const model = new SerializedDeliveryModel("paid_extra", 1, "pending");

    expect(model.start()).toBe("conflict");
    model.status = "in_progress";
    expect(await model.complete("delivery-1")).toBe("conflict");
    expect(model.executionCount).toBe(0);
  });

  it("consumes reserved credit and completes a paid_with_right conversion in one atomic step", async () => {
    expect(completeSource).toContain("candidate.fulfillment_mode = 'paid_with_right'");
    expect(completeSource).toContain("candidate.fulfillment_mode <> 'paid_with_right' OR EXISTS (SELECT 1 FROM coherent_movement)");
    expect(completeSource).toContain("AND EXISTS (SELECT 1 FROM coherent_movement)");
    expect(completeSource).toContain("AND EXISTS (SELECT 1 FROM inserted_execution)");

    const model = new SerializedDeliveryModel("paid_with_right", 1, "paid");
    expect(model.start()).toBe("transitioned");

    expect(await model.complete("delivery-1")).toBe("transitioned");
    expect(model.movementCreated).toBe(true);
    expect(model.deliveredQuantity).toBe(1);
    expect(model.status).toBe("completed");
    expect(await model.complete("delivery-1")).toBe("unchanged");
  });

  it("rolls back both the movement and the execution together when completion fails", async () => {
    const model = new SerializedDeliveryModel("paid_with_right", 1, "paid");
    model.start();

    await expect(model.complete("delivery-1", true)).rejects.toThrow("completion failed");
    expect(model.movementCreated).toBe(false);
    expect(model.deliveredQuantity).toBe(0);
    expect(model.status).toBe("in_progress");
  });

  it("delivers a 5-pack progressively and only completes after the fifth delivery", async () => {
    expect(completeSource).toContain("candidate.purchase_quantity IS NOT NULL");
    expect(completeSource).toContain("candidate.delivered_quantity < candidate.purchase_quantity");
    expect(completeSource).toContain("candidate.delivered_quantity + 1 < candidate.purchase_quantity");

    const model = new SerializedDeliveryModel("paid_extra", 5, "paid");
    model.start();

    for (let delivery = 1; delivery <= 4; delivery += 1) {
      expect(await model.complete(`delivery-${delivery}`)).toBe("transitioned");
      expect(model.status).toBe("in_progress");
      expect(model.deliveredQuantity).toBe(delivery);
    }
    expect(await model.complete("delivery-5")).toBe("transitioned");
    expect(model.deliveredQuantity).toBe(5);
    expect(model.status).toBe("completed");
  });

  it("never exceeds the purchased quantity and is idempotent on repetition", async () => {
    const model = new SerializedDeliveryModel("paid_extra", 5, "paid");
    model.start();
    for (let i = 1; i <= 5; i += 1) await model.complete(`delivery-${i}`);

    expect(await model.complete("delivery-5")).toBe("unchanged");
    expect(await model.complete("delivery-5")).toBe("unchanged");
    expect(model.executionCount).toBe(5);
    expect(model.deliveredQuantity).toBe(5);
  });

  it("is idempotent on repetition after a mid-pack success whose response was lost", async () => {
    const model = new SerializedDeliveryModel("paid_extra", 5, "paid");
    model.start();
    await model.complete("delivery-1");
    await model.complete("delivery-2");

    expect(await model.complete("delivery-2")).toBe("unchanged");

    expect(model.deliveredQuantity).toBe(2);
    expect(model.executionCount).toBe(2);
    expect(model.status).toBe("in_progress");

    expect(await model.complete("delivery-3")).toBe("transitioned");
    expect(model.deliveredQuantity).toBe(3);
  });

  it("serializes concurrent retries of the same delivery key into a single execution", async () => {
    const model = new SerializedDeliveryModel("paid_extra", 5, "paid");
    model.start();
    await model.complete("delivery-1");
    await model.complete("delivery-2");

    const outcomes = await Promise.all([model.complete("delivery-3"), model.complete("delivery-3")]);

    expect(outcomes.sort()).toEqual(["transitioned", "unchanged"]);
    expect(model.deliveredQuantity).toBe(3);
    expect(model.executionCount).toBe(3);
    expect(model.status).toBe("in_progress");
  });

  it("serializes two distinct intentional deliveries racing near the cap", async () => {
    const model = new SerializedDeliveryModel("paid_extra", 5, "paid");
    model.start();
    for (let i = 1; i <= 4; i += 1) await model.complete(`delivery-${i}`);
    expect(model.deliveredQuantity).toBe(4);

    const outcomes = await Promise.all([model.complete("delivery-5-a"), model.complete("delivery-5-b")]);

    expect(outcomes.sort()).toEqual(["transitioned", "unchanged"]);
    expect(model.deliveredQuantity).toBe(5);
    expect(model.executionCount).toBe(5);
    expect(model.status).toBe("completed");
  });

  it("creates each delivery as an immutable execution referenced by the caller's stable delivery key", () => {
    expect(completeSource).toContain("const deliveryReferenceId = `${referenceId}:delivery:${deliveryKey}`");
    expect(completeSource).toContain("INSERT INTO athlete_credit_purchase_executions");
    expect(completeSource).toContain("SELECT ${executionId}::uuid, candidate.purchase_id, 1, NOW(),");
    expect(completeSource).toContain("${deliveryReferenceId}, NOW()");
    expect(completeSource).toContain("ON CONFLICT DO NOTHING");
    expect(completeSource).not.toMatch(/delivery:'\s*\|\|\s*\(candidate\.delivered_quantity/);
  });

  it("treats a retry with the same delivery key as an idempotent no-op instead of a new delivery", () => {
    expect(completeSource).toContain("existing_delivery.id AS existing_delivery_id");
    expect(completeSource).toContain("execution.reference_id = ${deliveryReferenceId}");
    expect(completeSource).toContain("AND candidate.existing_delivery_id IS NULL");
    expect(completeSource).toContain("AND candidate.existing_delivery_id IS NOT NULL");
    expect(completeSource).toContain("THEN 'unchanged'");
  });

  it("asserts delivered quantity never exceeds and matches the purchased quantity when completed", () => {
    expect(completeSource).toContain("delivered.quantity <= purchase.quantity");
    expect(completeSource).toContain("request.status <> 'completed' OR delivered.quantity = purchase.quantity");
  });

  it("does not call any external payment provider while starting or completing", () => {
    expect(startSource).not.toMatch(/stripe|checkout|payment_intent|(?<!no_)charge|debit/i);
    expect(completeSource).not.toMatch(/stripe|checkout|payment_intent|(?<!no_)charge|debit/i);
  });
});
