import { describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/join/pass/order/route";
import { createAthleteMembershipProspectOrderHandlers } from "@/app/api/join/pass/order/route";
import {
  AthleteMembershipProspectOrderError,
  type AthleteMembershipProspectOrder,
  type AthleteMembershipProspectOrderCreation,
  type AthleteMembershipProspectOrderView,
} from "@/lib/athlete-membership-prospect-orders";
import { isProspectMembershipOrderApi } from "@/proxy";

const url = "http://localhost/api/join/pass/order";
const baseOrder: AthleteMembershipProspectOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "klique-os",
  publicReference: "KQ-ABCDEF123456",
  verifiedEmail: "prospect@example.test",
  fullName: "Lina Morel",
  phone: "+41790000000",
  planCode: "essential",
  planName: "Essentiel",
  annualPriceChf: 249,
  durationMonths: 12,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
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

const orderView: AthleteMembershipProspectOrderView = {
  ...baseOrder,
  twintPaymentUrl: "https://pay.example.test/twint",
  statusMessage: null,
};

const createdOrder: AthleteMembershipProspectOrderCreation = {
  ...orderView,
  creationOutcome: "created",
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getSessionUserId: vi.fn().mockResolvedValue("user-prospect"),
  getCurrent: vi.fn().mockResolvedValue(orderView),
  create: vi.fn().mockResolvedValue(createdOrder),
  cancel: vi.fn().mockResolvedValue({
    ...baseOrder,
    status: "cancelled" as const,
    cancelledAt: "2026-09-23T11:00:00.000Z",
  }),
  ...overrides,
});

const validBody = {
  planCode: "essential",
  fullName: "Lina Morel",
  phone: "+41790000000",
  termsAccepted: true,
};

const postRequest = (body: unknown, query = "") => new Request(`${url}${query}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const deleteRequest = (query = "", body?: string) => new Request(`${url}${query}`, {
  method: "DELETE",
  ...(body === undefined ? {} : { body }),
});

describe("Athlete membership prospect order API", () => {
  it("allows an authenticated Clerk account without user_access", async () => {
    const mocks = dependencies();
    const response = await createAthleteMembershipProspectOrderHandlers(mocks).GET(new Request(url));

    expect(response.status).toBe(200);
    expect(mocks.getSessionUserId).toHaveBeenCalledOnce();
    expect(mocks.getCurrent).toHaveBeenCalledOnce();
  });

  it("returns null when there is no useful order", async () => {
    for (const current of [null, { ...orderView, status: "cancelled" as const }]) {
      const response = await createAthleteMembershipProspectOrderHandlers(dependencies({
        getCurrent: vi.fn().mockResolvedValue(current),
      })).GET(new Request(url));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ order: null });
    }
  });

  it("returns only the connected account order with service-authorized TWINT details", async () => {
    const unsafe = Object.assign({}, orderView, {
      clerkUserId: "user-prospect-secret",
      createdByClerkUserId: "user-creator-secret",
      confirmedByClerkUserId: "user-admin-secret",
    });
    const response = await createAthleteMembershipProspectOrderHandlers(dependencies({
      getCurrent: vi.fn().mockResolvedValue(unsafe),
    })).GET(new Request(url));
    const payload = await response.json();

    expect(payload.order).toMatchObject({
      publicReference: "KQ-ABCDEF123456",
      twintPaymentUrl: "https://pay.example.test/twint",
    });
    expect(JSON.stringify(payload)).not.toContain("user-prospect-secret");
    expect(JSON.stringify(payload)).not.toContain("user-creator-secret");
    expect(JSON.stringify(payload)).not.toContain("user-admin-secret");
    expect(payload.order).not.toHaveProperty("workspaceId");
    expect(payload.order).not.toHaveProperty("athleteId");
    expect(payload.order).not.toHaveProperty("membershipId");
  });

  it("creates with 201 and reuses an identical order with 200", async () => {
    const createdMocks = dependencies();
    const created = await createAthleteMembershipProspectOrderHandlers(createdMocks).POST(postRequest(validBody));
    expect(created.status).toBe(201);
    expect(createdMocks.create).toHaveBeenCalledWith(expect.any(Request), validBody);

    const reused = await createAthleteMembershipProspectOrderHandlers(dependencies({
      create: vi.fn().mockResolvedValue({ ...createdOrder, creationOutcome: "reused" }),
    })).POST(postRequest(validBody));
    expect(reused.status).toBe(200);
  });

  it.each([
    {},
    { planCode: "essential", fullName: "Lina Morel", termsAccepted: false },
    { planCode: "founder", fullName: "Lina Morel", termsAccepted: true },
    { planCode: "essential", fullName: "", termsAccepted: true },
    { planCode: "essential", fullName: "Lina Morel", phone: null, termsAccepted: true },
    { ...validBody, email: "forged@example.test" },
    { ...validBody, clerkUserId: "forged" },
    { ...validBody, workspaceId: "forged" },
    { ...validBody, annualPriceChf: 1 },
    { ...validBody, productionCredits: 99 },
    { ...validBody, customContentCredits: 99 },
    { ...validBody, status: "paid_awaiting_form" },
    { ...validBody, publicReference: "KQ-FORGED123456" },
    [],
    null,
  ])("rejects a non-strict POST body", async (body) => {
    const mocks = dependencies();
    const response = await createAthleteMembershipProspectOrderHandlers(mocks).POST(postRequest(body));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts the strict body without an optional phone", async () => {
    const mocks = dependencies();
    const body = { planCode: "impact", fullName: "Lina Morel", termsAccepted: true };
    const response = await createAthleteMembershipProspectOrderHandlers(mocks).POST(postRequest(body));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.any(Request), body);
  });

  it("rejects malformed JSON and every query parameter", async () => {
    const mocks = dependencies();
    const handlers = createAthleteMembershipProspectOrderHandlers(mocks);
    const malformed = new Request(url, { method: "POST", body: "{" });

    expect((await handlers.POST(malformed)).status).toBe(400);
    expect((await handlers.GET(new Request(`${url}?email=forged`))).status).toBe(400);
    expect((await handlers.POST(postRequest(validBody, "?workspaceId=forged"))).status).toBe(400);
    expect((await handlers.DELETE(deleteRequest("?orderId=forged"))).status).toBe(400);
  });

  it("rejects a missing session for every operation", async () => {
    const mocks = dependencies({ getSessionUserId: vi.fn().mockResolvedValue(null) });
    const handlers = createAthleteMembershipProspectOrderHandlers(mocks);

    expect((await handlers.GET(new Request(url))).status).toBe(401);
    expect((await handlers.POST(postRequest(validBody))).status).toBe(401);
    expect((await handlers.DELETE(deleteRequest())).status).toBe(401);
    expect(mocks.getCurrent).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("cancels the connected account pending order without accepting client identity", async () => {
    const mocks = dependencies();
    const request = deleteRequest();
    const response = await createAthleteMembershipProspectOrderHandlers(mocks).DELETE(request);

    expect(response.status).toBe(200);
    expect(mocks.getCurrent).toHaveBeenCalledWith(request);
    expect(mocks.cancel).toHaveBeenCalledWith(request, baseOrder.id);
    await expect(response.json()).resolves.toMatchObject({ order: { status: "cancelled" } });
  });

  it("rejects every DELETE body before loading the order", async () => {
    const mocks = dependencies();
    const response = await createAthleteMembershipProspectOrderHandlers(mocks).DELETE(
      deleteRequest("", JSON.stringify({ orderId: baseOrder.id })),
    );
    expect(response.status).toBe(400);
    expect(mocks.getCurrent).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it.each([
    [new AthleteMembershipProspectOrderError("forbidden", "E-mail non vérifié."), "get", 403],
    [new AthleteMembershipProspectOrderError("validation", "Plan absent."), "create", 404],
    [new AthleteMembershipProspectOrderError("not_found", "Introuvable."), "create", 404],
    [new AthleteMembershipProspectOrderError("conflict", "Commande existante."), "create", 409],
    [new AthleteMembershipProspectOrderError("expired", "Commande expirée."), "cancel", 409],
  ] as const)("maps %s during %s to %i", async (error, operation, status) => {
    const mocks = dependencies({
      getCurrent: vi.fn().mockRejectedValue(error),
      create: vi.fn().mockRejectedValue(error),
      cancel: vi.fn().mockRejectedValue(error),
    });
    const handlers = createAthleteMembershipProspectOrderHandlers(mocks);
    const response = operation === "get"
      ? await handlers.GET(new Request(url))
      : operation === "create"
        ? await handlers.POST(postRequest(validBody))
        : await handlers.DELETE(deleteRequest());
    expect(response.status).toBe(status);
  });

  it.each([
    new AthleteMembershipProspectOrderError("configuration", "TWINT_BUSINESS_PAYMENT_URL=secret"),
    new Error("SQL statement and stack"),
  ])("returns a generic 500 without internal leakage", async (error) => {
    const response = await createAthleteMembershipProspectOrderHandlers(dependencies({
      getCurrent: vi.fn().mockRejectedValue(error),
    })).GET(new Request(url));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
  });

  it("allows exactly the pre-access route methods and exports no unsupported handler", () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      expect(isProspectMembershipOrderApi("/api/join/pass/order", method)).toBe(true);
      expect(method in route).toBe(true);
    }
    for (const method of ["PUT", "PATCH"]) {
      expect(isProspectMembershipOrderApi("/api/join/pass/order", method)).toBe(false);
      expect(method in route).toBe(false);
    }
    expect(isProspectMembershipOrderApi("/api/join/pass/order/history", "GET")).toBe(false);
    expect(isProspectMembershipOrderApi("/api/athlete/membership-order", "GET")).toBe(false);
  });
});