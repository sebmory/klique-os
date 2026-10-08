import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import {
  AthleteIncludedServiceRealizationError,
  recordAthleteIncludedServiceRealization,
  type AthleteIncludedServiceRealizationRepository,
} from "@/lib/athlete-membership-service-realizations";
import { createAthleteIncludedServiceRealizationHandlers } from "@/app/api/admin/athletes/[athleteId]/membership/realizations/route";

const serviceSource = fs.readFileSync(
  path.resolve(process.cwd(), "lib/athlete-membership-service-realizations.ts"),
  "utf8",
);

const validInput = {
  realizationId: "15e7180d-fcd2-4bd8-914b-18856c120a4e",
  workspaceId: "workspace-a",
  athleteId: "athlete-1",
  membershipId: "membership-1",
  creditType: "production" as const,
  occurredAt: "2026-09-10T12:00:00.000Z",
  note: "Séance historique",
  adminClerkUserId: "admin-1",
};

describe("Admin included service realizations", () => {
  it("records one immutable snapshot through an atomic service request completion", async () => {
    const repository: AthleteIncludedServiceRealizationRepository = {
      record: vi.fn().mockResolvedValue({
        outcome: "created",
        requestId: validInput.realizationId,
      }),
    };

    const result = await recordAthleteIncludedServiceRealization(validInput, {
      now: new Date("2026-10-08T12:00:00.000Z"),
      repository,
    });

    expect(result).toEqual({ outcome: "created", requestId: validInput.realizationId });
    expect(repository.record).toHaveBeenCalledWith(expect.objectContaining({
      requestId: validInput.realizationId,
      workspaceId: "workspace-a",
      athleteId: "athlete-1",
      membershipId: "membership-1",
      creditType: "production",
      productCode: "photo_session_standard",
      occurredAt: "2026-09-10T12:00:00.000Z",
      note: "Séance historique",
    }));
    expect(serviceSource).toContain("WITH locked_membership AS MATERIALIZED");
    expect(serviceSource).toContain("FOR UPDATE");
    expect(serviceSource).toContain("INSERT INTO athlete_credit_movements");
    expect(serviceSource).toContain("INSERT INTO athlete_service_requests");
    expect(serviceSource).toContain("'included_right', 'completed'");
    expect(serviceSource).toContain("${input.creditType}, 1, movement.id");
    expect(serviceSource).toContain("'athlete_service_request:' || ${input.requestId}");
    expect(serviceSource).toContain("'message', ${input.note}::text");
    expect(serviceSource).toContain("'historicalRealizationAt', ${input.occurredAt}::text");
    expect(serviceSource).toContain("'recordedByClerkUserId', ${input.adminClerkUserId}::text");
    expect(serviceSource).not.toContain("getShootingsFromGoogleSheets");
  });

  it.each([
    ["membership_inactive", "inactive"],
    ["insufficient_rights", "insufficient_rights"],
  ] as const)("rejects %s without reporting success", async (outcome, code) => {
    const repository: AthleteIncludedServiceRealizationRepository = {
      record: vi.fn().mockResolvedValue({ outcome, requestId: null }),
    };

    await expect(recordAthleteIncludedServiceRealization(validInput, {
      now: new Date("2026-10-08T12:00:00.000Z"),
      repository,
    })).rejects.toMatchObject({ code });
  });

  it("passes only the authorized workspace and path athlete to the service", async () => {
    const recordRealization = vi.fn().mockResolvedValue({
      outcome: "created",
      requestId: validInput.realizationId,
    });
    const handlers = createAthleteIncludedServiceRealizationHandlers({
      getAdminAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
        athleteExists: true,
      }),
      recordRealization,
    });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        realizationId: validInput.realizationId,
        membershipId: "membership-1",
        creditType: "custom_content",
        occurredAt: "2026-09-10T12:00:00.000Z",
        note: null,
      }),
    }) as NextRequest;

    const response = await handlers.POST(request, {
      params: Promise.resolve({ athleteId: "athlete-1" }),
    });

    expect(response.status).toBe(201);
    expect(recordRealization).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a",
      athleteId: "athlete-1",
      membershipId: "membership-1",
      adminClerkUserId: "admin-1",
    }));
  });

  it("forbids a non-Admin before invoking the workflow", async () => {
    const recordRealization = vi.fn();
    const handlers = createAthleteIncludedServiceRealizationHandlers({
      getAdminAccess: vi.fn().mockResolvedValue({
        clerkUserId: "athlete-user",
        role: "athlete",
        status: "active",
        workspaceId: "workspace-a",
        athleteExists: true,
      }),
      recordRealization,
    });

    const response = await handlers.POST(
      new Request("http://localhost", { method: "POST", body: "{}" }) as NextRequest,
      { params: Promise.resolve({ athleteId: "athlete-1" }) },
    );

    expect(response.status).toBe(403);
    expect(recordRealization).not.toHaveBeenCalled();
  });

  it("maps workflow conflicts to 409", async () => {
    const handlers = createAthleteIncludedServiceRealizationHandlers({
      getAdminAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
        athleteExists: true,
      }),
      recordRealization: vi.fn().mockRejectedValue(
        new AthleteIncludedServiceRealizationError("insufficient_rights", "Aucun droit disponible."),
      ),
    });
    const response = await handlers.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realizationId: validInput.realizationId,
          membershipId: "membership-1",
          creditType: "production",
          occurredAt: "2026-09-10T12:00:00.000Z",
        }),
      }) as NextRequest,
      { params: Promise.resolve({ athleteId: "athlete-1" }) },
    );

    expect(response.status).toBe(409);
  });

  it("returns a safe actionable transaction error without database details", async () => {
    const handlers = createAthleteIncludedServiceRealizationHandlers({
      getAdminAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
        athleteExists: true,
      }),
      recordRealization: vi.fn().mockRejectedValue(
        new AthleteIncludedServiceRealizationError(
          "transaction",
          "La transaction d’enregistrement a échoué. Réessayez ou contactez le support avec le code transaction_failed.",
        ),
      ),
    });
    const response = await handlers.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realizationId: validInput.realizationId,
          membershipId: "membership-1",
          creditType: "production",
          occurredAt: "2026-09-10T12:00:00.000Z",
        }),
      }) as NextRequest,
      { params: Promise.resolve({ athleteId: "athlete-1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: "La transaction d’enregistrement a échoué. Réessayez ou contactez le support avec le code transaction_failed.",
      code: "transaction_failed",
    });
    expect(JSON.stringify(payload)).not.toMatch(/42P18|constraint|parameter|workspace-a|athlete-1/);
  });
});
