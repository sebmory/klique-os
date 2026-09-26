import { describe, expect, it, vi } from "vitest";
import * as collectionRoute from "@/app/api/admin/athlete-membership-prospect-orders/route";
import { createAdminAthleteMembershipProspectOrderHandlers } from "@/app/api/admin/athlete-membership-prospect-orders/route";
import * as confirmationRoute from "@/app/api/admin/athlete-membership-prospect-orders/[orderId]/confirm-payment/route";
import { createAdminAthleteMembershipProspectOrderConfirmationHandlers } from "@/app/api/admin/athlete-membership-prospect-orders/[orderId]/confirm-payment/route";
import {
  AthleteMembershipProspectOrderError,
  type AdminAthleteMembershipProspectOrder,
  type ConfirmedAthleteMembershipProspectOrder,
} from "@/lib/athlete-membership-prospect-orders";
import { isAthleteAllowedRoute, isMediaAllowedApi, isPartnerAllowedApi } from "@/proxy";

const orderId = "11111111-1111-4111-8111-111111111111";
const collectionUrl = "http://localhost/api/admin/athlete-membership-prospect-orders";
const confirmationUrl = `${collectionUrl}/${orderId}/confirm-payment`;

const order: AdminAthleteMembershipProspectOrder = {
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
  status: "pending_payment",
  athleteId: null,
  membershipId: null,
  termsVersion: "2026-09-23",
  termsAcceptedAt: "2026-09-23T10:00:00.000Z",
  expiresAt: "2026-09-30T10:00:00.000Z",
  paidAt: null,
  cancelledAt: null,
  activatedAt: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  updatedAt: "2026-09-23T10:00:00.000Z",
};

const paidOrder: AdminAthleteMembershipProspectOrder = {
  ...order,
  status: "paid_awaiting_form",
  paidAt: "2026-09-23T11:00:00.000Z",
  updatedAt: "2026-09-23T11:00:00.000Z",
};

const confirmation: ConfirmedAthleteMembershipProspectOrder = {
  order: paidOrder,
  alreadyConfirmed: false,
};

const adminAccess = {
  clerkUserId: "user_admin_internal",
  role: "admin",
  status: "active",
  workspaceId: "workspace-session",
};

const collectionDependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue(adminAccess),
  list: vi.fn().mockResolvedValue([order]),
  ...overrides,
});

const confirmationDependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue(adminAccess),
  confirm: vi.fn().mockResolvedValue(confirmation),
  ...overrides,
});

const context = (id = orderId) => ({ params: Promise.resolve({ orderId: id }) });

const postRequest = (body?: string, query = "", contentType = "application/json") => new Request(
  `${confirmationUrl}${query}`,
  {
    method: "POST",
    ...(body === undefined ? {} : { headers: { "content-type": contentType }, body }),
  },
);

describe("Admin athlete membership prospect order collection API", () => {
  it("allows an active Admin and delegates workspace scoping to the session-aware service", async () => {
    const mocks = collectionDependencies();
    const request = new Request(collectionUrl);
    const response = await createAdminAthleteMembershipProspectOrderHandlers(mocks).GET(request);

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(request, {});
  });

  it.each([
    ["athlete", "active"],
    ["partner_expert", "active"],
    ["media", "active"],
    ["admin", "disabled"],
  ])("refuses %s access with %s status", async (role, status) => {
    const mocks = collectionDependencies({
      getAccess: vi.fn().mockResolvedValue({ ...adminAccess, role, status }),
    });
    const response = await createAdminAthleteMembershipProspectOrderHandlers(mocks).GET(new Request(collectionUrl));

    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    const mocks = collectionDependencies({ getAccess: vi.fn().mockResolvedValue(null) });
    const response = await createAdminAthleteMembershipProspectOrderHandlers(mocks).GET(new Request(collectionUrl));

    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each([
    ["status=pending_payment", { status: "pending_payment" }],
    ["email=%20Prospect%40Example.Test%20", { email: "Prospect@Example.Test" }],
    ["planCode=signature", { planCode: "signature" }],
    [
      "status=paid_awaiting_form&email=prospect%40example.test&planCode=impact",
      { status: "paid_awaiting_form", email: "prospect@example.test", planCode: "impact" },
    ],
  ])("passes the supported strict filters for %s", async (query, expectedFilters) => {
    const mocks = collectionDependencies();
    const request = new Request(`${collectionUrl}?${query}`);
    const response = await createAdminAthleteMembershipProspectOrderHandlers(mocks).GET(request);

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(request, expectedFilters);
  });

  it.each([
    "workspaceId=forged",
    "unknown=value",
    "status=",
    "email=%20%20",
    "planCode=",
    "status=pending_payment&status=expired",
    "email=one%40example.test&email=two%40example.test",
    "planCode=impact&planCode=signature",
    "status=unknown",
    "planCode=founder",
  ])("rejects invalid query %s", async (query) => {
    const mocks = collectionDependencies();
    const response = await createAdminAthleteMembershipProspectOrderHandlers(mocks).GET(
      new Request(`${collectionUrl}?${query}`),
    );

    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns a projected list without Clerk or internal identifiers", async () => {
    const unsafeOrder = Object.assign({}, order, {
      clerkUserId: "user_prospect_secret",
      createdByClerkUserId: "user_creator_secret",
      confirmedByClerkUserId: "user_confirmer_secret",
    });
    const response = await createAdminAthleteMembershipProspectOrderHandlers(collectionDependencies({
      list: vi.fn().mockResolvedValue([unsafeOrder]),
    })).GET(new Request(collectionUrl));
    const payload = await response.json();

    expect(payload.orders[0]).toMatchObject({
      id: orderId,
      verifiedEmail: "prospect@example.test",
      fullName: "Lina Morel",
      status: "pending_payment",
    });
    expect(payload.orders[0]).not.toHaveProperty("workspaceId");
    expect(payload.orders[0]).not.toHaveProperty("athleteId");
    expect(payload.orders[0]).not.toHaveProperty("membershipId");
    expect(payload.orders[0]).not.toHaveProperty("activatedAt");
    expect(JSON.stringify(payload)).not.toContain("user_");
  });

  it.each([
    [new AthleteMembershipProspectOrderError("validation", "Filtre invalide."), 400],
    [new AthleteMembershipProspectOrderError("unauthorized", "Session absente."), 401],
    [new AthleteMembershipProspectOrderError("forbidden", "Accès refusé."), 403],
    [new Error("SQL secret stack"), 500],
  ] as const)("maps service error %s to %i", async (error, status) => {
    const response = await createAdminAthleteMembershipProspectOrderHandlers(collectionDependencies({
      list: vi.fn().mockRejectedValue(error),
    })).GET(new Request(collectionUrl));

    expect(response.status).toBe(status);
    if (status === 500) {
      await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
    }
  });

  it("exports GET only", () => {
    expect("GET" in collectionRoute).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect(method in collectionRoute).toBe(false);
  });
});

describe("Admin athlete membership prospect order confirmation API", () => {
  it("confirms payment to paid_awaiting_form with no body", async () => {
    const mocks = confirmationDependencies();
    const request = postRequest();
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(request, context());

    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(request, orderId);
    const payload = await response.json();
    expect(payload).toMatchObject({
      order: { id: orderId, status: "paid_awaiting_form" },
      alreadyConfirmed: false,
    });
    expect(payload.order).not.toHaveProperty("membershipId");
  });

  it("accepts only an empty JSON object when content is present", async () => {
    const mocks = confirmationDependencies();
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
      postRequest("{}"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it("returns 200 and alreadyConfirmed when the service replays confirmation", async () => {
    const mocks = confirmationDependencies({
      confirm: vi.fn().mockResolvedValue({ ...confirmation, alreadyConfirmed: true }),
    });
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
      postRequest(),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      order: { status: "paid_awaiting_form" },
      alreadyConfirmed: true,
    });
  });

  it.each(["not-a-uuid", "11111111-1111-0111-8111-111111111111", ""])(
    "rejects invalid UUID %s",
    async (invalidId) => {
      const mocks = confirmationDependencies();
      const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
        postRequest(),
        context(invalidId),
      );

      expect(response.status).toBe(400);
      expect(mocks.confirm).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["{", "application/json"],
    ["null", "application/json"],
    ["[]", "application/json"],
    [JSON.stringify({ action: "confirm" }), "application/json"],
    [JSON.stringify({ workspaceId: "forged" }), "application/json"],
    ["{}", "text/plain"],
  ])("rejects invalid body %s", async (body, contentType) => {
    const mocks = confirmationDependencies();
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
      postRequest(body, "", contentType),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("rejects every query parameter", async () => {
    const mocks = confirmationDependencies();
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
      postRequest(undefined, "?workspaceId=forged"),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    const mocks = confirmationDependencies({ getAccess: vi.fn().mockResolvedValue(null) });
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
      postRequest(),
      context(),
    );

    expect(response.status).toBe(401);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["athlete", "active"],
    ["partner_expert", "active"],
    ["media", "active"],
    ["admin", "disabled"],
  ])("refuses %s access with %s status", async (role, status) => {
    const mocks = confirmationDependencies({
      getAccess: vi.fn().mockResolvedValue({ ...adminAccess, role, status }),
    });
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
      postRequest(),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each([
    [new AthleteMembershipProspectOrderError("validation", "UUID invalide."), 400],
    [new AthleteMembershipProspectOrderError("unauthorized", "Session absente."), 401],
    [new AthleteMembershipProspectOrderError("forbidden", "Accès refusé."), 403],
    [new AthleteMembershipProspectOrderError("not_found", "Commande absente."), 404],
    [new AthleteMembershipProspectOrderError("conflict", "État incompatible."), 409],
    [new AthleteMembershipProspectOrderError("expired", "Commande expirée."), 409],
    [new Error("SQL secret stack"), 500],
  ] as const)("maps service error %s to %i", async (error, status) => {
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(
      confirmationDependencies({ confirm: vi.fn().mockRejectedValue(error) }),
    ).POST(postRequest(), context());

    expect(response.status).toBe(status);
    if (status === 500) {
      await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
    }
  });

  it("projects the response and triggers no activation, membership, credit, access or form action", async () => {
    const activate = vi.fn();
    const createMembership = vi.fn();
    const grantCredits = vi.fn();
    const createUserAccess = vi.fn();
    const sendForm = vi.fn();
    const unsafeConfirmation = {
      ...confirmation,
      order: Object.assign({}, paidOrder, {
        clerkUserId: "user_prospect_secret",
        confirmedByClerkUserId: "user_admin_secret",
      }),
    };
    const mocks = confirmationDependencies({
      confirm: vi.fn().mockResolvedValue(unsafeConfirmation),
      activate,
      createMembership,
      grantCredits,
      createUserAccess,
      sendForm,
    });
    const response = await createAdminAthleteMembershipProspectOrderConfirmationHandlers(mocks).POST(
      postRequest(),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.order.status).toBe("paid_awaiting_form");
    expect(payload.order).not.toHaveProperty("workspaceId");
    expect(payload.order).not.toHaveProperty("athleteId");
    expect(payload.order).not.toHaveProperty("membershipId");
    expect(payload.order).not.toHaveProperty("activatedAt");
    expect(JSON.stringify(payload)).not.toContain("user_");
    expect(activate).not.toHaveBeenCalled();
    expect(createMembership).not.toHaveBeenCalled();
    expect(grantCredits).not.toHaveBeenCalled();
    expect(createUserAccess).not.toHaveBeenCalled();
    expect(sendForm).not.toHaveBeenCalled();
  });

  it("exports POST only and remains closed to external roles in the proxy", () => {
    expect("POST" in confirmationRoute).toBe(true);
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) expect(method in confirmationRoute).toBe(false);

    expect(isAthleteAllowedRoute(collectionUrl.replace("http://localhost", ""), "GET")).toBe(false);
    expect(isPartnerAllowedApi(confirmationUrl.replace("http://localhost", ""), "POST")).toBe(false);
    expect(isMediaAllowedApi(confirmationUrl.replace("http://localhost", ""), "POST")).toBe(false);
  });
});