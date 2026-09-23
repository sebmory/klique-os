import { describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/athlete/membership-order/route";
import { createAthleteMembershipOrderHandlers } from "@/app/api/athlete/membership-order/route";
import {
  AthleteMembershipOrderError,
  type AthleteMembershipOrder,
  type AthleteMembershipOrderCreation,
  type AthleteMembershipOrderView,
} from "@/lib/athlete-membership-orders";

const baseOrder: AthleteMembershipOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-session",
  athleteId: "athlete-session",
  publicReference: "KQ-ABCDEF123456",
  planCode: "essential",
  planName: "Essentiel",
  annualPriceChf: 249,
  durationMonths: 12,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
  paymentMethod: "twint_business",
  status: "pending",
  membershipId: null,
  expiresAt: "2026-09-30T10:00:00.000Z",
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  updatedAt: "2026-09-23T10:00:00.000Z",
};

const orderView: AthleteMembershipOrderView = {
  ...baseOrder,
  twintPaymentUrl: "https://pay.example.test/twint",
};

const createdOrder: AthleteMembershipOrderCreation = {
  ...orderView,
  creationOutcome: "created",
};

const access = {
  clerkUserId: "user_clerk_internal",
  role: "athlete",
  status: "active",
  workspaceId: "workspace-session",
  athleteId: "athlete-session",
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue(access),
  getCurrent: vi.fn().mockResolvedValue(orderView),
  create: vi.fn().mockResolvedValue(createdOrder),
  cancel: vi.fn().mockResolvedValue({
    ...baseOrder,
    status: "cancelled" as const,
    cancelledAt: "2026-09-23T11:00:00.000Z",
  }),
  ...overrides,
});

const url = "http://localhost/api/athlete/membership-order";
const jsonRequest = (body: unknown, query = "") => new Request(`${url}${query}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const deleteRequest = (query = "", body?: string) => new Request(`${url}${query}`, {
  method: "DELETE",
  ...(body === undefined ? {} : { body }),
});

describe("Athlete membership order API", () => {
  it("returns order null when the current athlete has no order", async () => {
    const mocks = dependencies({ getCurrent: vi.fn().mockResolvedValue(null) });
    const request = new Request(url);

    const response = await createAthleteMembershipOrderHandlers(mocks).GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ order: null });
    expect(mocks.getCurrent).toHaveBeenCalledWith(request);
  });

  it("returns the current order and TWINT information", async () => {
    const response = await createAthleteMembershipOrderHandlers(dependencies()).GET(new Request(url));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ order: orderView });
  });

  it("returns 201 for a created order and 200 for an identical reused pending order", async () => {
    const createdMocks = dependencies();
    const createdResponse = await createAthleteMembershipOrderHandlers(createdMocks).POST(
      jsonRequest({ planCode: "essential" }),
    );
    expect(createdResponse.status).toBe(201);
    expect(createdMocks.create).toHaveBeenCalledWith(expect.any(Request), { planCode: "essential" });
    await expect(createdResponse.json()).resolves.toEqual({ order: orderView });

    const reused = { ...createdOrder, creationOutcome: "reused" as const };
    const reusedResponse = await createAthleteMembershipOrderHandlers(dependencies({
      create: vi.fn().mockResolvedValue(reused),
    })).POST(jsonRequest({ planCode: "essential" }));
    expect(reusedResponse.status).toBe(200);
    await expect(reusedResponse.json()).resolves.toEqual({ order: orderView });
  });

  it("cancels the current order without accepting an order id", async () => {
    const mocks = dependencies();
    const request = deleteRequest();

    const response = await createAthleteMembershipOrderHandlers(mocks).DELETE(request);

    expect(response.status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith(request);
    await expect(response.json()).resolves.toMatchObject({
      order: { id: baseOrder.id, status: "cancelled" },
    });
  });

  it.each([
    {},
    { planCode: null },
    { planCode: "founder" },
    { planCode: "ESSENTIAL" },
    { planCode: "essential", extra: true },
    { planCode: "essential", workspaceId: "workspace-client" },
    { planCode: "essential", athleteId: "athlete-client" },
    { planCode: "essential", annualPriceChf: 1 },
    { planCode: "essential", price: 1 },
    { planCode: "essential", productionCredits: 999 },
    { planCode: "essential", customContentCredits: 999 },
    [],
    null,
  ])("rejects every non-strict POST payload", async (body) => {
    const mocks = dependencies();

    const response = await createAthleteMembershipOrderHandlers(mocks).POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const mocks = dependencies();
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await createAthleteMembershipOrderHandlers(mocks).POST(request);

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects every query field for GET, POST and DELETE", async () => {
    const mocks = dependencies();
    const handlers = createAthleteMembershipOrderHandlers(mocks);

    expect((await handlers.GET(new Request(`${url}?workspaceId=client`))).status).toBe(400);
    expect((await handlers.POST(jsonRequest({ planCode: "essential" }, "?athleteId=client"))).status).toBe(400);
    expect((await handlers.DELETE(deleteRequest("?orderId=client"))).status).toBe(400);
    expect(mocks.getCurrent).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("rejects every DELETE body", async () => {
    const mocks = dependencies();

    const response = await createAthleteMembershipOrderHandlers(mocks).DELETE(
      deleteRequest("", JSON.stringify({ orderId: baseOrder.id })),
    );

    expect(response.status).toBe(400);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("returns 401 without a Clerk identity", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });
    const handlers = createAthleteMembershipOrderHandlers(mocks);

    expect((await handlers.GET(new Request(url))).status).toBe(401);
    expect((await handlers.POST(jsonRequest({ planCode: "essential" }))).status).toBe(401);
    expect((await handlers.DELETE(deleteRequest())).status).toBe(401);
    expect(mocks.getCurrent).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it.each([
    { ...access, role: "admin" },
    { ...access, status: "disabled" },
    { ...access, workspaceId: "" },
    { ...access, athleteId: "" },
  ])("returns 403 without complete active Athlete access", async (forbiddenAccess) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(forbiddenAccess) });

    const response = await createAthleteMembershipOrderHandlers(mocks).GET(new Request(url));

    expect(response.status).toBe(403);
    expect(mocks.getCurrent).not.toHaveBeenCalled();
  });

  it.each([
    [new AthleteMembershipOrderError("validation", "Payload invalide."), "get", 400],
    [new AthleteMembershipOrderError("not_found", "Plan introuvable."), "create", 404],
    [new AthleteMembershipOrderError("validation", "Plan inactif."), "create", 404],
    [new AthleteMembershipOrderError("conflict", "Adhésion active."), "create", 409],
    [new AthleteMembershipOrderError("expired", "Commande expirée."), "cancel", 409],
  ] as const)("maps %s during %s to %i", async (error, operation, status) => {
    const mocks = dependencies({
      getCurrent: vi.fn().mockRejectedValue(error),
      create: vi.fn().mockRejectedValue(error),
      cancel: vi.fn().mockRejectedValue(error),
    });
    const handlers = createAthleteMembershipOrderHandlers(mocks);
    const response = operation === "get"
      ? await handlers.GET(new Request(url))
      : operation === "create"
        ? await handlers.POST(jsonRequest({ planCode: "essential" }))
        : await handlers.DELETE(deleteRequest());

    expect(response.status).toBe(status);
  });

  it.each([
    new AthleteMembershipOrderError("configuration", "TWINT_BUSINESS_PAYMENT_URL=secret"),
    new Error("SQL statement and stack trace"),
  ])("returns a generic 500 without leaking internal details", async (error) => {
    const response = await createAthleteMembershipOrderHandlers(dependencies({
      getCurrent: vi.fn().mockRejectedValue(error),
    })).GET(new Request(url));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Une erreur interne est survenue." });
    expect(JSON.stringify(payload)).not.toContain("TWINT_BUSINESS_PAYMENT_URL");
    expect(JSON.stringify(payload)).not.toContain("SQL");
  });

  it("never exposes Clerk identifiers returned accidentally by a dependency", async () => {
    const unsafeOrder = Object.assign({}, orderView, {
      createdByClerkUserId: "user_creator_secret",
      confirmedByClerkUserId: "user_admin_secret",
    });
    const response = await createAthleteMembershipOrderHandlers(dependencies({
      getCurrent: vi.fn().mockResolvedValue(unsafeOrder),
    })).GET(new Request(url));
    const payload = await response.json();

    expect(JSON.stringify(payload)).not.toContain("Clerk");
    expect(JSON.stringify(payload)).not.toContain("user_creator_secret");
    expect(JSON.stringify(payload)).not.toContain("user_admin_secret");
  });

  it("exports only GET, POST and DELETE application handlers", () => {
    for (const method of ["GET", "POST", "DELETE"]) expect(method in route).toBe(true);
    for (const method of ["PUT", "PATCH"]) expect(method in route).toBe(false);
  });
});
