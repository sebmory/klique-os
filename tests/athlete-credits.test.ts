import { describe, expect, it } from "vitest";
import {
  calculateAthleteCreditBalance,
  canConsumeAthleteService,
  type AthleteCreditMovement,
  type AthleteMembershipPlan,
} from "@/lib/athlete-credits";

const movement = (overrides: Partial<AthleteCreditMovement>): AthleteCreditMovement => ({
  id: "movement-1",
  workspaceId: "klique-os",
  athleteId: "athlete-1",
  membershipId: "membership-1",
  creditType: "production",
  quantity: 1,
  source: "plan_grant",
  referenceId: null,
  expiresAt: "2027-09-01T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

const essentialPlan: AthleteMembershipPlan = {
  code: "essential",
  name: "Essentiel",
  active: true,
  durationMonths: 12,
  annualPriceChf: 249,
  monthlyInstallmentChf: 21,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
  metadata: {},
};

describe("athlete credit calculations", () => {
  it("calculates balances from signed movements", () => {
    const balance = calculateAthleteCreditBalance([
      movement({ id: "grant-production", quantity: 3 }),
      movement({ id: "usage-production", quantity: -1, source: "usage" }),
      movement({ id: "grant-custom", creditType: "custom_content", quantity: 6 }),
      movement({ id: "usage-custom", creditType: "custom_content", quantity: -2, source: "usage" }),
    ], new Date("2026-10-01T00:00:00.000Z"));

    expect(balance).toEqual({ production: 2, custom_content: 4 });
  });

  it("excludes expired movements from the balance", () => {
    const balance = calculateAthleteCreditBalance([
      movement({ id: "expired", quantity: 3, expiresAt: "2026-08-31T23:59:59.000Z" }),
      movement({ id: "valid", quantity: 2, expiresAt: "2027-09-01T00:00:00.000Z" }),
    ], new Date("2026-09-01T00:00:00.000Z"));

    expect(balance.production).toBe(2);
  });

  it("forbids simple video with the Essential plan", () => {
    const result = canConsumeAthleteService({
      serviceType: "simple_video",
      plan: essentialPlan,
      balance: { production: 10, custom_content: 2 },
    });

    expect(result).toMatchObject({ allowed: false, reason: "video_not_allowed", creditsRequired: 2 });
  });

  it("requires two production credits for a simple video", () => {
    const impactPlan = { ...essentialPlan, code: "impact", name: "Impact", videoAllowed: true };

    expect(canConsumeAthleteService({
      serviceType: "simple_video",
      plan: impactPlan,
      balance: { production: 2, custom_content: 0 },
    })).toMatchObject({ allowed: true, creditType: "production", creditsRequired: 2 });

    expect(canConsumeAthleteService({
      serviceType: "simple_video",
      plan: impactPlan,
      balance: { production: 1, custom_content: 0 },
    })).toMatchObject({ allowed: false, reason: "insufficient_credits", creditsRequired: 2 });
  });
});