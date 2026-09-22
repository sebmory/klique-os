import { beforeEach, describe, expect, it, vi } from "vitest";

import * as routeModule from "@/app/api/admin/partner-benefit-reservations/route";
import { createAdminPartnerBenefitReservationAuditHandlers } from "@/app/api/admin/partner-benefit-reservations/route";
import { PartnerBenefitReservationAuditError } from "@/lib/partner-benefits/admin-reservation-audit-service";
import { isAdminPartnerBenefitReservationAuditApi } from "@/proxy";

const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const benefitId = "a4ed0d44-36d6-48e3-b399-28f6ac9e2538";

const createDependencies = () => ({
  list: vi.fn().mockResolvedValue([]),
});

describe("GET /api/admin/partner-benefit-reservations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the four optional filters together", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitReservationAuditHandlers(dependencies);
    const request = new Request(
      `http://localhost/api/admin/partner-benefit-reservations?partnerId=${partnerId}`
      + `&athleteId=athlete-1&benefitId=${benefitId}&status=used`,
    );

    const response = await handlers.GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reservations: [] });
    expect(dependencies.list).toHaveBeenCalledWith(request, {
      partnerId,
      athleteId: "athlete-1",
      benefitId,
      status: "used",
    });
  });

  it.each([
    "?workspaceId=other-workspace",
    "?partnerId=",
    `?partnerId=${partnerId}&partnerId=${partnerId}`,
    "?status=used&unknown=value",
  ])("rejects invalid query %s before service access", async (query) => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitReservationAuditHandlers(dependencies);

    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/partner-benefit-reservations${query}`,
    ));

    expect(response.status).toBe(400);
    expect(dependencies.list).not.toHaveBeenCalled();
  });

  it.each([
    [new PartnerBenefitReservationAuditError("validation", "Filtre invalide."), 400],
    [new PartnerBenefitReservationAuditError("forbidden", "Accès refusé."), 403],
    [new Error("database unavailable"), 500],
  ])("maps service errors to HTTP status %i", async (error, status) => {
    const dependencies = createDependencies();
    dependencies.list.mockRejectedValue(error);
    const handlers = createAdminPartnerBenefitReservationAuditHandlers(dependencies);

    const response = await handlers.GET(new Request(
      "http://localhost/api/admin/partner-benefit-reservations",
    ));

    expect(response.status).toBe(status);
  });

  it("exports GET only", () => {
    expect("GET" in routeModule).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(method in routeModule).toBe(false);
    }
  });
});

describe("Admin reservation audit proxy access", () => {
  const path = "/api/admin/partner-benefit-reservations";

  it("allows GET only on the exact path", () => {
    expect(isAdminPartnerBenefitReservationAuditApi(path, "GET")).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isAdminPartnerBenefitReservationAuditApi(path, method)).toBe(false);
    }
  });

  it.each([
    "/api/admin/partner-benefit-reservations/",
    "/api/admin/partner-benefit-reservations/history",
    "/api/admin/partner-benefit-reservation",
    "/api/admin/partner-benefits/reservations",
  ])("rejects nested and lookalike route %s", (pathname) => {
    expect(isAdminPartnerBenefitReservationAuditApi(pathname, "GET")).toBe(false);
  });
});