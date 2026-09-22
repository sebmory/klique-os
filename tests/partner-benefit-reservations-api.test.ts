import { describe, expect, it, vi } from "vitest";
import * as listRoute from "@/app/api/partner/benefit-reservations/route";
import { createPartnerBenefitReservationListHandlers } from "@/app/api/partner/benefit-reservations/route";
import * as mutationRoute from "@/app/api/partner/benefit-reservations/[id]/route";
import { createPartnerBenefitReservationMutationHandlers } from "@/app/api/partner/benefit-reservations/[id]/route";
import {
  PartnerBenefitReservationError,
  type PartnerBenefitReservation,
  type PartnerBenefitReservationGroups,
} from "@/lib/partner-benefits/partner-reservation-service";
import { isPartnerAllowedApi } from "@/proxy";

const reservationId = "bc38cd69-3112-4273-9ba5-86d9ef6e91ba";
const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";

const reservation: PartnerBenefitReservation = {
  id: reservationId,
  benefitId: "a4ed0d44-36d6-48e3-b399-28f6ac9e2538",
  partnerId,
  athleteId: "athlete-session",
  membershipId: "membership-session",
  benefitTitle: "Bilan personnalisé",
  benefitDetails: "Une séance individuelle.",
  usagePolicy: "once_per_membership",
  status: "reserved",
  reservedAt: "2026-09-20T10:00:00.000Z",
  usedAt: null,
  cancelledAt: null,
  expiresAt: "2027-01-01T00:00:00.000Z",
};

const groups: PartnerBenefitReservationGroups = {
  reserved: [reservation],
  used: [],
  cancelled: [],
  expired: [],
};

const listDependencies = () => ({
  list: vi.fn().mockResolvedValue(groups),
});

const mutationDependencies = () => ({
  markUsed: vi.fn().mockResolvedValue({
    ...reservation,
    status: "used" as const,
    usedAt: "2026-09-22T10:00:00.000Z",
  }),
  cancel: vi.fn().mockResolvedValue({
    ...reservation,
    status: "cancelled" as const,
    cancelledAt: "2026-09-22T10:00:00.000Z",
  }),
});

const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const context = (id = reservationId) => ({ params: Promise.resolve({ id }) });

describe("Partner benefit reservations GET API", () => {
  it("returns only the service-scoped reservation groups", async () => {
    const dependencies = listDependencies();
    const handlers = createPartnerBenefitReservationListHandlers(dependencies);
    const request = new Request("http://localhost/api/partner/benefit-reservations");

    const response = await handlers.GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reservations: groups });
    expect(dependencies.list).toHaveBeenCalledWith(request);
  });

  it.each(["partnerId=client", "workspaceId=client", "athleteId=client", "status=reserved"])(
    "rejects client scope query %s",
    async (query) => {
      const dependencies = listDependencies();
      const response = await createPartnerBenefitReservationListHandlers(dependencies).GET(
        new Request(`http://localhost/api/partner/benefit-reservations?${query}`),
      );

      expect(response.status).toBe(400);
      expect(dependencies.list).not.toHaveBeenCalled();
    },
  );

  it.each([
    [new PartnerBenefitReservationError("validation", "Requête invalide."), 400],
    [new PartnerBenefitReservationError("forbidden", "Accès refusé."), 403],
    [new PartnerBenefitReservationError("not_found", "Réservation introuvable."), 404],
    [new PartnerBenefitReservationError("terminal", "Transition terminale."), 409],
    [new PartnerBenefitReservationError("conflict", "Transition concurrente."), 409],
    [Object.assign(new Error("serialization"), { code: "40001" }), 409],
    [new Error("database secret"), 500],
  ] as const)("maps service errors to HTTP status %i", async (error, status) => {
    const dependencies = listDependencies();
    dependencies.list.mockRejectedValue(error);

    const response = await createPartnerBenefitReservationListHandlers(dependencies).GET(
      new Request("http://localhost/api/partner/benefit-reservations"),
    );

    expect(response.status).toBe(status);
    if (status === 500) {
      await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
    }
  });

  it("exports GET only and exposes no partner creation", () => {
    expect("GET" in listRoute).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(method in listRoute).toBe(false);
    }
  });
});

describe("Partner benefit reservation PATCH API", () => {
  it.each([
    ["mark_used", "markUsed", "used"],
    ["cancel", "cancel", "cancelled"],
  ] as const)("handles the strict %s action", async (action, method, status) => {
    const dependencies = mutationDependencies();
    const handlers = createPartnerBenefitReservationMutationHandlers(dependencies);
    const request = jsonRequest(
      `http://localhost/api/partner/benefit-reservations/${reservationId}`,
      { action },
    );

    const response = await handlers.PATCH(request, context());

    expect(response.status).toBe(200);
    expect(dependencies[method]).toHaveBeenCalledWith(request, reservationId);
    await expect(response.json()).resolves.toMatchObject({ reservation: { status } });
  });

  it.each([
    {},
    { action: "used" },
    { action: "reject" },
    { action: "mark_used", partnerId },
    { action: "cancel", workspaceId: "workspace-client" },
    { action: "cancel", athleteId: "athlete-client" },
    { action: "cancel", status: "cancelled" },
    { action: "cancel", benefitId: reservation.benefitId },
    [],
    null,
  ])("rejects non-strict actions and client identities", async (payload) => {
    const dependencies = mutationDependencies();
    const response = await createPartnerBenefitReservationMutationHandlers(dependencies).PATCH(
      jsonRequest(`http://localhost/api/partner/benefit-reservations/${reservationId}`, payload),
      context(),
    );

    expect(response.status).toBe(400);
    expect(dependencies.markUsed).not.toHaveBeenCalled();
    expect(dependencies.cancel).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and query identities", async () => {
    const dependencies = mutationDependencies();
    const handlers = createPartnerBenefitReservationMutationHandlers(dependencies);
    const malformed = new Request(`http://localhost/api/partner/benefit-reservations/${reservationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const withQuery = jsonRequest(
      `http://localhost/api/partner/benefit-reservations/${reservationId}?partnerId=${partnerId}`,
      { action: "cancel" },
    );

    expect((await handlers.PATCH(malformed, context())).status).toBe(400);
    expect((await handlers.PATCH(withQuery, context())).status).toBe(400);
    expect(dependencies.markUsed).not.toHaveBeenCalled();
    expect(dependencies.cancel).not.toHaveBeenCalled();
  });

  it("returns 404 without revealing another partner reservation", async () => {
    const dependencies = mutationDependencies();
    dependencies.markUsed.mockRejectedValue(
      new PartnerBenefitReservationError("not_found", "Réservation partenaire introuvable."),
    );

    const response = await createPartnerBenefitReservationMutationHandlers(dependencies).PATCH(
      jsonRequest(`http://localhost/api/partner/benefit-reservations/${reservationId}`, { action: "mark_used" }),
      context(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
  });

  it("exports PATCH only and cannot create or edit catalogue entries", () => {
    expect("PATCH" in mutationRoute).toBe(true);
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      expect(method in mutationRoute).toBe(false);
    }
  });
});

describe("Partner benefit reservations proxy access", () => {
  const collection = "/api/partner/benefit-reservations";
  const item = `${collection}/${reservationId}`;

  it("allows GET only on the exact collection", () => {
    expect(isPartnerAllowedApi(collection, "GET")).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isPartnerAllowedApi(collection, method)).toBe(false);
    }
  });

  it("allows PATCH only on exactly one reservation segment", () => {
    expect(isPartnerAllowedApi(item, "PATCH")).toBe(true);
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      expect(isPartnerAllowedApi(item, method)).toBe(false);
    }
  });

  it.each([
    ["/api/partner/benefit-reservations/", "GET"],
    [`${collection}/history`, "GET"],
    [`${item}/history`, "PATCH"],
    ["/api/partner/benefit-reservation/id", "PATCH"],
    ["/api/partner/benefits/reservations/id", "PATCH"],
  ])("rejects nested and lookalike route %s", (path, method) => {
    expect(isPartnerAllowedApi(path, method)).toBe(false);
  });
});