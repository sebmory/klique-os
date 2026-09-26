import { describe, expect, it, vi } from "vitest";
import * as activationRoute from "@/app/api/admin/athlete-membership-prospect-orders/[orderId]/activate/route";
import { createAdminAthleteMembershipProspectOrderActivationHandlers } from "@/app/api/admin/athlete-membership-prospect-orders/[orderId]/activate/route";
import {
  AthleteMembershipProspectOrderError,
  type ActivatedAthleteMembershipProspectOrder,
} from "@/lib/athlete-membership-prospect-orders";

const orderId = "11111111-1111-4111-8111-111111111111";
const athleteId = "lina-morel";
const activationUrl = `http://localhost/api/admin/athlete-membership-prospect-orders/${orderId}/activate`;

const activation: ActivatedAthleteMembershipProspectOrder = {
  order: {
    id: orderId,
    workspaceId: "workspace-session",
    publicReference: "KQ-ABCDEF123456",
    verifiedEmail: "prospect@example.test",
    fullName: "Lina Morel",
    phone: "+41790000000",
    planCode: "impact",
    planName: "Impact",
    annualPriceChf: 549,
    durationMonths: 12,
    productionCredits: 2,
    customContentCredits: 4,
    videoAllowed: true,
    paymentMethod: "twint_business",
    status: "activated",
    athleteId,
    membershipId: "22222222-2222-4222-8222-222222222222",
    termsVersion: "2026-09-23",
    termsAcceptedAt: "2026-09-23T10:00:00.000Z",
    expiresAt: "2026-09-30T10:00:00.000Z",
    paidAt: "2026-09-23T11:00:00.000Z",
    cancelledAt: null,
    activatedAt: "2026-09-26T10:00:00.000Z",
    createdAt: "2026-09-23T10:00:00.000Z",
    updatedAt: "2026-09-26T10:00:00.000Z",
  },
  membership: {
    id: "22222222-2222-4222-8222-222222222222",
    workspaceId: "workspace-session",
    athleteId,
    membershipKind: "subscription",
    planCode: "impact",
    status: "active",
    startsAt: "2026-09-26T10:00:00.000Z",
    endsAt: "2027-09-26T10:00:00.000Z",
    autoRenew: false,
    paymentInstallments: 1,
    source: "twint_prospect_order",
    createdAt: "2026-09-26T10:00:00.000Z",
    updatedAt: "2026-09-26T10:00:00.000Z",
  },
  alreadyActivated: false,
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  activate: vi.fn().mockResolvedValue(activation),
  ...overrides,
});

const context = (id = orderId) => ({ params: Promise.resolve({ orderId: id }) });

const postRequest = (
  body: string | null = JSON.stringify({ athleteId }),
  query = "",
  contentType = "application/json",
) => new Request(`${activationUrl}${query}`, {
  method: "POST",
  ...(body === null ? {} : { headers: { "content-type": contentType }, body }),
});

describe("Admin athlete membership prospect order activation API", () => {
  it("allows an active Admin and delegates exclusively to the activation service", async () => {
    const mocks = dependencies();
    const request = postRequest();
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(mocks).POST(request, context());

    expect(response.status).toBe(200);
    expect(mocks.activate).toHaveBeenCalledOnce();
    expect(mocks.activate).toHaveBeenCalledWith(request, { orderId, athleteId });
    expect(Object.keys(mocks)).toEqual(["activate"]);
  });

  it("returns 401 without a session", async () => {
    const mocks = dependencies({
      activate: vi.fn().mockRejectedValue(new AthleteMembershipProspectOrderError("unauthorized", "Session absente.")),
    });
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(mocks).POST(
      postRequest(),
      context(),
    );

    expect(response.status).toBe(401);
  });

  it.each(["athlete", "partner_expert", "media"])("refuses the %s role", async () => {
    const mocks = dependencies({
      activate: vi.fn().mockRejectedValue(new AthleteMembershipProspectOrderError("forbidden", "Accès refusé.")),
    });
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(mocks).POST(
      postRequest(),
      context(),
    );

    expect(response.status).toBe(403);
  });

  it.each([
    "not-a-uuid",
    "11111111-1111-0111-8111-111111111111",
    " 11111111-1111-4111-8111-111111111111 ",
    "",
  ])("rejects invalid UUID %s", async (invalidId) => {
    const mocks = dependencies();
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(mocks).POST(
      postRequest(),
      context(invalidId),
    );

    expect(response.status).toBe(400);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("rejects every query parameter", async () => {
    const mocks = dependencies();
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(mocks).POST(
      postRequest(JSON.stringify({ athleteId }), "?workspaceId=forged"),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it.each([
    [null, "application/json"],
    ["", "application/json"],
    ["{", "application/json"],
    ["null", "application/json"],
    ["[]", "application/json"],
    ["{}", "application/json"],
    [JSON.stringify({ athleteId, workspaceId: "forged" }), "application/json"],
    [JSON.stringify({ athleteId: 42 }), "application/json"],
    [JSON.stringify({ athleteId: "" }), "application/json"],
    [JSON.stringify({ athleteId: " lina-morel" }), "application/json"],
    [JSON.stringify({ athleteId: "lina\nmorel" }), "application/json"],
    [JSON.stringify({ athleteId: "a".repeat(201) }), "application/json"],
    [JSON.stringify({ athleteId }), "text/plain"],
  ])("rejects an invalid strict body %s", async (body, contentType) => {
    const mocks = dependencies();
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(mocks).POST(
      postRequest(body, "", contentType),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("returns the projected activation result", async () => {
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(dependencies()).POST(
      postRequest(),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      order: { id: orderId, status: "activated", athleteId },
      membership: {
        id: activation.membership.id,
        athleteId,
        membershipKind: "subscription",
        planCode: "impact",
        status: "active",
      },
      alreadyActivated: false,
    });
  });

  it("returns 200 with alreadyActivated for an idempotent replay", async () => {
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(dependencies({
      activate: vi.fn().mockResolvedValue({ ...activation, alreadyActivated: true }),
    })).POST(postRequest(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ alreadyActivated: true });
  });

  it("projects no Clerk, workspace or injected SQL-internal identifiers", async () => {
    const unsafeActivation = {
      ...activation,
      order: Object.assign({}, activation.order, {
        clerkUserId: "user_prospect_secret",
        confirmedByClerkUserId: "user_admin_secret",
        activatedByClerkUserId: "user_admin_secret",
        sqlInternalState: "locked",
      }),
      membership: Object.assign({}, activation.membership, {
        clerkUserId: "user_prospect_secret",
        sqlInternalState: "inserted",
      }),
    };
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(dependencies({
      activate: vi.fn().mockResolvedValue(unsafeActivation),
    })).POST(postRequest(), context());
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(payload.order).not.toHaveProperty("workspaceId");
    expect(payload.membership).not.toHaveProperty("workspaceId");
    expect(serialized).not.toContain("user_");
    expect(serialized).not.toContain("sqlInternalState");
  });

  it.each([
    [new AthleteMembershipProspectOrderError("not_found", "Commande absente."), 404],
    [new AthleteMembershipProspectOrderError("conflict", "État incompatible."), 409],
    [new Error("SQL secret stack"), 500],
  ] as const)("maps service error %s to %i", async (error, status) => {
    const response = await createAdminAthleteMembershipProspectOrderActivationHandlers(dependencies({
      activate: vi.fn().mockRejectedValue(error),
    })).POST(postRequest(), context());

    expect(response.status).toBe(status);
    if (status === 500) {
      await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
    }
  });

  it("exports POST only", () => {
    expect("POST" in activationRoute).toBe(true);
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) expect(method in activationRoute).toBe(false);
  });
});