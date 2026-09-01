import { describe, expect, it, vi } from "vitest";
import {
  grantAnnualPlanCredits,
  type AnnualPlanCreditGrantExecutor,
  type AthleteCreditMovement,
} from "@/lib/athlete-credits";

const cycleStart = "2026-09-01T00:00:00.000Z";
const cycleEnd = "2027-09-01T00:00:00.000Z";

const eligibility = {
  membershipStatus: "active",
  membershipKind: "subscription",
  membershipStartsAt: cycleStart,
  membershipEndsAt: cycleEnd,
  planCode: "essential",
  planActive: true,
  durationMonths: 12,
  productionCredits: 1,
  customContentCredits: 2,
};

const movement = (creditType: "production" | "custom_content", quantity: number): AthleteCreditMovement => ({
  id: `${creditType}-movement`,
  workspaceId: "klique-os",
  athleteId: "athlete-1",
  membershipId: "membership-1",
  creditType,
  quantity,
  source: "plan_grant",
  referenceId: `plan-cycle:membership-1:${cycleStart}`,
  expiresAt: cycleEnd,
  createdAt: cycleStart,
});

const grant = (execute: AnnualPlanCreditGrantExecutor) => grantAnnualPlanCredits({
  workspaceId: "klique-os",
  athleteId: "athlete-1",
  membershipId: "membership-1",
  cycleStart,
  execute,
});

describe("grantAnnualPlanCredits", () => {
  it("grants the Essential plan entitlements", async () => {
    const execute = vi.fn().mockResolvedValue({
      eligibility,
      movements: [movement("production", 1), movement("custom_content", 2)],
    });

    const result = await grant(execute);

    expect(result.status).toBe("granted");
    expect(result.movements.map(({ creditType, quantity }) => ({ creditType, quantity }))).toEqual([
      { creditType: "production", quantity: 1 },
      { creditType: "custom_content", quantity: 2 },
    ]);
  });

  it("expires both grants at the end of the annual cycle", async () => {
    const execute = vi.fn().mockResolvedValue({ eligibility, movements: [] });

    const result = await grant(execute);

    expect(result.expiresAt).toBe(cycleEnd);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: cycleEnd }));
  });

  it("is idempotent when the annual cycle was already granted", async () => {
    const execute = vi.fn().mockResolvedValue({ eligibility, movements: [] });

    const result = await grant(execute);

    expect(result.status).toBe("already_granted");
    expect(result.movements).toEqual([]);
  });

  it("refuses a membership without a plan", async () => {
    const execute = vi.fn().mockResolvedValue({ eligibility: { ...eligibility, planCode: null }, movements: [] });

    await expect(grant(execute)).resolves.toMatchObject({ status: "not_eligible", reason: "missing_plan" });
  });

  it("refuses an inactive membership", async () => {
    const execute = vi.fn().mockResolvedValue({ eligibility: { ...eligibility, membershipStatus: "expired" }, movements: [] });

    await expect(grant(execute)).resolves.toMatchObject({ status: "not_eligible", reason: "membership_inactive" });
  });
});