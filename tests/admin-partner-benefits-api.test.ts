import { beforeEach, describe, expect, it, vi } from "vitest";

import * as routeModule from "@/app/api/admin/partner-benefits/route";
import { createAdminPartnerBenefitHandlers } from "@/app/api/admin/partner-benefits/route";
import { PartnerBenefitAdminError } from "@/lib/partner-benefits/admin-service";

const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const benefitId = "a4ed0d44-36d6-48e3-b399-28f6ac9e2538";
const benefit = {
  id: benefitId,
  workspaceId: "klique-os",
  partnerId,
  title: "Bilan personnalisé",
  details: "Une séance individuelle.",
  usagePolicy: "once_per_membership" as const,
  validFrom: "2026-10-01T00:00:00.000Z",
  expiresAt: "2027-10-01T00:00:00.000Z",
  status: "active" as const,
  createdAt: "2026-09-22T10:00:00.000Z",
  updatedAt: "2026-09-22T10:00:00.000Z",
};

const createDependencies = () => ({
  list: vi.fn().mockResolvedValue([benefit]),
  create: vi.fn().mockResolvedValue(benefit),
  update: vi.fn().mockResolvedValue(benefit),
  deactivate: vi.fn().mockResolvedValue({ ...benefit, status: "inactive" as const }),
});

const jsonRequest = (method: "POST" | "PATCH", url: string, body: unknown) => new Request(url, {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const validCreatePayload = {
  partnerId,
  title: "Bilan personnalisé",
  details: "Une séance individuelle.",
  usagePolicy: "once_per_membership",
  validFrom: "2026-10-01T00:00:00Z",
  expiresAt: "2027-10-01T00:00:00Z",
  status: "active",
};

describe("/api/admin/partner-benefits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists benefits with an optional partnerId filter", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitHandlers(dependencies);

    const allResponse = await handlers.GET(new Request("http://localhost/api/admin/partner-benefits"));
    const filteredResponse = await handlers.GET(new Request(
      `http://localhost/api/admin/partner-benefits?partnerId=${partnerId}`,
    ));

    expect(allResponse.status).toBe(200);
    await expect(allResponse.json()).resolves.toEqual({ benefits: [benefit] });
    expect(dependencies.list).toHaveBeenNthCalledWith(1, expect.any(Request), undefined);
    expect(dependencies.list).toHaveBeenNthCalledWith(2, expect.any(Request), partnerId);
    expect(filteredResponse.status).toBe(200);
  });

  it("creates a benefit from the exact POST payload", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitHandlers(dependencies);
    const request = jsonRequest("POST", "http://localhost/api/admin/partner-benefits", validCreatePayload);

    const response = await handlers.POST(request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ benefit });
    expect(dependencies.create).toHaveBeenCalledWith(request, validCreatePayload);
  });

  it.each([
    [{ ...validCreatePayload, workspaceId: "other-workspace" }],
    [{ ...validCreatePayload, id: benefitId }],
    [Object.fromEntries(Object.entries(validCreatePayload).filter(([key]) => key !== "status"))],
  ])("rejects extra identity/workspace fields and missing POST fields", async (payload) => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitHandlers(dependencies);

    const response = await handlers.POST(jsonRequest(
      "POST",
      "http://localhost/api/admin/partner-benefits",
      payload,
    ));

    expect(response.status).toBe(400);
    expect(dependencies.create).not.toHaveBeenCalled();
  });

  it("updates editable fields with identities supplied only through the query", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitHandlers(dependencies);
    const payload = { title: "Nouvelle offre", status: "inactive" };
    const request = jsonRequest(
      "PATCH",
      `http://localhost/api/admin/partner-benefits?partnerId=${partnerId}&benefitId=${benefitId}`,
      payload,
    );

    const response = await handlers.PATCH(request);

    expect(response.status).toBe(200);
    expect(dependencies.update).toHaveBeenCalledWith(request, partnerId, benefitId, payload);
    expect(dependencies.deactivate).not.toHaveBeenCalled();
  });

  it("deactivates with the dedicated PATCH action", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitHandlers(dependencies);
    const request = jsonRequest(
      "PATCH",
      `http://localhost/api/admin/partner-benefits?partnerId=${partnerId}&benefitId=${benefitId}`,
      { action: "deactivate" },
    );

    const response = await handlers.PATCH(request);

    expect(response.status).toBe(200);
    expect(dependencies.deactivate).toHaveBeenCalledWith(request, partnerId, benefitId);
    expect(dependencies.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ partnerId, title: "Injection" }],
    [{ workspaceId: "other-workspace", title: "Injection" }],
    [{ id: benefitId, title: "Injection" }],
    [{}],
    [{ action: "deactivate", status: "inactive" }],
  ])("rejects non-editable, identity or mixed PATCH payloads", async (payload) => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitHandlers(dependencies);

    const response = await handlers.PATCH(jsonRequest(
      "PATCH",
      `http://localhost/api/admin/partner-benefits?partnerId=${partnerId}&benefitId=${benefitId}`,
      payload,
    ));

    expect(response.status).toBe(400);
    expect(dependencies.update).not.toHaveBeenCalled();
    expect(dependencies.deactivate).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unexpected query parameters", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminPartnerBenefitHandlers(dependencies);
    const malformed = new Request("http://localhost/api/admin/partner-benefits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect((await handlers.POST(malformed)).status).toBe(400);
    expect((await handlers.GET(new Request(
      "http://localhost/api/admin/partner-benefits?workspaceId=other-workspace",
    ))).status).toBe(400);
  });

  it.each([
    [new PartnerBenefitAdminError("validation", "Payload invalide."), 400],
    [new PartnerBenefitAdminError("forbidden", "Accès refusé."), 403],
    [new PartnerBenefitAdminError("partner_not_found", "Partenaire introuvable."), 404],
    [new PartnerBenefitAdminError("not_found", "Avantage introuvable."), 404],
    [{ code: "23505" }, 409],
    [new Error("database unavailable"), 500],
  ])("maps service and database errors to HTTP status %i", async (error, expectedStatus) => {
    const dependencies = createDependencies();
    dependencies.list.mockRejectedValue(error);
    const handlers = createAdminPartnerBenefitHandlers(dependencies);

    const response = await handlers.GET(new Request("http://localhost/api/admin/partner-benefits"));

    expect(response.status).toBe(expectedStatus);
  });

  it("does not expose a DELETE handler", () => {
    expect("DELETE" in routeModule).toBe(false);
  });
});