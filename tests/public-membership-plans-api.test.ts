import { describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/public/membership-plans/route";
import { createPublicMembershipPlansHandlers } from "@/app/api/public/membership-plans/route";
import type { AthleteMembershipPlan } from "@/lib/athlete-credits";
import { isPublicMembershipPlansApi } from "@/proxy";

const url = "http://localhost/api/public/membership-plans";

const plan = (overrides: Partial<AthleteMembershipPlan> = {}): AthleteMembershipPlan => ({
  code: "essential",
  name: "Essentiel",
  active: true,
  durationMonths: 12,
  annualPriceChf: 249,
  monthlyInstallmentChf: 20.75,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
  metadata: { internal: "hidden" },
  ...overrides,
});

describe("Public membership plans API", () => {
  it("returns only active commercial plans in stable product order", async () => {
    const listPlans = vi.fn().mockResolvedValue([
      plan({ code: "signature", name: "Signature", annualPriceChf: 999 }),
      plan({ code: "founder", name: "Founder", annualPriceChf: 0 }),
      plan({ code: "impact", name: "Impact", annualPriceChf: 549, videoAllowed: true }),
      plan({ code: "essential", active: false }),
      plan(),
    ]);

    const response = await createPublicMembershipPlansHandlers({ listPlans }).GET(new Request(url));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plans.map(({ code }: { code: string }) => code)).toEqual([
      "essential",
      "impact",
      "signature",
    ]);
    expect(JSON.stringify(payload)).not.toContain("founder");
  });

  it("limits every plan to the public projection without TWINT or internal data", async () => {
    const response = await createPublicMembershipPlansHandlers({
      listPlans: vi.fn().mockResolvedValue([plan()]),
    }).GET(new Request(url));

    await expect(response.json()).resolves.toEqual({
      plans: [{
        code: "essential",
        name: "Essentiel",
        annualPriceChf: 249,
        durationMonths: 12,
        productionCredits: 1,
        customContentCredits: 2,
        videoAllowed: false,
      }],
    });
  });

  it("rejects every query parameter and hides unexpected errors", async () => {
    const listPlans = vi.fn();
    const invalid = await createPublicMembershipPlansHandlers({ listPlans }).GET(
      new Request(`${url}?workspaceId=forged`),
    );
    expect(invalid.status).toBe(400);
    expect(listPlans).not.toHaveBeenCalled();

    const failed = await createPublicMembershipPlansHandlers({
      listPlans: vi.fn().mockRejectedValue(new Error("SQL secret")),
    }).GET(new Request(url));
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
  });

  it("is public for GET only and exports no write method", () => {
    expect(isPublicMembershipPlansApi("/api/public/membership-plans", "GET")).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isPublicMembershipPlansApi("/api/public/membership-plans", method)).toBe(false);
      expect(method in route).toBe(false);
    }
  });
});