import { describe, expect, it, vi } from "vitest";
import { createAdminAthleteSubscriptionHandlers } from "@/app/api/admin/athlete-subscriptions/route";
import {
  AthleteSubscriptionConflictError,
  AthleteSubscriptionNotFoundError,
  AthleteSubscriptionValidationError,
  type AthleteSubscription,
} from "@/lib/athlete-subscriptions/service";

const subscriptionId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";

const subscription = (overrides: Partial<AthleteSubscription> = {}): AthleteSubscription => ({
  id: subscriptionId,
  workspaceId: "workspace-session",
  athleteId: "athlete-1",
  planCode: "essential",
  status: "active",
  startsOn: "2026-09-14",
  endsOn: "2027-09-14",
  isFounder: false,
  isComplimentary: false,
  priceChf: 249,
  discountPercent: 10,
  photoSessionsIncluded: 1,
  mediaDaysIncluded: 0,
  competitionSessionsIncluded: 0,
  customContentsIncluded: 2,
  createdByClerkUserId: "admin-session",
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
  ...overrides,
});

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    clerkUserId: " admin-session ",
    role: "admin",
    status: "active",
    workspaceId: " workspace-session ",
  }),
  listSubscriptions: vi.fn().mockResolvedValue([subscription()]),
  assignSubscription: vi.fn().mockResolvedValue(subscription()),
  bulkAssignFounder: vi.fn().mockResolvedValue({
    created: [subscription({ planCode: "founder", isFounder: true, isComplimentary: true, priceChf: 0 })],
    skipped: [{ athleteId: "athlete-2", reason: "active_subscription" }],
    errors: [{ athleteId: "athlete-3", message: "startsOn est requis." }],
  }),
  cancelSubscription: vi.fn().mockResolvedValue(subscription({ status: "cancelled" })),
  ...overrides,
});

const request = (method: "GET" | "POST" | "PATCH", body?: unknown) => new Request(
  "http://localhost/api/admin/athlete-subscriptions?workspaceId=workspace-client",
  {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  },
);

const assignmentBody = {
  athleteId: " athlete-1 ",
  planCode: "impact",
  startsOn: "2026-09-14",
  endsOn: "2027-09-14",
  isFounder: false,
  isComplimentary: true,
};

describe("Admin athlete subscriptions API", () => {
  it("lists only subscriptions from the authenticated workspace", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ subscriptions: [subscription()] });
    expect(mocks.listSubscriptions).toHaveBeenCalledWith("workspace-session");
  });

  it("returns 401 without a Clerk identity", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });

    const response = await createAdminAthleteSubscriptionHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(401);
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
  });

  it.each([
    { clerkUserId: "admin-session", role: "athlete", status: "active", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "disabled", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "active", workspaceId: "" },
  ])("returns 403 without an active Admin workspace access", async (access) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(access) });

    const response = await createAdminAthleteSubscriptionHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(403);
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
  });

  it("assigns using only workspace and Clerk identity from the session", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST", assignmentBody));

    expect(response.status).toBe(201);
    expect(mocks.assignSubscription).toHaveBeenCalledWith({
      athleteId: "athlete-1",
      planCode: "impact",
      startsOn: "2026-09-14",
      endsOn: "2027-09-14",
      isFounder: false,
      isComplimentary: true,
      workspaceId: "workspace-session",
      createdByClerkUserId: "admin-session",
    });
  });

  it("accepts Founder assignment and leaves its values to the service", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST", {
      ...assignmentBody,
      planCode: "founder",
      isFounder: false,
      isComplimentary: false,
    }));

    expect(response.status).toBe(201);
    expect(mocks.assignSubscription).toHaveBeenCalledWith({
      athleteId: "athlete-1",
      planCode: "founder",
      startsOn: "2026-09-14",
      endsOn: "2027-09-14",
      isFounder: false,
      isComplimentary: false,
      workspaceId: "workspace-session",
      createdByClerkUserId: "admin-session",
    });
  });

  it("runs bulk Founder assignment with session identity and returns its detailed result", async () => {
    const mocks = dependencies();
    const assignments = [
      { athleteId: " athlete-1 ", startsOn: "2026-09-14", endsOn: "2027-09-14" },
      { athleteId: "athlete-2", startsOn: "2026-08-01", endsOn: "2027-08-01" },
    ];

    const response = await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST", {
      action: "bulk_founder",
      assignments,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.bulkAssignFounder).toHaveBeenCalledWith({
      assignments,
      workspaceId: "workspace-session",
      createdByClerkUserId: "admin-session",
    });
    expect(payload).toMatchObject({
      created: [expect.objectContaining({ planCode: "founder" })],
      skipped: [{ athleteId: "athlete-2", reason: "active_subscription" }],
      errors: [{ athleteId: "athlete-3", message: "startsOn est requis." }],
    });
    expect(mocks.assignSubscription).not.toHaveBeenCalled();
  });

  it.each([
    { action: "bulk_founder", assignments: "athlete-1" },
    { action: "bulk_founder", assignments: [{ athleteId: "athlete-1", startsOn: "2026-09-14" }] },
    { action: "bulk_founder", assignments: [{ athleteId: "athlete-1", startsOn: "2026-09-14", endsOn: "2027-09-14", planCode: "founder" }] },
    { action: "bulk_founder", assignments: [], workspaceId: "workspace-client" },
  ])("rejects malformed or extended bulk Founder payloads", async (body) => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST", body));

    expect(response.status).toBe(400);
    expect(mocks.bulkAssignFounder).not.toHaveBeenCalled();
  });

  it.each([
    ["priceChf", 0],
    ["discountPercent", 100],
    ["photoSessionsIncluded", 99],
    ["mediaDaysIncluded", 99],
    ["competitionSessionsIncluded", 99],
    ["customContentsIncluded", 99],
  ])("rejects client-supplied commercial field %s", async (field, value) => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST", {
      ...assignmentBody,
      planCode: "founder",
      [field]: value,
    }));

    expect(response.status).toBe(400);
    expect(mocks.assignSubscription).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid assignment values", async () => {
    const mocks = dependencies();
    const malformedRequest = new Request("http://localhost/api/admin/athlete-subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect((await createAdminAthleteSubscriptionHandlers(mocks).POST(malformedRequest)).status).toBe(400);
    expect((await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST", {
      ...assignmentBody,
      isFounder: "false",
    }))).status).toBe(400);
  });

  it("cancels by action and subscription ID in the session workspace", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionHandlers(mocks).PATCH(request("PATCH", {
      action: "cancel",
      subscriptionId: ` ${subscriptionId} `,
    }));

    expect(response.status).toBe(200);
    expect(mocks.cancelSubscription).toHaveBeenCalledWith({
      workspaceId: "workspace-session",
      subscriptionId,
    });
  });

  it("rejects invalid or extended PATCH payloads", async () => {
    const mocks = dependencies();

    expect((await createAdminAthleteSubscriptionHandlers(mocks).PATCH(request("PATCH", {
      action: "delete",
      subscriptionId,
    }))).status).toBe(400);
    expect((await createAdminAthleteSubscriptionHandlers(mocks).PATCH(request("PATCH", {
      action: "cancel",
      subscriptionId,
      workspaceId: "workspace-client",
    }))).status).toBe(400);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it.each([
    [new AthleteSubscriptionValidationError("Entrée invalide."), 400],
    [new AthleteSubscriptionNotFoundError(), 404],
    [new AthleteSubscriptionConflictError(), 409],
    [new Error("database detail"), 500],
  ])("maps service errors without leaking internal failures", async (error, expectedStatus) => {
    const mocks = dependencies({ assignSubscription: vi.fn().mockRejectedValue(error) });

    const response = await createAdminAthleteSubscriptionHandlers(mocks).POST(request("POST", assignmentBody));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(expectedStatus);
    if (expectedStatus === 500) {
      expect(payload.error).toBe("Impossible de gérer les abonnements Athlètes.");
    }
  });
});