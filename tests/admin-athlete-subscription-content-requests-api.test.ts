import { describe, expect, it, vi } from "vitest";
import { createAdminAthleteSubscriptionContentRequestHandlers } from "@/app/api/admin/athlete-subscription-content-requests/route";
import {
  AthleteSubscriptionContentRequestConflictError,
  AthleteSubscriptionContentRequestNotFoundError,
  AthleteSubscriptionContentRequestValidationError,
  type AthleteSubscriptionContentRequest,
  type AthleteSubscriptionContentRequestStatus,
} from "@/lib/athlete-subscription-content-requests/service";

const requestId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";

const contentRequest = (
  overrides: Partial<AthleteSubscriptionContentRequest> = {},
): AthleteSubscriptionContentRequest => ({
  id: requestId,
  workspaceId: "workspace-session",
  subscriptionId: "91d272d1-1a5b-4486-bbc0-69b1ce747e4d",
  athleteId: "athlete-1",
  formatCode: "portrait",
  status: "requested",
  athleteNote: "Portrait pour une annonce.",
  preferredDate: "2026-10-02",
  adminNote: null,
  reservedAt: null,
  completedAt: null,
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
  listRequests: vi.fn().mockResolvedValue([contentRequest()]),
  changeStatus: vi.fn().mockResolvedValue(contentRequest({ status: "accepted" })),
  ...overrides,
});

const request = (method: "GET" | "PATCH", body?: unknown) => new Request(
  "http://localhost/api/admin/athlete-subscription-content-requests?workspaceId=workspace-client",
  {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  },
);

describe("Admin athlete subscription content requests API", () => {
  it("lists every request only from the authenticated workspace", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).GET(
      request("GET"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ requests: [contentRequest()] });
    expect(mocks.listRequests).toHaveBeenCalledWith("workspace-session");
  });

  it("changes status using only the workspace from the session", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).PATCH(
      request("PATCH", {
        requestId: ` ${requestId} `,
        status: "accepted",
        adminNote: " Créneau réservé ",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.changeStatus).toHaveBeenCalledWith({
      workspaceId: "workspace-session",
      requestId,
      status: "accepted",
      adminNote: " Créneau réservé ",
    });
  });

  it.each([
    "requested",
    "accepted",
    "in_progress",
    "completed",
    "declined",
    "cancelled",
  ] as const)("accepts known status %s and delegates transition rules to the service", async (status) => {
    const mocks = dependencies({
      changeStatus: vi.fn().mockResolvedValue(contentRequest({ status })),
    });

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).PATCH(
      request("PATCH", { requestId, status }),
    );

    expect(response.status).toBe(200);
    expect(mocks.changeStatus).toHaveBeenCalledWith({
      workspaceId: "workspace-session",
      requestId,
      status,
    });
  });

  it("accepts a null admin note", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).PATCH(
      request("PATCH", { requestId, status: "accepted", adminNote: null }),
    );

    expect(response.status).toBe(200);
    expect(mocks.changeStatus).toHaveBeenCalledWith({
      workspaceId: "workspace-session",
      requestId,
      status: "accepted",
      adminNote: null,
    });
  });

  it.each([
    { requestId, status: "accepted", workspaceId: "workspace-client" },
    { requestId, status: "accepted", athleteId: "athlete-client" },
    { requestId, status: "accepted", reservedAt: "2026-10-02T10:00:00Z" },
    { requestId, status: "accepted", completedAt: "2026-10-03T10:00:00Z" },
  ])("rejects extended PATCH payloads with 400", async (body) => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).PATCH(
      request("PATCH", body),
    );

    expect(response.status).toBe(400);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { requestId: "", status: "accepted" },
    { requestId, status: "unknown" },
    { requestId, status: "accepted", adminNote: 42 },
  ])("rejects malformed transition payloads with 400", async (body) => {
    const mocks = dependencies();

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).PATCH(
      request("PATCH", body),
    );

    expect(response.status).toBe(400);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const mocks = dependencies();
    const malformedRequest = new Request(
      "http://localhost/api/admin/athlete-subscription-content-requests",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      },
    );

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).PATCH(
      malformedRequest,
    );

    expect(response.status).toBe(400);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it("returns 401 without an authenticated Clerk identity", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });
    const handlers = createAdminAthleteSubscriptionContentRequestHandlers(mocks);

    expect((await handlers.GET(request("GET"))).status).toBe(401);
    expect((await handlers.PATCH(request("PATCH", { requestId, status: "accepted" }))).status)
      .toBe(401);
    expect(mocks.listRequests).not.toHaveBeenCalled();
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it.each([
    { clerkUserId: "admin-session", role: "athlete", status: "active", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "disabled", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "active", workspaceId: "" },
  ])("returns 403 without active Admin workspace access", async (access) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(access) });

    const response = await createAdminAthleteSubscriptionContentRequestHandlers(mocks).GET(
      request("GET"),
    );

    expect(response.status).toBe(403);
    expect(mocks.listRequests).not.toHaveBeenCalled();
  });

  it.each([
    [new AthleteSubscriptionContentRequestValidationError("Entrée invalide."), 400],
    [new AthleteSubscriptionContentRequestNotFoundError(), 404],
    [new AthleteSubscriptionContentRequestConflictError("Transition interdite."), 409],
  ] as const)("maps typed service errors to HTTP %s", async (error, expectedStatus) => {
    const response = await createAdminAthleteSubscriptionContentRequestHandlers(dependencies({
      changeStatus: vi.fn().mockRejectedValue(error),
    })).PATCH(request("PATCH", { requestId, status: "accepted" }));
    const payload = await response.json();

    expect(response.status).toBe(expectedStatus);
    expect(payload).toMatchObject({ error: error.message, code: error.code });
  });

  it("returns a generic 500 without leaking internal errors", async () => {
    const response = await createAdminAthleteSubscriptionContentRequestHandlers(dependencies({
      listRequests: vi.fn().mockRejectedValue(new Error("database detail")),
    })).GET(request("GET"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Impossible de gérer les demandes de contenus personnalisés.",
    });
  });
});