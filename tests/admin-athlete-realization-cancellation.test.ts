import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  AthleteIncludedServiceRealizationError,
  cancelAthleteIncludedServiceRealization,
  listAthleteAdminServiceRealizations,
  recordAthleteIncludedServiceRealization,
  type AthleteRealizationCancellationRepository,
  type AthleteRealizationHistoryRepository,
  type AthleteIncludedServiceRealizationRepository,
} from "@/lib/athlete-membership-service-realizations";
import { createAthleteRealizationCancellationHandlers } from "@/app/api/admin/athletes/[athleteId]/membership/realizations/[realizationId]/cancel/route";

const input = {
  workspaceId: "workspace-a",
  athleteId: "athlete-1",
  membershipId: "membership-1",
  realizationId: "15e7180d-fcd2-4bd8-914b-18856c120a4e",
  reason: "Erreur de saisie",
  adminClerkUserId: "admin-1",
};
const cancellation = {
  movementId: "reversal-1",
  reason: input.reason,
  cancelledAt: "2026-10-08T20:00:00.000Z",
  adminClerkUserId: "admin-1",
};
const access = {
  role: "admin", status: "active", workspaceId: "workspace-a",
  clerkUserId: "admin-1", athleteExists: true,
};
const context = {
  params: Promise.resolve({ athleteId: input.athleteId, realizationId: input.realizationId }),
};
const request = (body: unknown) => new Request("http://localhost/cancel", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}) as NextRequest;

describe("Admin realization cancellation service", () => {
  it.each(["cancelled", "unchanged"] as const)("returns the immutable audit for %s", async (outcome) => {
    const repository: AthleteRealizationCancellationRepository = {
      cancel: vi.fn().mockResolvedValue({ outcome, cancellation }),
    };
    expect(await cancelAthleteIncludedServiceRealization({
      ...input, reason: "  Erreur de saisie \n", realizationId: input.realizationId.toUpperCase(),
    }, { repository })).toEqual({ outcome, requestId: input.realizationId, cancellation });
    expect(repository.cancel).toHaveBeenCalledWith(expect.objectContaining({
      ...input, movementId: expect.any(String),
    }));
  });

  it.each(["", " \n\t ", "x".repeat(2001)])("rejects an invalid reason before accessing the database", async (reason) => {
    const repository: AthleteRealizationCancellationRepository = { cancel: vi.fn() };
    await expect(cancelAthleteIncludedServiceRealization({ ...input, reason }, { repository }))
      .rejects.toMatchObject({ code: "validation" });
    expect(repository.cancel).not.toHaveBeenCalled();
  });

  it.each(["workspaceId", "athleteId", "membershipId", "adminClerkUserId", "realizationId"] as const)(
    "requires %s before accessing the database", async (field) => {
      const repository: AthleteRealizationCancellationRepository = { cancel: vi.fn() };
      await expect(cancelAthleteIncludedServiceRealization({ ...input, [field]: "" }, { repository }))
        .rejects.toMatchObject({ code: "validation" });
      expect(repository.cancel).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["not_found", "not_found"],
    ["membership_inactive", "inactive"],
    ["conflict", "conflict"],
    ["inconsistent_balance", "inconsistent_balance"],
  ] as const)("does not report success for %s", async (outcome, code) => {
    const repository: AthleteRealizationCancellationRepository = {
      cancel: vi.fn().mockResolvedValue({ outcome, cancellation: null }),
    };
    await expect(cancelAthleteIncludedServiceRealization(input, { repository }))
      .rejects.toMatchObject({ code });
  });

  it("normalizes all history scopes and rejects empty membership IDs", async () => {
    const repository: AthleteRealizationHistoryRepository = { list: vi.fn().mockResolvedValue([]) };
    await listAthleteAdminServiceRealizations({
      workspaceId: " workspace-a ", athleteId: " athlete-1 ", membershipId: " membership-1 ",
    }, { repository });
    expect(repository.list).toHaveBeenCalledWith({
      workspaceId: "workspace-a", athleteId: "athlete-1", membershipId: "membership-1",
    });
    await expect(listAthleteAdminServiceRealizations({ ...input, membershipId: "" }, { repository }))
      .rejects.toMatchObject({ code: "validation" });
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it("rejects creation replay conflicts instead of reporting unchanged", async () => {
    const repository: AthleteIncludedServiceRealizationRepository = {
      record: vi.fn().mockResolvedValue({ outcome: "conflict", requestId: null }),
    };
    await expect(recordAthleteIncludedServiceRealization({
      ...input, creditType: "production", occurredAt: "2026-09-10T12:00:00.000Z",
    }, { repository, now: new Date("2026-10-08T20:00:00.000Z") }))
      .rejects.toMatchObject({ code: "conflict" });
  });
});

describe("Admin cancellation API", () => {
  const cancelRealization = vi.fn();
  const refresh = vi.fn();
  const getAdminAccess = vi.fn();
  const handlers = createAthleteRealizationCancellationHandlers({ getAdminAccess, cancelRealization, refresh });

  beforeEach(() => {
    vi.clearAllMocks();
    getAdminAccess.mockResolvedValue(access);
    cancelRealization.mockResolvedValue({ outcome: "cancelled", requestId: input.realizationId, cancellation });
    refresh.mockResolvedValue({ serviceSummary: { membershipId: input.membershipId }, realizations: [] });
  });

  it("derives actor and workspace from active Admin access, then refreshes the exact scope", async () => {
    const response = await handlers.POST(request({ membershipId: input.membershipId, reason: input.reason }), context);
    expect(response.status).toBe(200);
    expect(cancelRealization).toHaveBeenCalledWith(input);
    expect(refresh).toHaveBeenCalledWith({
      workspaceId: input.workspaceId, athleteId: input.athleteId, membershipId: input.membershipId,
    });
    expect(await response.json()).toMatchObject({
      requestId: input.realizationId, cancellation, unchanged: false,
      serviceSummary: { membershipId: input.membershipId }, realizations: [],
    });
  });

  it("returns unchanged audit and refreshes on an idempotent replay", async () => {
    cancelRealization.mockResolvedValue({ outcome: "unchanged", requestId: input.realizationId, cancellation });
    const response = await handlers.POST(request({ membershipId: input.membershipId, reason: input.reason }), context);
    expect(await response.json()).toMatchObject({ unchanged: true, cancellation });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    { role: "athlete" }, { status: "inactive" }, { workspaceId: "" },
    { clerkUserId: "" }, { athleteExists: false },
  ])("refuses unauthorized access %j before mutation", async (override) => {
    getAdminAccess.mockResolvedValue({ ...access, ...override });
    expect((await handlers.POST(request({}), context)).status).toBe(403);
    expect(cancelRealization).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    null, [], "invalid", {}, { membershipId: 123, reason: input.reason },
    { membershipId: input.membershipId, reason: null },
    ...["workspaceId", "athleteId", "adminClerkUserId", "quantity", "creditType", "cancelledAt"].map((field) => ({
      membershipId: input.membershipId, reason: input.reason, [field]: "injected",
    })),
  ])("rejects invalid or injected payload %j", async (body) => {
    expect((await handlers.POST(request(body), context)).status).toBe(400);
    expect(cancelRealization).not.toHaveBeenCalled();
  });

  it.each([
    ["validation", 400], ["not_found", 404], ["inactive", 409],
    ["conflict", 409], ["inconsistent_balance", 409], ["transaction", 500],
  ] as const)("maps %s to %s without refreshing", async (code, status) => {
    cancelRealization.mockRejectedValue(new AthleteIncludedServiceRealizationError(code, "Échec explicite"));
    const response = await handlers.POST(request({ membershipId: input.membershipId, reason: input.reason }), context);
    expect(response.status).toBe(status);
    expect(refresh).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ code: code === "transaction" ? "transaction_failed" : code });
  });

  it("distinguishes a committed cancellation from a failed refresh", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      refresh.mockRejectedValue(new Error("Unavailable"));
      const response = await handlers.POST(request({ membershipId: input.membershipId, reason: input.reason }), context);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        cancellation, refreshError: expect.stringContaining("Annulation enregistrée"),
      });
      expect(cancelRealization).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
