import { describe, expect, it, vi } from "vitest";
import { createAdminAthleteServiceRequestHandlers } from "@/app/api/admin/athlete-service-requests/route";
import type { AdminAthleteServiceRequest } from "@/lib/athlete-service-requests";

const requestId = "4b48c7f7-2e17-4cd5-9218-cc76015f77ae";

const serviceRequest = (
  overrides: Partial<AdminAthleteServiceRequest> = {},
): AdminAthleteServiceRequest => ({
  id: requestId,
  athleteId: "athlete-1",
  productCode: "photo_session_standard",
  productName: "Session photo KLIQUE",
  fulfillmentMode: "included_right",
  status: "received",
  message: "Portraits de rentrée",
  preferredDate: "2026-09-20T00:00:00.000Z",
  requestedAt: "2026-09-08T12:00:00.000Z",
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  refusedAt: null,
  refusalReason: null,
  snapshotCreditType: "production",
  snapshotCreditQuantity: 1,
  snapshotPriceChf: null,
  ...overrides,
});

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    role: "admin",
    status: "active",
    workspaceId: "workspace-authenticated",
  }),
  hasCrmAccess: vi.fn().mockResolvedValue(true),
  listRequests: vi.fn().mockResolvedValue([serviceRequest()]),
  transitionRequest: vi.fn().mockResolvedValue({
    outcome: "transitioned",
    request: serviceRequest({ status: "to_confirm" }),
  }),
  ...overrides,
});

const patchRequest = (body: Record<string, unknown>) => new Request(
  "http://localhost/api/admin/athlete-service-requests",
  {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("Admin athlete service requests", () => {
  it("lists requests only for the authenticated active admin workspace", async () => {
    const mocks = dependencies();
    const response = await createAdminAthleteServiceRequestHandlers(mocks).GET(
      new Request("http://localhost/api/admin/athlete-service-requests?workspaceId=other"),
    );

    expect(response.status).toBe(200);
    expect(mocks.listRequests).toHaveBeenCalledWith({ workspaceId: "workspace-authenticated" });
  });

  it.each([
    [{ role: "admin", status: "inactive", workspaceId: "workspace-authenticated" }, true],
    [{ role: "athlete", status: "active", workspaceId: "workspace-authenticated" }, true],
    [{ role: "admin", status: "active", workspaceId: "workspace-authenticated" }, false],
  ])("rejects access unless admin is active and has CRM permission", async (access, hasCrmAccess) => {
    const mocks = dependencies({
      getAccess: vi.fn().mockResolvedValue(access),
      hasCrmAccess: vi.fn().mockResolvedValue(hasCrmAccess),
    });
    const response = await createAdminAthleteServiceRequestHandlers(mocks).GET(
      new Request("http://localhost/api/admin/athlete-service-requests"),
    );

    expect(response.status).toBe(403);
    expect(mocks.listRequests).not.toHaveBeenCalled();
  });

  it("maps take_over exclusively to received -> to_confirm", async () => {
    const mocks = dependencies();
    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({ requestId, action: "take_over" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.transitionRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      requestId,
      nextStatus: "to_confirm",
    });
  });

  it("requires and forwards a refusal reason", async () => {
    const mocks = dependencies();
    const handlers = createAdminAthleteServiceRequestHandlers(mocks);

    const invalidResponse = await handlers.PATCH(patchRequest({ requestId, action: "refuse" }));
    const validResponse = await handlers.PATCH(
      patchRequest({ requestId, action: "refuse", refusalReason: "Créneau indisponible" }),
    );

    expect(invalidResponse.status).toBe(400);
    expect(validResponse.status).toBe(200);
    expect(mocks.transitionRequest).toHaveBeenCalledTimes(1);
    expect(mocks.transitionRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      requestId,
      nextStatus: "refused",
      refusalReason: "Créneau indisponible",
    });
  });

  it("reports stale transitions and accepts idempotent repeats without another effect", async () => {
    const conflictMocks = dependencies({
      transitionRequest: vi.fn().mockResolvedValue({ outcome: "conflict", request: null }),
    });
    const unchangedMocks = dependencies({
      transitionRequest: vi.fn().mockResolvedValue({
        outcome: "unchanged",
        request: serviceRequest({ status: "to_confirm" }),
      }),
    });

    const conflict = await createAdminAthleteServiceRequestHandlers(conflictMocks).PATCH(
      patchRequest({ requestId, action: "take_over" }),
    );
    const unchanged = await createAdminAthleteServiceRequestHandlers(unchangedMocks).PATCH(
      patchRequest({ requestId, action: "take_over" }),
    );

    expect(conflict.status).toBe(409);
    expect(unchanged.status).toBe(200);
    expect(await unchanged.json()).toMatchObject({ unchanged: true });
  });
});