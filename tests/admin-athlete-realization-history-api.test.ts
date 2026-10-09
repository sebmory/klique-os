import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), athletes: vi.fn(), membership: vi.fn(),
  plans: vi.fn(), summary: vi.fn(), history: vi.fn(),
}));
vi.mock("@/lib/clerk-access/service", () => ({ getCurrentUserAccessProfile: mocks.access }));
vi.mock("@/lib/google-sheets", () => ({ getAthletesFromGoogleSheets: mocks.athletes }));
vi.mock("@/lib/athlete-memberships", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/athlete-memberships")>(),
  getCurrentAthleteMembership: mocks.membership,
}));
vi.mock("@/lib/athlete-credits", () => ({ listActiveAthleteMembershipPlans: mocks.plans }));
vi.mock("@/lib/athlete-membership-service-summary", () => ({ getAthleteMembershipServiceSummary: mocks.summary }));
vi.mock("@/lib/athlete-membership-service-realizations", () => ({ listAthleteAdminServiceRealizations: mocks.history }));
import { GET } from "@/app/api/admin/athletes/[athleteId]/membership/route";

const membership = {
  id: "membership-1", workspaceId: "workspace-a", athleteId: "athlete-1",
};
const request = new Request("http://localhost/membership") as NextRequest;
const context = { params: Promise.resolve({ athleteId: "athlete-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ userAccess: { role: "admin", status: "active", workspaceId: "workspace-a" } });
  mocks.athletes.mockResolvedValue([{ key: "athlete-1", adhesionDate: "2026-01-01" }]);
  mocks.membership.mockResolvedValue({ isActive: true, membership });
  mocks.plans.mockResolvedValue([]);
  mocks.summary.mockResolvedValue({ membershipId: membership.id });
  mocks.history.mockResolvedValue([{ realizationId: "admin-realization", cancellation: { reason: "Erreur" } }]);
});

describe("Membership Admin realization history API", () => {
  it("loads history only for the server-selected membership and authorized scopes", async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(mocks.history).toHaveBeenCalledWith({
      workspaceId: "workspace-a", athleteId: "athlete-1", membershipId: membership.id,
    });
    expect(await response.json()).toMatchObject({
      realizations: [{ realizationId: "admin-realization", cancellation: { reason: "Erreur" } }],
      serviceSummary: { membershipId: membership.id },
    });
  });

  it("preserves history for an expired membership even without a service summary", async () => {
    mocks.membership.mockResolvedValue({ isActive: false, membership });
    const response = await GET(request, context);
    expect(await response.json()).toMatchObject({
      serviceSummary: null, realizations: [{ realizationId: "admin-realization" }],
    });
    expect(mocks.summary).not.toHaveBeenCalled();
  });

  it("does not load Admin realizations for the ordinary historical fallback", async () => {
    mocks.membership.mockResolvedValue({ isActive: true, origin: "historical", membership: null });
    expect(await (await GET(request, context)).json()).toMatchObject({ realizations: [], serviceSummary: null });
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it.each([{ role: "athlete" }, { status: "inactive" }, { workspaceId: "" }])(
    "forbids unauthorized history access %j", async (override) => {
      mocks.access.mockResolvedValue({ userAccess: { role: "admin", status: "active", workspaceId: "workspace-a", ...override } });
      expect((await GET(request, context)).status).toBe(403);
      expect(mocks.history).not.toHaveBeenCalled();
    },
  );
});
