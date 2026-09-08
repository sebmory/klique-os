import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "lib/athlete-service-requests.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.resolve(process.cwd(), "db/migrations/20260909_athlete_service_request_no_charge.sql"),
  "utf8",
);

const assumeNoChargeSource = source.slice(
  source.indexOf("async assumeNoCharge({ workspaceId, requestId, reason })"),
  source.indexOf("const createMemberConfirmationRepository"),
);
const startSource = source.slice(
  source.indexOf("async start({ workspaceId, requestId })"),
  source.indexOf("async complete({ workspaceId, requestId, deliveryKey })"),
);
const completeSource = source.slice(
  source.indexOf("async complete({ workspaceId, requestId, deliveryKey })"),
  source.indexOf("async confirmPayment({ workspaceId, requestId, paymentReference })"),
);
const parseInputSource = source.slice(
  source.indexOf("export const parseAthleteServiceRequestInput"),
  source.length,
);

type NoChargeStatus = "received" | "to_confirm" | "scheduled" | "refused";
type NoChargeOutcome = "transitioned" | "unchanged" | "conflict";

/** Mirrors assumeNoCharge()'s single-statement gate: no purchase, no consumption, eligible status only. */
class NoChargeModel {
  status: NoChargeStatus = "received";
  fulfillmentMode: "included_right" | "paid_extra" | "paid_with_right" | "no_charge" = "included_right";
  purchaseId: string | null = null;
  usageMovementId: string | null = null;
  noChargeReason: string | null = null;

  assumeNoCharge(reason: string): NoChargeOutcome {
    const alreadyMatches = this.fulfillmentMode === "no_charge"
      && this.status === "to_confirm"
      && this.noChargeReason === reason;
    const eligible = (this.status === "received" || this.status === "to_confirm")
      && this.purchaseId === null
      && this.usageMovementId === null;
    if (eligible && !alreadyMatches) {
      this.fulfillmentMode = "no_charge";
      this.status = "to_confirm";
      this.noChargeReason = reason;
      return "transitioned";
    }
    if (alreadyMatches) return "unchanged";
    return "conflict";
  }
}

describe("athlete service request no_charge classification", () => {
  it("requires received or to_confirm with no purchase, movement, or consumption", () => {
    expect(assumeNoChargeSource).toContain("candidate.status IN ('received', 'to_confirm')");
    expect(assumeNoChargeSource).toContain("candidate.purchase_id IS NULL");
    expect(assumeNoChargeSource).toContain("candidate.usage_movement_id IS NULL");
  });

  it("classifies only from received or to_confirm and rejects an existing purchase", () => {
    const fromReceived = new NoChargeModel();
    expect(fromReceived.assumeNoCharge("Athlète blessé")).toBe("transitioned");
    expect(fromReceived.fulfillmentMode).toBe("no_charge");
    expect(fromReceived.status).toBe("to_confirm");

    const fromToConfirm = new NoChargeModel();
    fromToConfirm.status = "to_confirm";
    expect(fromToConfirm.assumeNoCharge("Geste commercial")).toBe("transitioned");

    const scheduled = new NoChargeModel();
    scheduled.status = "scheduled";
    expect(scheduled.assumeNoCharge("Trop tard")).toBe("conflict");

    const withPurchase = new NoChargeModel();
    withPurchase.purchaseId = "purchase-1";
    expect(withPurchase.assumeNoCharge("Achat déjà lié")).toBe("conflict");
  });

  it("is idempotent for a repeated identical reason but allows revising the reason", () => {
    const model = new NoChargeModel();
    expect(model.assumeNoCharge("Athlète blessé")).toBe("transitioned");

    expect(model.assumeNoCharge("Athlète blessé")).toBe("unchanged");
    expect(model.assumeNoCharge("Motif corrigé")).toBe("transitioned");
    expect(model.noChargeReason).toBe("Motif corrigé");
  });

  it("clears the client-facing fulfillment mode requirement without granting a fresh credit", () => {
    expect(assumeNoChargeSource).toContain("fulfillment_mode = 'no_charge'");
    expect(assumeNoChargeSource).toContain("snapshot_credit_type = NULL");
    expect(assumeNoChargeSource).toContain("snapshot_credit_quantity = NULL");
    expect(assumeNoChargeSource).toContain("snapshot_price_chf = NULL");
    expect(assumeNoChargeSource).toContain("no_charge_reason = ${reason}");
    expect(assumeNoChargeSource).toContain("status = 'to_confirm'");
  });

  it("never creates a purchase, credit movement, or purchase execution", () => {
    expect(assumeNoChargeSource).not.toMatch(/INSERT\s+INTO/i);
    expect(assumeNoChargeSource).not.toMatch(/athlete_credit_movements|athlete_credit_purchases|athlete_credit_purchase_executions/i);
  });

  it("is scoped to the authenticated workspace in a single atomic statement", () => {
    expect(assumeNoChargeSource).toContain("request.workspace_id = ${workspaceId}");
    expect(assumeNoChargeSource).not.toMatch(/sql\.transaction/);
  });

  it("allows no_charge to be scheduled, started, and completed like other modes", () => {
    expect(startSource).toContain("candidate.fulfillment_mode IN ('included_right', 'no_charge')");
    expect(completeSource).toContain("AND request.fulfillment_mode IN ('included_right', 'paid_extra', 'paid_with_right', 'no_charge')");
    expect(completeSource).toContain("OR candidate.fulfillment_mode = 'no_charge'");
  });

  it("completes no_charge without any movement or purchase execution", () => {
    expect(completeSource).toContain("AND candidate.fulfillment_mode = 'no_charge'");
    expect(completeSource).toContain("THEN 'unchanged'");
  });

  it("never proposes no_charge to the member", () => {
    expect(parseInputSource).toContain('if (input.fulfillmentMode === "no_charge")');
    expect(parseInputSource).toContain('"invalid_fulfillment_mode"');
  });

  it("prepares only the additive no_charge_reason column and constraint, without executing or mutating data", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS no_charge_reason TEXT NULL");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS athlete_service_requests_no_charge_reason_check");
    expect(migration).toContain("ADD CONSTRAINT athlete_service_requests_no_charge_reason_check");
    expect(migration).toContain("(fulfillment_mode = 'no_charge') = (NULLIF(btrim(no_charge_reason), '') IS NOT NULL)");
    expect(migration).not.toMatch(/INSERT\s+INTO|UPDATE\s+athlete_service_requests\s+SET/i);
  });
});
