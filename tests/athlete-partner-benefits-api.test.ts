import { describe, expect, it, vi } from "vitest";
import * as catalogRoute from "@/app/api/athlete/partner-benefits/route";
import { createAthletePartnerBenefitHandlers } from "@/app/api/athlete/partner-benefits/route";
import * as reservationRoute from "@/app/api/athlete/partner-benefit-reservations/[id]/route";
import { createAthletePartnerBenefitReservationHandlers } from "@/app/api/athlete/partner-benefit-reservations/[id]/route";
import {
  AthletePartnerBenefitError,
  type AthletePartnerBenefit,
  type AthletePartnerBenefitReservation,
} from "@/lib/partner-benefits/athlete-service";
import { isAthleteAllowedRoute } from "@/proxy";

const benefitId = "a4ed0d44-36d6-48e3-b399-28f6ac9e2538";
const reservationId = "bc38cd69-3112-4273-9ba5-86d9ef6e91ba";

const benefit: AthletePartnerBenefit = {
  id: benefitId,
  partnerId: "512c0349-236a-4f07-b099-4e6c29e22241",
  title: "Bilan personnalisé",
  details: "Une séance individuelle.",
  usagePolicy: "once_per_membership",
  validFrom: "2026-09-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  availability: "available",
  personalStatus: "available",
  available: true,
  activeReservationId: null,
};

const reservation: AthletePartnerBenefitReservation = {
  id: reservationId,
  workspaceId: "workspace-session",
  benefitId,
  partnerId: benefit.partnerId,
  athleteId: "athlete-session",
  membershipId: "membership-session",
  membershipStartsAt: "2026-01-01T00:00:00.000Z",
  membershipEndsAt: "2027-01-01T00:00:00.000Z",
  usagePolicy: "once_per_membership",
  usageScopeKey: "membership-session",
  status: "reserved",
  reservedAt: "2026-09-22T10:00:00.000Z",
  cancelledAt: null,
  expiresAt: "2027-01-01T00:00:00.000Z",
};

const catalogDependencies = () => ({
  list: vi.fn().mockResolvedValue([benefit]),
  reserve: vi.fn().mockResolvedValue(reservation),
});

const cancellationDependencies = () => ({
  cancel: vi.fn().mockResolvedValue({
    ...reservation,
    status: "cancelled" as const,
    cancelledAt: "2026-09-22T11:00:00.000Z",
  }),
});

const jsonRequest = (method: "POST" | "PATCH", url: string, body: unknown) => new Request(url, {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const context = (id = reservationId) => ({ params: Promise.resolve({ id }) });

describe("Athlete partner benefits API", () => {
  it("returns the personal catalogue without accepting query identities", async () => {
    const dependencies = catalogDependencies();
    const handlers = createAthletePartnerBenefitHandlers(dependencies);
    const request = new Request("http://localhost/api/athlete/partner-benefits");

    const response = await handlers.GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ benefits: [benefit] });
    expect(dependencies.list).toHaveBeenCalledWith(request);

    for (const query of ["partnerId=x", "athleteId=x", "membershipId=x", "workspaceId=x", "status=active"]) {
      expect((await handlers.GET(new Request(`http://localhost/api/athlete/partner-benefits?${query}`))).status)
        .toBe(400);
    }
  });

  it("reserves from the exact { benefitId } payload", async () => {
    const dependencies = catalogDependencies();
    const handlers = createAthletePartnerBenefitHandlers(dependencies);
    const request = jsonRequest("POST", "http://localhost/api/athlete/partner-benefits", { benefitId });

    const response = await handlers.POST(request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ reservation });
    expect(dependencies.reserve).toHaveBeenCalledWith(request, { benefitId });
  });

  it.each([
    {},
    { partnerId: benefit.partnerId },
    { benefitId, partnerId: benefit.partnerId },
    { benefitId, athleteId: "athlete-client" },
    { benefitId, membershipId: "membership-client" },
    { benefitId, workspaceId: "workspace-client" },
    { benefitId, status: "used" },
    [],
    null,
  ])("rejects non-strict reservation payloads", async (payload) => {
    const dependencies = catalogDependencies();
    const response = await createAthletePartnerBenefitHandlers(dependencies).POST(
      jsonRequest("POST", "http://localhost/api/athlete/partner-benefits", payload),
    );

    expect(response.status).toBe(400);
    expect(dependencies.reserve).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and every POST query field", async () => {
    const dependencies = catalogDependencies();
    const handlers = createAthletePartnerBenefitHandlers(dependencies);
    const malformed = new Request("http://localhost/api/athlete/partner-benefits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const withQuery = jsonRequest(
      "POST",
      "http://localhost/api/athlete/partner-benefits?partnerId=client",
      { benefitId },
    );

    expect((await handlers.POST(malformed)).status).toBe(400);
    expect((await handlers.POST(withQuery)).status).toBe(400);
    expect(dependencies.reserve).not.toHaveBeenCalled();
  });

  it.each([
    [new AthletePartnerBenefitError("validation", "Identifiant invalide."), 400],
    [new AthletePartnerBenefitError("forbidden", "Accès Athlète requis."), 403],
    [new AthletePartnerBenefitError("membership_required", "Adhésion active requise."), 403],
    [new AthletePartnerBenefitError("not_found", "Avantage introuvable."), 404],
    [new AthletePartnerBenefitError("unavailable", "Avantage indisponible."), 409],
    [new AthletePartnerBenefitError("conflict", "Réservation concurrente."), 409],
    [Object.assign(new Error("unique violation"), { code: "23505" }), 409],
    [new Error("database secret"), 500],
  ] as const)("maps service failures to HTTP status %i", async (error, status) => {
    const dependencies = catalogDependencies();
    dependencies.list.mockRejectedValue(error);

    const response = await createAthletePartnerBenefitHandlers(dependencies).GET(
      new Request("http://localhost/api/athlete/partner-benefits"),
    );

    expect(response.status).toBe(status);
    if (status === 500) {
      await expect(response.json()).resolves.toEqual({ error: "Une erreur interne est survenue." });
    }
  });

  it("exports only GET and POST application handlers", () => {
    expect("GET" in catalogRoute).toBe(true);
    expect("POST" in catalogRoute).toBe(true);
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(method in catalogRoute).toBe(false);
    }
  });
});

describe("Athlete partner benefit cancellation API", () => {
  it("cancels only through the route id and the dedicated action", async () => {
    const dependencies = cancellationDependencies();
    const handlers = createAthletePartnerBenefitReservationHandlers(dependencies);
    const request = jsonRequest(
      "PATCH",
      `http://localhost/api/athlete/partner-benefit-reservations/${reservationId}`,
      { action: "cancel" },
    );

    const response = await handlers.PATCH(request, context());

    expect(response.status).toBe(200);
    expect(dependencies.cancel).toHaveBeenCalledWith(request, reservationId);
    await expect(response.json()).resolves.toMatchObject({ reservation: { status: "cancelled" } });
  });

  it.each([
    {},
    { action: "use" },
    { action: "cancel", status: "cancelled" },
    { action: "cancel", partnerId: benefit.partnerId },
    { action: "cancel", athleteId: "athlete-client" },
    { action: "cancel", membershipId: "membership-client" },
    { status: "cancelled" },
  ])("rejects free status, identities and non-cancellation payloads", async (payload) => {
    const dependencies = cancellationDependencies();
    const response = await createAthletePartnerBenefitReservationHandlers(dependencies).PATCH(
      jsonRequest(
        "PATCH",
        `http://localhost/api/athlete/partner-benefit-reservations/${reservationId}`,
        payload,
      ),
      context(),
    );

    expect(response.status).toBe(400);
    expect(dependencies.cancel).not.toHaveBeenCalled();
  });

  it("rejects query fields and maps an unknown reservation to 404", async () => {
    const dependencies = cancellationDependencies();
    const handlers = createAthletePartnerBenefitReservationHandlers(dependencies);
    const withQuery = jsonRequest(
      "PATCH",
      `http://localhost/api/athlete/partner-benefit-reservations/${reservationId}?workspaceId=client`,
      { action: "cancel" },
    );

    expect((await handlers.PATCH(withQuery, context())).status).toBe(400);
    dependencies.cancel.mockRejectedValue(new AthletePartnerBenefitError("not_found", "Réservation introuvable."));
    const missing = await handlers.PATCH(jsonRequest(
      "PATCH",
      `http://localhost/api/athlete/partner-benefit-reservations/${reservationId}`,
      { action: "cancel" },
    ), context());
    expect(missing.status).toBe(404);
  });

  it("exports only PATCH for reservation mutation", () => {
    expect("PATCH" in reservationRoute).toBe(true);
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      expect(method in reservationRoute).toBe(false);
    }
  });
});

describe("Athlete partner benefits proxy access", () => {
  const catalogPath = "/api/athlete/partner-benefits";
  const reservationPath = `/api/athlete/partner-benefit-reservations/${reservationId}`;

  it("allows only GET and POST on the exact catalogue path", () => {
    expect(isAthleteAllowedRoute(catalogPath, "GET")).toBe(true);
    expect(isAthleteAllowedRoute(catalogPath, "POST")).toBe(true);
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(isAthleteAllowedRoute(catalogPath, method)).toBe(false);
    }
  });

  it("allows only PATCH on one reservation id segment", () => {
    expect(isAthleteAllowedRoute(reservationPath, "PATCH")).toBe(true);
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      expect(isAthleteAllowedRoute(reservationPath, method)).toBe(false);
    }
  });

  it.each([
    ["/api/athlete/partner-benefits/history", "GET"],
    ["/api/athlete/partner-benefits/", "GET"],
    ["/api/athlete/partner-benefit-reservations", "PATCH"],
    [`${reservationPath}/history`, "PATCH"],
    ["/api/athlete/partner-benefit-reservation/id", "PATCH"],
    ["/api/athlete/partner-benefits-reservations/id", "PATCH"],
  ])("rejects nested and lookalike path %s", (path, method) => {
    expect(isAthleteAllowedRoute(path, method)).toBe(false);
  });
});