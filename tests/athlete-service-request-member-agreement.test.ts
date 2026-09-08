import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "lib/athlete-service-requests.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.resolve(process.cwd(), "db/migrations/20260908_athlete_service_request_member_agreement.sql"),
  "utf8",
);

const confirmationSource = source.slice(
  source.indexOf("const createMemberConfirmationRepository"),
  source.indexOf("export const listAdminAthleteServiceRequests"),
);
const scheduleSource = source.slice(
  source.indexOf("async schedule({ workspaceId, requestId, scheduledAt })"),
  source.indexOf("async start({ workspaceId, requestId })"),
);
const refusalSource = source.slice(
  source.indexOf("async transition({ workspaceId, requestId, nextStatus, refusalReason })"),
  source.indexOf("const createMemberConfirmationRepository"),
);
const paymentSource = source.slice(
  source.indexOf("async confirmPayment({ workspaceId, requestId, paymentReference })"),
  source.indexOf("async transition({ workspaceId, requestId, nextStatus, refusalReason })"),
);

class SerializedAgreementModel {
  private lock = Promise.resolve();
  private purchaseId: string | null = null;
  purchaseCount = 0;

  async confirm() {
    let release = () => {};
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      if (this.purchaseId) return "unchanged";
      this.purchaseCount += 1;
      this.purchaseId = "pending-purchase";
      return "confirmed";
    } finally {
      release();
    }
  }
}

describe("athlete service request member agreement", () => {
  it("creates and links one pending purchase using immutable request terms", () => {
    expect(confirmationSource).toContain("sql.transaction([lockAthlete, confirmRequest, assertAgreementConsistency])");
    expect(confirmationSource).toContain("FOR UPDATE OF membership");
    expect(confirmationSource).toContain("INSERT INTO athlete_credit_purchases");
    expect(confirmationSource).toContain("candidate.included_deliverables");
    expect(confirmationSource).toContain("candidate.snapshot_price_chf");
    expect(confirmationSource).toContain("'pending', NOW(), NOW() + INTERVAL '12 months'");
    expect(confirmationSource).toContain("payment_reference, created_at, updated_at");
    expect(confirmationSource).toContain("NULL, NOW(), NOW()");
    expect(confirmationSource).toContain("SET purchase_id = purchase.id");
    expect(confirmationSource).not.toMatch(/SET\s+status\s*=/i);
  });

  it("revalidates membership, plan, product, video eligibility, and hybrid rights", () => {
    expect(confirmationSource).toContain("candidate.membership_id IS NOT NULL");
    expect(confirmationSource).toContain("candidate.plan_active = TRUE");
    expect(confirmationSource).toContain("candidate.product_active = TRUE");
    expect(confirmationSource).toContain("candidate.plan_code = ANY(candidate.allowed_plan_codes)");
    expect(confirmationSource).toContain("candidate.video_allowed = TRUE");
    expect(confirmationSource).toContain("candidate.credit_balance - candidate.reserved_quantity");
    expect(confirmationSource).toContain("candidate.snapshot_credit_quantity");
  });

  it("serializes concurrent confirmations into one purchase", async () => {
    const model = new SerializedAgreementModel();

    const outcomes = await Promise.all([model.confirm(), model.confirm()]);

    expect(outcomes.sort()).toEqual(["confirmed", "unchanged"]);
    expect(model.purchaseCount).toBe(1);
    expect(confirmationSource).toContain("EXISTS (SELECT 1 FROM existing_purchase)");
    expect(confirmationSource).toContain("request.purchase_id IS NULL");
  });

  it("does not create payment executions or credit movements", () => {
    expect(confirmationSource).not.toMatch(/INSERT\s+INTO\s+athlete_credit_purchase_executions/i);
    expect(confirmationSource).not.toMatch(/INSERT\s+INTO\s+athlete_credit_movements/i);
    expect(confirmationSource).not.toMatch(/UPDATE\s+athlete_credit_movements/i);
  });

  it("allows scheduling after agreement with a pending or paid purchase", () => {
    expect(scheduleSource).toContain("purchase.status AS purchase_status");
    expect(scheduleSource).toContain("candidate.fulfillment_mode NOT IN ('paid_extra', 'paid_with_right')");
    expect(scheduleSource).toContain("candidate.purchase_status IN ('pending', 'paid')");
  });

  it("cancels only a linked pending purchase in the same refusal statement", () => {
    expect(refusalSource).toContain("cancelled_purchase AS");
    expect(refusalSource).toContain("UPDATE athlete_credit_purchases purchase");
    expect(refusalSource).toContain("SET status = 'cancelled'");
    expect(refusalSource).toContain("purchase.status = 'pending'");
    expect(refusalSource).toContain("EXISTS (SELECT 1 FROM cancelled_purchase WHERE id = candidate.purchase_id)");
    expect(refusalSource).toContain("candidate.purchase_status = 'paid' THEN 'paid_purchase'");
  });

  it("marks one coherent linked purchase paid with a durable reference", () => {
    expect(paymentSource).toContain("sql.transaction([lockRequest, confirmPayment])");
    expect(paymentSource).toContain("FOR UPDATE");
    expect(paymentSource).toContain("SET status = 'paid', payment_reference = ${paymentReference}, updated_at = NOW()");
    expect(paymentSource).toContain("purchase.workspace_id = candidate.workspace_id");
    expect(paymentSource).toContain("purchase.athlete_id = candidate.athlete_id");
    expect(paymentSource).toContain("purchase.amount_chf = candidate.snapshot_price_chf");
    expect(paymentSource).toContain("candidate.status <> 'refused'");
    expect(paymentSource).toContain("candidate.purchase_status = 'pending'");
  });

  it("makes payment confirmation idempotent only for the same reference", () => {
    expect(paymentSource).toContain("candidate.purchase_status = 'paid'");
    expect(paymentSource).toContain("candidate.payment_reference = ${paymentReference} THEN 'unchanged'");
  });

  it("does not debit externally, move credits, or execute a purchase when recording payment", () => {
    expect(paymentSource).not.toMatch(/INSERT\s+INTO/i);
    expect(paymentSource).not.toMatch(/athlete_credit_movements/i);
    expect(paymentSource).not.toMatch(/athlete_credit_purchase_executions/i);
    expect(paymentSource).not.toMatch(/stripe|checkout|payment_intent|(?<!no_)charge|debit/i);
  });

  it("prepares only the constraint change needed for an early paid purchase link", () => {
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS athlete_service_requests_final_link_check");
    expect(migration).toContain("ADD CONSTRAINT athlete_service_requests_final_link_check");
    expect(migration).toContain("status <> 'completed'");
    expect(migration).toContain("usage_movement_id IS NULL");
    expect(migration).toContain("fulfillment_mode = 'paid_extra' AND purchase_id IS NOT NULL");
    expect(migration).toContain("fulfillment_mode = 'paid_with_right' AND purchase_id IS NOT NULL AND usage_movement_id IS NOT NULL");
    expect(migration).not.toMatch(/INSERT\s+INTO/i);
  });
});