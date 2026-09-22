import { describe, expect, it, vi } from "vitest";
import { createAdminAthleteSubscriptionHandlers } from "@/app/api/admin/athlete-subscriptions/route";
import type { AthleteMembershipPlan } from "@/lib/athlete-credits";
import type { AdminAthleteMembership } from "@/lib/athlete-memberships";

const plan: AthleteMembershipPlan = {
  code: "essential",
  name: "Essential",
  active: true,
  durationMonths: 12,
  annualPriceChf: 249,
  monthlyInstallmentChf: null,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
  metadata: {},
};

const membership: AdminAthleteMembership = {
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspaceId: "workspace-session",
  athleteId: "athlete-1",
  membershipKind: "subscription",
  planCode: "essential",
  status: "active",
  effectiveStatus: "active",
  isActive: true,
  startsAt: "2026-09-14T00:00:00.000Z",
  endsAt: "2027-09-14T00:00:00.000Z",
  autoRenew: false,
  paymentInstallments: 1,
  source: "admin_manual",
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
  plan,
  balance: { production: 1, customContent: 2 },
  platformAccess: null,
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    clerkUserId: " admin-session ",
    role: "admin",
    status: "active",
    workspaceId: " workspace-session ",
  }),
  listMemberships: vi.fn().mockResolvedValue([membership]),
  listPlans: vi.fn().mockResolvedValue([plan]),
  ...overrides,
});

const request = (method: "GET" | "POST" | "PATCH") => new Request(
  "http://localhost/api/admin/athlete-subscriptions?workspaceId=workspace-client",
  { method },
);

describe("Admin athlete subscriptions compatibility API", () => {
  it("returns canonical memberships and plans for the authenticated workspace", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ memberships: [membership], plans: [plan] });
    expect(mocks.listMemberships).toHaveBeenCalledWith("workspace-session");
    expect(mocks.listPlans).toHaveBeenCalledOnce();
  });

  it("returns 401 without a Clerk identity", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });

    const response = await createAdminAthleteSubscriptionHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(401);
    expect(mocks.listMemberships).not.toHaveBeenCalled();
  });

  it.each([
    { clerkUserId: "admin-session", role: "athlete", status: "active", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "disabled", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "active", workspaceId: "" },
  ])("returns 403 without an active Admin workspace access", async (access) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(access) });

    const response = await createAdminAthleteSubscriptionHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(403);
    expect(mocks.listMemberships).not.toHaveBeenCalled();
  });

  it.each(["POST", "PATCH"] as const)("rejects historical %s writes", async (method) => {
    const response = await createAdminAthleteSubscriptionHandlers(dependencies())[method](request(method));
    const payload = await response.json() as { code: string; error: string };

    expect(response.status).toBe(409);
    expect(payload.code).toBe("historical_subscription_write_disabled");
    expect(payload.error).toContain("adhésion Athlète canonique");
  });

  it("does not reveal the compatibility endpoint to unauthorized writes", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });

    expect((await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST"))).status).toBe(401);
    expect((await createAdminAthleteSubscriptionHandlers(mocks).PATCH(request("PATCH"))).status).toBe(401);
  });

  it("returns a neutral load error when canonical listing fails", async () => {
    const mocks = dependencies({ listMemberships: vi.fn().mockRejectedValue(new Error("database detail")) });

    const response = await createAdminAthleteSubscriptionHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Impossible de charger les adhésions Athlètes." });
  });
});