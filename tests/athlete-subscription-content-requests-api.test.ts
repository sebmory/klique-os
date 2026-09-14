import { describe, expect, it, vi } from "vitest";
import { createAthleteSubscriptionContentRequestHandlers } from "@/app/api/athlete/subscription/content-requests/route";
import {
  AthleteSubscriptionContentRequestConflictError,
  AthleteSubscriptionContentRequestError,
  AthleteSubscriptionContentRequestNotFoundError,
  type AthleteSubscriptionContentRequest,
} from "@/lib/athlete-subscription-content-requests/service";
import { isAthleteAllowedRoute } from "@/proxy";

const contentRequest: AthleteSubscriptionContentRequest = {
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspaceId: "workspace-session",
  subscriptionId: "91d272d1-1a5b-4486-bbc0-69b1ce747e4d",
  athleteId: "athlete-session",
  formatCode: "portrait",
  status: "requested",
  athleteNote: "Portrait pour une annonce.",
  preferredDate: "2026-10-02",
  adminNote: null,
  reservedAt: null,
  completedAt: null,
  createdAt: "2026-09-14T08:00:00.000Z",
  updatedAt: "2026-09-14T08:00:00.000Z",
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    clerkUserId: "clerk-session",
    role: "athlete",
    status: "active",
    workspaceId: " workspace-session ",
    athleteId: " athlete-session ",
  }),
  listRequests: vi.fn().mockResolvedValue([contentRequest]),
  createRequest: vi.fn().mockResolvedValue(contentRequest),
  ...overrides,
});

const getRequest = () => new Request(
  "http://localhost/api/athlete/subscription/content-requests?workspaceId=workspace-client&athleteId=athlete-client",
);

const postRequest = (body: unknown) => new Request(
  "http://localhost/api/athlete/subscription/content-requests",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("Athlete subscription content requests API", () => {
  it("lists only requests for the workspace and athlete from the session", async () => {
    const mocks = dependencies();

    const response = await createAthleteSubscriptionContentRequestHandlers(mocks).GET(getRequest());

    expect(response.status).toBe(200);
    expect(mocks.listRequests).toHaveBeenCalledWith("workspace-session", "athlete-session");
  });

  it("returns an explicit athlete-safe projection", async () => {
    const response = await createAthleteSubscriptionContentRequestHandlers(dependencies()).GET(getRequest());
    const payload = await response.json();

    expect(payload.requests[0]).toMatchObject({
      id: contentRequest.id,
      subscriptionId: contentRequest.subscriptionId,
      formatCode: "portrait",
      status: "requested",
      athleteNote: "Portrait pour une annonce.",
      preferredDate: "2026-10-02",
    });
    expect(payload.requests[0]).not.toHaveProperty("workspaceId");
    expect(payload.requests[0]).not.toHaveProperty("athleteId");
  });

  it("creates with only allowed payload values and session identity", async () => {
    const mocks = dependencies();

    const response = await createAthleteSubscriptionContentRequestHandlers(mocks).POST(postRequest({
      formatCode: "portrait",
      athleteNote: " Une idée de portrait ",
      preferredDate: "2026-10-02",
    }));

    expect(response.status).toBe(201);
    expect(mocks.createRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-session",
      athleteId: "athlete-session",
      formatCode: "portrait",
      athleteNote: " Une idée de portrait ",
      preferredDate: "2026-10-02",
    });
  });

  it("accepts omitted or null optional values", async () => {
    const mocks = dependencies();
    const handlers = createAthleteSubscriptionContentRequestHandlers(mocks);

    expect((await handlers.POST(postRequest({ formatCode: "reel" }))).status).toBe(201);
    expect((await handlers.POST(postRequest({
      formatCode: "reel",
      athleteNote: null,
      preferredDate: null,
    }))).status).toBe(201);
  });

  it.each([
    { formatCode: "portrait", workspaceId: "workspace-client" },
    { formatCode: "portrait", athleteId: "athlete-client" },
    { formatCode: "portrait", status: "completed" },
    { formatCode: "portrait", adminNote: "Force status" },
    { formatCode: "portrait", subscriptionId: contentRequest.subscriptionId },
  ])("rejects extra payload fields with 400", async (body) => {
    const mocks = dependencies();

    const response = await createAthleteSubscriptionContentRequestHandlers(mocks).POST(postRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { formatCode: null },
    { formatCode: "" },
    { formatCode: "portrait", athleteNote: 42 },
    { formatCode: "portrait", preferredDate: true },
  ])("rejects malformed payloads with 400", async (body) => {
    const response = await createAthleteSubscriptionContentRequestHandlers(dependencies()).POST(
      postRequest(body),
    );

    expect(response.status).toBe(400);
  });

  it("returns 401 without an authenticated Clerk identity", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });

    const getResponse = await createAthleteSubscriptionContentRequestHandlers(mocks).GET(getRequest());
    const postResponse = await createAthleteSubscriptionContentRequestHandlers(mocks).POST(
      postRequest({ formatCode: "portrait" }),
    );

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(mocks.listRequests).not.toHaveBeenCalled();
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it.each([
    { clerkUserId: "clerk-session", role: "admin", status: "active", workspaceId: "workspace-session", athleteId: "athlete-session" },
    { clerkUserId: "clerk-session", role: "athlete", status: "disabled", workspaceId: "workspace-session", athleteId: "athlete-session" },
    { clerkUserId: "clerk-session", role: "athlete", status: "active", workspaceId: "", athleteId: "athlete-session" },
    { clerkUserId: "clerk-session", role: "athlete", status: "active", workspaceId: "workspace-session", athleteId: "" },
  ])("returns 403 without complete active Athlete access", async (access) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(access) });

    const response = await createAthleteSubscriptionContentRequestHandlers(mocks).GET(getRequest());

    expect(response.status).toBe(403);
    expect(mocks.listRequests).not.toHaveBeenCalled();
  });

  it.each([
    [new AthleteSubscriptionContentRequestError("validation", "Format invalide."), 400],
    [new AthleteSubscriptionContentRequestNotFoundError(), 404],
    [new AthleteSubscriptionContentRequestConflictError("Quota atteint."), 409],
  ] as const)("maps typed service errors to HTTP status %s", async (error, status) => {
    const response = await createAthleteSubscriptionContentRequestHandlers(dependencies({
      createRequest: vi.fn().mockRejectedValue(error),
    })).POST(postRequest({ formatCode: "portrait" }));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code: error.code, error: error.message });
  });

  it("returns a generic 500 without leaking implementation details", async () => {
    const response = await createAthleteSubscriptionContentRequestHandlers(dependencies({
      listRequests: vi.fn().mockRejectedValue(new Error("database secret")),
    })).GET(getRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Impossible de traiter les demandes de contenus personnalisés.",
    });
  });
});

describe("Athlete subscription content requests proxy access", () => {
  const route = "/api/athlete/subscription/content-requests";

  it("allows only GET and POST on the exact route", () => {
    expect(isAthleteAllowedRoute(route, "GET")).toBe(true);
    expect(isAthleteAllowedRoute(route, "POST")).toBe(true);
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(isAthleteAllowedRoute(route, method)).toBe(false);
    }
  });

  it("does not authorize nested or lookalike routes", () => {
    expect(isAthleteAllowedRoute(`${route}/history`, "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/api/athlete/subscriptions/content-requests", "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/api/athlete/subscription/content-request", "GET")).toBe(false);
  });
});