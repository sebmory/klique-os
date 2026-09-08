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
  memberConfirmed: false,
  purchaseStatus: null,
  paymentReference: null,
  paymentUpdatedAt: null,
  purchasedQuantity: null,
  deliveredQuantity: 0,
  noChargeReason: null,
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
  scheduleRequest: vi.fn().mockResolvedValue({
    outcome: "transitioned",
    request: serviceRequest({ status: "scheduled", scheduledAt: "2099-09-20T10:00:00.000Z" }),
  }),
  startRequest: vi.fn().mockResolvedValue({
    outcome: "transitioned",
    request: serviceRequest({ status: "in_progress", startedAt: "2099-09-20T10:00:00.000Z" }),
  }),
  completeRequest: vi.fn().mockResolvedValue({
    outcome: "transitioned",
    request: serviceRequest({ status: "completed", completedAt: "2099-09-20T12:00:00.000Z" }),
  }),
  confirmPaymentRequest: vi.fn().mockResolvedValue({
    outcome: "transitioned",
    request: serviceRequest({ purchaseStatus: "paid", paymentReference: "VIREMENT-2026-001" }),
  }),
  assumeNoChargeRequest: vi.fn().mockResolvedValue({
    outcome: "transitioned",
    request: serviceRequest({ fulfillmentMode: "no_charge", status: "to_confirm", noChargeReason: "Athlète blessé, geste commercial" }),
  }),
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

  it("requires explicit receipt and a payment reference", async () => {
    const mocks = dependencies();
    const handlers = createAdminAthleteServiceRequestHandlers(mocks);

    const missingConfirmation = await handlers.PATCH(patchRequest({
      requestId,
      action: "confirm_payment",
      paymentReference: "VIREMENT-2026-001",
    }));
    const missingReference = await handlers.PATCH(patchRequest({
      requestId,
      action: "confirm_payment",
      paymentReceived: true,
    }));

    expect(missingConfirmation.status).toBe(400);
    expect(missingReference.status).toBe(400);
    expect(mocks.confirmPaymentRequest).not.toHaveBeenCalled();
  });

  it("confirms payment only through the authenticated Admin workspace", async () => {
    const mocks = dependencies();
    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(patchRequest({
      requestId,
      action: "confirm_payment",
      paymentReference: "  VIREMENT-2026-001  ",
      paymentReceived: true,
      workspaceId: "workspace-client",
    }));

    expect(response.status).toBe(200);
    expect(mocks.confirmPaymentRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      requestId,
      paymentReference: "VIREMENT-2026-001",
    });
  });

  it("accepts an idempotent payment confirmation repeat", async () => {
    const mocks = dependencies({
      confirmPaymentRequest: vi.fn().mockResolvedValue({
        outcome: "unchanged",
        request: serviceRequest({
          purchaseStatus: "paid",
          paymentReference: "VIREMENT-2026-001",
        }),
      }),
    });

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(patchRequest({
      requestId,
      action: "confirm_payment",
      paymentReference: "VIREMENT-2026-001",
      paymentReceived: true,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ unchanged: true });
  });

  it("blocks a simple refusal once the linked purchase is paid", async () => {
    const mocks = dependencies({
      transitionRequest: vi.fn().mockResolvedValue({ outcome: "paid_purchase", request: null }),
    });

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({ requestId, action: "refuse", refusalReason: "Demande annulée" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("remboursement") });
  });

  it("requires a future date and schedules only through the authenticated workspace", async () => {
    const mocks = dependencies();
    const handlers = createAdminAthleteServiceRequestHandlers(mocks);

    const missingDate = await handlers.PATCH(patchRequest({ requestId, action: "schedule" }));
    const valid = await handlers.PATCH(patchRequest({
      requestId,
      action: "schedule",
      scheduledAt: "2099-09-20T10:00:00.000Z",
    }));

    expect(missingDate.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(mocks.scheduleRequest).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      requestId,
      scheduledAt: "2099-09-20T10:00:00.000Z",
    });
  });

  it("reports insufficient rights and accepts an identical scheduling repeat", async () => {
    const insufficientMocks = dependencies({
      scheduleRequest: vi.fn().mockResolvedValue({ outcome: "insufficient_rights", request: null }),
    });
    const unchangedMocks = dependencies({
      scheduleRequest: vi.fn().mockResolvedValue({
        outcome: "unchanged",
        request: serviceRequest({ status: "scheduled", scheduledAt: "2099-09-20T10:00:00.000Z" }),
      }),
    });
    const body = { requestId, action: "schedule", scheduledAt: "2099-09-20T10:00:00.000Z" };

    const insufficient = await createAdminAthleteServiceRequestHandlers(insufficientMocks).PATCH(patchRequest(body));
    const unchanged = await createAdminAthleteServiceRequestHandlers(unchangedMocks).PATCH(patchRequest(body));

    expect(insufficient.status).toBe(409);
    expect(unchanged.status).toBe(200);
    expect(await unchanged.json()).toMatchObject({ unchanged: true });
  });

  it("routes start and completion through the authenticated workspace", async () => {
    const mocks = dependencies();
    const handlers = createAdminAthleteServiceRequestHandlers(mocks);

    const started = await handlers.PATCH(patchRequest({ requestId, action: "start" }));
    const completed = await handlers.PATCH(patchRequest({ requestId, action: "complete", deliveryKey: "delivery-key-1" }));

    expect(started.status).toBe(200);
    expect(completed.status).toBe(200);
    expect(mocks.startRequest).toHaveBeenCalledWith({ workspaceId: "workspace-authenticated", requestId });
    expect(mocks.completeRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      requestId,
      deliveryKey: "delivery-key-1",
    });
  });

  it("rejects completion without a stable delivery key", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({ requestId, action: "complete" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.completeRequest).not.toHaveBeenCalled();
  });

  it("accepts an idempotent completion repeat without another effect", async () => {
    const mocks = dependencies({
      completeRequest: vi.fn().mockResolvedValue({
        outcome: "unchanged",
        request: serviceRequest({ status: "completed", completedAt: "2099-09-20T12:00:00.000Z" }),
      }),
    });

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({ requestId, action: "complete", deliveryKey: "delivery-key-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ unchanged: true });
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

  it("requires a mandatory reason to classify a request as no_charge", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({ requestId, action: "assume_no_charge" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.assumeNoChargeRequest).not.toHaveBeenCalled();
  });

  it("classifies a request as no_charge only through the authenticated workspace, with the reason trimmed", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({
        requestId,
        action: "assume_no_charge",
        reason: "  Athlète blessé, geste commercial  ",
        workspaceId: "workspace-client",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.assumeNoChargeRequest).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      requestId,
      reason: "Athlète blessé, geste commercial",
    });
    expect(payload.request).toMatchObject({ fulfillmentMode: "no_charge", status: "to_confirm" });
  });

  it("reports a conflict when no_charge is attempted on a request with an existing purchase or wrong status", async () => {
    const mocks = dependencies({
      assumeNoChargeRequest: vi.fn().mockResolvedValue({ outcome: "conflict", request: null }),
    });

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({ requestId, action: "assume_no_charge", reason: "Motif" }),
    );

    expect(response.status).toBe(409);
  });

  it("accepts an idempotent no_charge repeat with the same reason without another effect", async () => {
    const mocks = dependencies({
      assumeNoChargeRequest: vi.fn().mockResolvedValue({
        outcome: "unchanged",
        request: serviceRequest({ fulfillmentMode: "no_charge", status: "to_confirm", noChargeReason: "Motif" }),
      }),
    });

    const response = await createAdminAthleteServiceRequestHandlers(mocks).PATCH(
      patchRequest({ requestId, action: "assume_no_charge", reason: "Motif" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ unchanged: true });
  });
});