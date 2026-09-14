import { describe, expect, it, vi } from "vitest";
import { createAthleteSubscriptionHandlers } from "@/app/api/athlete/subscription/route";
import type { AthleteSubscription } from "@/lib/athlete-subscriptions/service";
import { isAthleteAllowedRoute } from "@/proxy";

const activeSubscription: AthleteSubscription = {
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspaceId: "workspace-session",
  athleteId: "athlete-session",
  planCode: "impact",
  status: "active",
  startsOn: "2026-09-14",
  endsOn: "2027-09-14",
  isFounder: false,
  isComplimentary: true,
  priceChf: 549,
  discountPercent: 20,
  photoSessionsIncluded: 1,
  mediaDaysIncluded: 1,
  competitionSessionsIncluded: 0,
  customContentsIncluded: 4,
  createdByClerkUserId: "admin-secret",
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
};

const founderSubscription: AthleteSubscription = {
  ...activeSubscription,
  planCode: "founder",
  isFounder: true,
  isComplimentary: true,
  priceChf: 0,
  discountPercent: 0,
  photoSessionsIncluded: 0,
  mediaDaysIncluded: 0,
  competitionSessionsIncluded: 0,
  customContentsIncluded: 0,
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    role: "athlete",
    status: "active",
    workspaceId: " workspace-session ",
    athleteId: " athlete-session ",
  }),
  getActiveSubscription: vi.fn().mockResolvedValue(activeSubscription),
  ...overrides,
});

const athleteRequest = () => new Request(
  "http://localhost/api/athlete/subscription?workspaceId=workspace-client&athleteId=athlete-client",
);

describe("Athlete subscription API", () => {
  it("loads only the active subscription identified by the session", async () => {
    const mocks = dependencies();

    const response = await createAthleteSubscriptionHandlers(mocks).GET(athleteRequest());

    expect(response.status).toBe(200);
    expect(mocks.getActiveSubscription).toHaveBeenCalledWith("workspace-session", "athlete-session");
  });

  it("returns a public subscription with its resolved catalog details", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies()).GET(athleteRequest());
    const payload = await response.json();

    expect(payload.subscription).toMatchObject({
      id: activeSubscription.id,
      planCode: "impact",
      priceChf: 549,
      catalog: {
        code: "impact",
        name: "Impact",
        annualPriceChf: 549,
        aLaCarteDiscountPercent: 20,
        customContentCount: 4,
      },
    });
    expect(payload.subscription.catalog.commonBenefits).toHaveLength(7);
    expect(payload.subscription.catalog.contentFormats).toHaveLength(12);
    expect(payload.subscription.catalog.includedProductions).toEqual([
      { kind: "photo_session", imageCount: 20 },
      { kind: "media_day", portraitCount: 35, interviewDurationMinutes: [5, 6] },
    ]);
  });

  it("never exposes internal identity or creator fields", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies()).GET(athleteRequest());
    const payload = await response.json();

    expect(payload.subscription).not.toHaveProperty("workspaceId");
    expect(payload.subscription).not.toHaveProperty("athleteId");
    expect(payload.subscription).not.toHaveProperty("createdByClerkUserId");
    expect(JSON.stringify(payload)).not.toContain("admin-secret");
  });

  it("returns the public internal Founder catalog without formats or guaranteed productions", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies({
      getActiveSubscription: vi.fn().mockResolvedValue(founderSubscription),
    })).GET(athleteRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.subscription).toMatchObject({
      planCode: "founder",
      isFounder: true,
      isComplimentary: true,
      priceChf: 0,
      discountPercent: 0,
      photoSessionsIncluded: 0,
      mediaDaysIncluded: 0,
      competitionSessionsIncluded: 0,
      customContentsIncluded: 0,
      catalog: {
        code: "founder",
        name: "Membre fondateur",
        annualPriceChf: 0,
        inheritsFrom: null,
        includedProductions: [],
        customContentCount: 0,
        aLaCarteDiscountPercent: 0,
        contentFormats: [],
      },
    });
    expect(payload.subscription.catalog.commonBenefits).toHaveLength(7);
    expect(payload.subscription).not.toHaveProperty("workspaceId");
    expect(payload.subscription).not.toHaveProperty("athleteId");
    expect(payload.subscription).not.toHaveProperty("createdByClerkUserId");
    expect(JSON.stringify(payload)).not.toContain("admin-secret");
  });

  it("returns subscription null when the athlete has no active subscription", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies({
      getActiveSubscription: vi.fn().mockResolvedValue(null),
    })).GET(athleteRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ subscription: null });
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
    expect(mocks.getActiveSubscription).not.toHaveBeenCalled();
  });

  it("returns a generic server error", async () => {
    const response = await createAthleteSubscriptionHandlers(dependencies({
      getActiveSubscription: vi.fn().mockRejectedValue(new Error("database detail")),
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