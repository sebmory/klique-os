import { describe, expect, it, vi } from "vitest";
import { createAthleteSubscriptionHandlers } from "@/app/api/athlete/subscription/route";
import type { AthleteMembershipPlan } from "@/lib/athlete-credits";
import type { CurrentAthleteMembership } from "@/lib/athlete-memberships";
import { isAthleteAllowedRoute } from "@/proxy";

const membership = {
  id: "membership-impact",
  workspaceId: "workspace-session",
  athleteId: "athlete-session",
  membershipKind: "subscription" as const,
  planCode: "impact",
  status: "active" as const,
  startsAt: "2026-09-14T08:00:00.000Z",
  endsAt: "2027-09-14T08:00:00.000Z",
  autoRenew: true,
  paymentInstallments: 1,
  source: "admin_manual",
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
};

const currentMembership: CurrentAthleteMembership = {
  origin: "neon",
  membership,
  status: "active",
  isActive: true,
  startsAt: membership.startsAt,
  endsAt: membership.endsAt,
};

const founderMembership: CurrentAthleteMembership = {
  ...currentMembership,
  membership: {
    ...membership,
    id: "membership-founder",
    membershipKind: "founder",
    planCode: null,
    autoRenew: false,
    paymentInstallments: null,
    source: "legacy_founder_migration",
  },
};

const impactPlan: AthleteMembershipPlan = {
  code: "impact",
  name: "Impact",
  active: true,
  durationMonths: 12,
  annualPriceChf: 549,
  monthlyInstallmentChf: 46,
  productionCredits: 2,
  customContentCredits: 4,
  videoAllowed: true,
  metadata: {},
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    role: "athlete",
    status: "active",
    workspaceId: " workspace-session ",
    athleteId: " athlete-session ",
  }),
  getCurrentMembership: vi.fn().mockResolvedValue(currentMembership),
  listPlans: vi.fn().mockResolvedValue([impactPlan]),
  getCreditBalance: vi.fn().mockResolvedValue({ production: 1, custom_content: 3 }),
  getContentRequestSubscriptionId: vi.fn().mockResolvedValue("subscription-reference"),
  ...overrides,
});

const athleteRequest = () => new Request(
  "http://localhost/api/athlete/subscription?workspaceId=workspace-client&athleteId=athlete-client",
);

describe("Athlete subscription API", () => {
  it("loads only the current membership identified by the session", async () => {
    const mocks = dependencies();

    const response = await createAthleteSubscriptionHandlers(mocks).GET(athleteRequest());

    expect(response.status).toBe(200);
    expect(mocks.getCurrentMembership).toHaveBeenCalledWith("workspace-session", "athlete-session");
  });

  it("returns the canonical plan and credit balances", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies()).GET(athleteRequest());
    const payload = await response.json();

    expect(payload.pass).toMatchObject({
      id: membership.id,
      contentRequestSubscriptionId: "subscription-reference",
      membershipKind: "subscription",
      planCode: "impact",
      startsAt: membership.startsAt,
      endsAt: membership.endsAt,
      catalog: {
        code: "impact",
        name: "Impact",
        annualPriceChf: 549,
        productionCreditCount: 2,
        customContentCount: 4,
        videoAllowed: true,
      },
      credits: {
        production: { included: 2, available: 1 },
        customContent: { included: 4, available: 3 },
      },
    });
    expect(payload.pass.catalog.commonBenefits).toHaveLength(7);
    expect(payload.pass.catalog.contentFormats).toHaveLength(12);
  });

  it.each([
    ["essential", "Essentiel", 249, 1, 2, false],
    ["impact", "Impact", 549, 2, 4, true],
    ["signature", "Signature", 999, 3, 6, true],
  ] as const)(
    "uses the canonical %s catalog",
    async (code, name, annualPriceChf, productionCredits, customContentCredits, videoAllowed) => {
      const plan: AthleteMembershipPlan = {
        ...impactPlan,
        code,
        name,
        annualPriceChf,
        productionCredits,
        customContentCredits,
        videoAllowed,
      };
      const response = await createAthleteSubscriptionHandlers(dependencies({
        getCurrentMembership: vi.fn().mockResolvedValue({
          ...currentMembership,
          membership: { ...membership, planCode: code },
        }),
        listPlans: vi.fn().mockResolvedValue([plan]),
        getCreditBalance: vi.fn().mockResolvedValue({
          production: productionCredits,
          custom_content: customContentCredits,
        }),
      })).GET(athleteRequest());
      const payload = await response.json();

      expect(payload.pass.catalog).toMatchObject({
        code,
        name,
        annualPriceChf,
        productionCreditCount: productionCredits,
        customContentCount: customContentCredits,
        videoAllowed,
      });
      expect(payload.pass.credits).toEqual({
        production: { included: productionCredits, available: productionCredits },
        customContent: { included: customContentCredits, available: customContentCredits },
      });
    },
  );

  it("never exposes internal identity or creator fields", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies()).GET(athleteRequest());
    const payload = await response.json();

    expect(payload.pass).not.toHaveProperty("workspaceId");
    expect(payload.pass).not.toHaveProperty("athleteId");
    expect(payload.pass).not.toHaveProperty("source");
  });

  it("returns complimentary Founder access without a commercial plan or credits", async () => {
    const mocks = dependencies({
      getCurrentMembership: vi.fn().mockResolvedValue(founderMembership),
    });
    const response = await createAthleteSubscriptionHandlers(dependencies({
      ...mocks,
    })).GET(athleteRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pass).toMatchObject({
      planCode: "founder",
      isFounder: true,
      catalog: {
        code: "founder",
        name: "Membre fondateur",
        annualPriceChf: 0,
        productionCreditCount: 0,
        customContentCount: 0,
        videoAllowed: false,
        contentFormats: [],
      },
      credits: {
        production: { included: 0, available: 0 },
        customContent: { included: 0, available: 0 },
      },
    });
    expect(payload.pass.catalog.commonBenefits).toHaveLength(7);
    expect(mocks.listPlans).not.toHaveBeenCalled();
    expect(mocks.getCreditBalance).not.toHaveBeenCalled();
  });

  it("returns pass null when the athlete has no active membership", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies({
      getCurrentMembership: vi.fn().mockResolvedValue({
        ...currentMembership,
        isActive: false,
        status: "expired",
      }),
    })).GET(athleteRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ pass: null });
  });

  it.each([
    { role: "admin", status: "active", workspaceId: "workspace-session", athleteId: "athlete-session" },
    { role: "athlete", status: "disabled", workspaceId: "workspace-session", athleteId: "athlete-session" },
    { role: "athlete", status: "active", workspaceId: "", athleteId: "athlete-session" },
    { role: "athlete", status: "active", workspaceId: "workspace-session", athleteId: "" },
  ])("refuses access without an active and complete Athlete session", async (access) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(access) });

    const response = await createAthleteSubscriptionHandlers(mocks).GET(athleteRequest());

    expect(response.status).toBe(403);
    expect(mocks.getCurrentMembership).not.toHaveBeenCalled();
  });

  it("returns a generic server error", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies({
      getCurrentMembership: vi.fn().mockRejectedValue(new Error("database detail")),
    })).GET(athleteRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Impossible de charger votre abonnement pour le moment.",
    });
  });
});

describe("Athlete subscription proxy access", () => {
  it("allows only GET on the exact subscription route", () => {
    expect(isAthleteAllowedRoute("/api/athlete/subscription", "GET")).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isAthleteAllowedRoute("/api/athlete/subscription", method)).toBe(false);
    }
  });

  it("does not authorize nested or lookalike subscription routes", () => {
    expect(isAthleteAllowedRoute("/api/athlete/subscription/history", "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/api/athlete/subscriptions", "GET")).toBe(false);
  });
});