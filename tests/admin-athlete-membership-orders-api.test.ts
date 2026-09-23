import { describe, expect, it, vi } from "vitest";
import * as collectionRoute from "@/app/api/admin/athlete-membership-orders/route";
import { createAdminAthleteMembershipOrderHandlers } from "@/app/api/admin/athlete-membership-orders/route";
import * as confirmationRoute from "@/app/api/admin/athlete-membership-orders/[orderId]/confirm/route";
import { createAdminAthleteMembershipOrderConfirmationHandlers } from "@/app/api/admin/athlete-membership-orders/[orderId]/confirm/route";
import {
  AthleteMembershipOrderError,
  type AdminAthleteMembershipOrder,
  type ConfirmedAthleteMembershipOrder,
} from "@/lib/athlete-membership-orders";
import { isAthleteAllowedRoute, isMediaAllowedApi, isPartnerAllowedApi } from "@/proxy";

const orderId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const collectionUrl = "http://localhost/api/admin/athlete-membership-orders";
const confirmationUrl = `${collectionUrl}/${orderId}/confirm`;

const order: AdminAthleteMembershipOrder = {
  id: orderId,
  workspaceId: "workspace-session",
  athleteId: "athlete-session",
  athleteName: "Athlète Session",
  publicReference: "KQ-ABCDEF123456",
  planCode: "impact",
  planName: "Impact",
  annualPriceChf: 549,
  durationMonths: 12,
  productionCredits: 2,
  customContentCredits: 4,
  videoAllowed: true,
  paymentMethod: "twint_business",
  status: "pending",
  membershipId: null,
  expiresAt: "2026-09-30T10:00:00.000Z",
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  updatedAt: "2026-09-23T10:00:00.000Z",
};

const paidOrder = {
  ...order,
  status: "paid" as const,
  membershipId,
  paidAt: "2026-09-23T11:00:00.000Z",
};

const confirmation: ConfirmedAthleteMembershipOrder = {
  order: paidOrder,
  membershipId,
  alreadyPaid: false,
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

const postRequest = (body?: string, query = "") => new Request(`${confirmationUrl}${query}`, {
  method: "POST",
  ...(body === undefined ? {} : {
    headers: { "content-type": "application/json" },
    body,
  }),
});

describe("Admin athlete membership order collection API", () => {
  it("lists the Admin queue without filters through the session-scoped service", async () => {
    const mocks = collectionDependencies();
    const request = new Request(collectionUrl);

    const response = await createAdminAthleteMembershipOrderHandlers(mocks).GET(request);

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(request, {});
    await expect(response.json()).resolves.toEqual({
      orders: [{
        id: orderId,
        publicReference: "KQ-ABCDEF123456",
        athleteId: "athlete-session",
        athleteName: "Athlète Session",
        planCode: "impact",
        planName: "Impact",
        annualPriceChf: 549,
        durationMonths: 12,
        productionCredits: 2,
        customContentCredits: 4,
        videoAllowed: true,
        paymentMethod: "twint_business",
        status: "pending",
        membershipId: null,
        expiresAt: order.expiresAt,
        paidAt: null,
        cancelledAt: null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }],
    });
  });

  it.each([
    ["status=pending", { status: "pending" }],
    ["athleteId=athlete-session", { athleteId: "athlete-session" }],
    ["planCode=signature", { planCode: "signature" }],
    [
      "status=paid&athleteId=athlete-session&planCode=impact",
      { status: "paid", athleteId: "athlete-session", planCode: "impact" },
    ],
  ])("passes only the validated filter for %s", async (query, expectedFilters) => {
    const mocks = collectionDependencies();
    const request = new Request(`${collectionUrl}?${query}`);

    const response = await createAdminAthleteMembershipOrderHandlers(mocks).GET(request);

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(request, expectedFilters);
  });

  it.each([
    "workspaceId=workspace-client",
    "unknown=value",
    "status=",
    "athleteId=",
    "athleteId=%20%20",
    "planCode=",
    "status=pending&status=paid",
    "athleteId=one&athleteId=two",
    "planCode=impact&planCode=signature",
    "status=unknown",
    "planCode=founder",
  ])("rejects invalid collection query %s", async (query) => {
    const mocks = collectionDependencies();

    const response = await createAdminAthleteMembershipOrderHandlers(mocks).GET(
      new Request(`${collectionUrl}?${query}`),
    );

    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("derives workspace scoping through the service request and refuses a client workspace", async () => {
    const mocks = collectionDependencies();
    const handlers = createAdminAthleteMembershipOrderHandlers(mocks);
    const request = new Request(collectionUrl);

    expect((await handlers.GET(request)).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(request, {});
    expect((await handlers.GET(new Request(`${collectionUrl}?workspaceId=forged`))).status).toBe(400);
  });

  it("returns 401 without authentication and 403 without active Admin access", async () => {
    const unauthenticated = collectionDependencies({ getAccess: vi.fn().mockResolvedValue(null) });
    const forbidden = collectionDependencies({
      getAccess: vi.fn().mockResolvedValue({ ...adminAccess, role: "athlete" }),
    });

    expect((await createAdminAthleteMembershipOrderHandlers(unauthenticated).GET(
      new Request(collectionUrl),
    )).status).toBe(401);
    expect((await createAdminAthleteMembershipOrderHandlers(forbidden).GET(
      new Request(collectionUrl),
    )).status).toBe(403);
    expect(unauthenticated.list).not.toHaveBeenCalled();
    expect(forbidden.list).not.toHaveBeenCalled();
  });

  it("returns a generic 500 without exposing internal details", async () => {
    const response = await createAdminAthleteMembershipOrderHandlers(collectionDependencies({
      list: vi.fn().mockRejectedValue(new Error("SQL secret stack")),
    })).GET(new Request(collectionUrl));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
  });

  it("never exposes Clerk identifiers from a service object", async () => {
    const unsafeOrder = Object.assign({}, order, {
      createdByClerkUserId: "user_creator_secret",
      confirmedByClerkUserId: "user_confirmer_secret",
    });
    const response = await createAdminAthleteMembershipOrderHandlers(collectionDependencies({
      list: vi.fn().mockResolvedValue([unsafeOrder]),
    })).GET(new Request(collectionUrl));
    const payload = await response.json();

    expect(JSON.stringify(payload)).not.toContain("Clerk");
    expect(JSON.stringify(payload)).not.toContain("user_creator_secret");
    expect(JSON.stringify(payload)).not.toContain("user_confirmer_secret");
  });

  it("exports GET only", () => {
    expect("GET" in collectionRoute).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(method in collectionRoute).toBe(false);
    }
  });
});

describe("Admin athlete membership order confirmation API", () => {
  it("confirms an order with no body and returns the paid order and activated membership", async () => {
    const mocks = confirmationDependencies();
    const request = postRequest();

    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(mocks).POST(
      request,
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(request, orderId);
    await expect(response.json()).resolves.toMatchObject({
      order: { id: orderId, status: "paid", membershipId },
      membershipId,
      alreadyPaid: false,
    });
  });

  it("accepts an empty object body", async () => {
    const mocks = confirmationDependencies();

    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(mocks).POST(
      postRequest("{}"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it("returns the same result with 200 when confirmation is replayed", async () => {
    const replayed = { ...confirmation, alreadyPaid: true };
    const mocks = confirmationDependencies({ confirm: vi.fn().mockResolvedValue(replayed) });

    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(mocks).POST(
      postRequest(),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      order: { id: orderId, status: "paid", membershipId },
      membershipId,
      alreadyPaid: true,
    });
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it.each([
    "not-a-uuid",
    "11111111-1111-0111-8111-111111111111",
    "",
  ])("rejects invalid order UUID %s", async (invalidId) => {
    const mocks = confirmationDependencies();

    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(mocks).POST(
      postRequest(),
      context(invalidId),
    );

    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each([
    "{",
    "null",
    "[]",
    JSON.stringify({ action: "confirm" }),
    JSON.stringify({ workspaceId: "workspace-client" }),
    JSON.stringify({ athleteId: "athlete-client" }),
  ])("rejects non-empty or invalid body %s", async (body) => {
    const mocks = confirmationDependencies();

    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(mocks).POST(
      postRequest(body),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("rejects every query parameter", async () => {
    const mocks = confirmationDependencies();

    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(mocks).POST(
      postRequest(undefined, "?workspaceId=forged"),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication and 403 for inactive or non-Admin access", async () => {
    const unauthenticated = confirmationDependencies({ getAccess: vi.fn().mockResolvedValue(null) });
    const inactive = confirmationDependencies({
      getAccess: vi.fn().mockResolvedValue({ ...adminAccess, status: "disabled" }),
    });

    expect((await createAdminAthleteMembershipOrderConfirmationHandlers(unauthenticated).POST(
      postRequest(),
      context(),
    )).status).toBe(401);
    expect((await createAdminAthleteMembershipOrderConfirmationHandlers(inactive).POST(
      postRequest(),
      context(),
    )).status).toBe(403);
    expect(unauthenticated.confirm).not.toHaveBeenCalled();
    expect(inactive.confirm).not.toHaveBeenCalled();
  });

  it.each([
    [new AthleteMembershipOrderError("not_found", "Commande absente."), 404],
    [new AthleteMembershipOrderError("conflict", "État incompatible."), 409],
    [new AthleteMembershipOrderError("expired", "Commande expirée."), 409],
  ] as const)("maps %s to %i", async (error, status) => {
    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(
      confirmationDependencies({ confirm: vi.fn().mockRejectedValue(error) }),
    ).POST(postRequest(), context());

    expect(response.status).toBe(status);
  });

  it("returns a generic 500 without SQL, stack or environment details", async () => {
    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(
      confirmationDependencies({
        confirm: vi.fn().mockRejectedValue(new Error("SQL TWINT_BUSINESS_PAYMENT_URL stack")),
      }),
    ).POST(postRequest(), context());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Une erreur interne est survenue." });
    expect(JSON.stringify(payload)).not.toContain("SQL");
    expect(JSON.stringify(payload)).not.toContain("TWINT_BUSINESS_PAYMENT_URL");
  });

  it("never exposes Clerk identifiers from the confirmed order", async () => {
    const unsafeConfirmation = {
      ...confirmation,
      order: Object.assign({}, paidOrder, {
        createdByClerkUserId: "user_creator_secret",
        confirmedByClerkUserId: "user_confirmer_secret",
      }),
    };
    const response = await createAdminAthleteMembershipOrderConfirmationHandlers(
      confirmationDependencies({ confirm: vi.fn().mockResolvedValue(unsafeConfirmation) }),
    ).POST(postRequest(), context());
    const payload = await response.json();

    expect(JSON.stringify(payload)).not.toContain("Clerk");
    expect(JSON.stringify(payload)).not.toContain("user_creator_secret");
    expect(JSON.stringify(payload)).not.toContain("user_confirmer_secret");
  });

  it("exports POST only", () => {
    expect("POST" in confirmationRoute).toBe(true);
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect(method in confirmationRoute).toBe(false);
    }
  });
});

describe("Admin athlete membership order proxy isolation", () => {
  const collectionPath = "/api/admin/athlete-membership-orders";
  const confirmationPath = `/api/admin/athlete-membership-orders/${orderId}/confirm`;

  it.each([
    [collectionPath, "GET"],
    [confirmationPath, "POST"],
  ])("refuses external roles on %s", (path, method) => {
    expect(isAthleteAllowedRoute(path, method)).toBe(false);
    expect(isPartnerAllowedApi(path, method)).toBe(false);
    expect(isMediaAllowedApi(path, method)).toBe(false);
  });

  it("does not open modification or deletion methods to external roles", () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (method !== "GET") expect(isAthleteAllowedRoute(collectionPath, method)).toBe(false);
      if (method !== "POST") expect(isAthleteAllowedRoute(confirmationPath, method)).toBe(false);
      expect(isPartnerAllowedApi(confirmationPath, method)).toBe(false);
      expect(isMediaAllowedApi(confirmationPath, method)).toBe(false);
    }
  });

  it("refuses nested and lookalike confirmation paths to external roles", () => {
    for (const path of [
      `${confirmationPath}/history`,
      `/api/admin/athlete-membership-orders/${orderId}/confirmations`,
      "/api/admin/athlete-membership-orders/confirm",
    ]) {
      expect(isAthleteAllowedRoute(path, "POST")).toBe(false);
      expect(isPartnerAllowedApi(path, "POST")).toBe(false);
      expect(isMediaAllowedApi(path, "POST")).toBe(false);
    }
  });
});
