import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, queryMock, transactionMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  queryMock: vi.fn(),
  transactionMock: vi.fn(),
}));
vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: () => Object.assign(sqlMock, { query: queryMock, transaction: transactionMock }),
}));
import { createAthleteRealizationRepository } from "@/lib/athlete-membership-service-realizations";

const scope = { workspaceId: "workspace-a", athleteId: "athlete-1", membershipId: "membership-1" };
const realizationId = "15e7180d-fcd2-4bd8-914b-18856c120a4e";
const recordInput = {
  ...scope, requestId: realizationId, movementId: "usage-1",
  creditType: "production" as const, productCode: "photo_session_standard" as const,
  occurredAt: "2026-09-10T12:00:00.000Z", note: null, adminClerkUserId: "admin-1",
};
const cancelInput = {
  ...scope, realizationId, movementId: "reversal-1", reason: "Erreur", adminClerkUserId: "admin-2",
};

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockReturnValue({ kind: "lock" });
  queryMock.mockReturnValue({ kind: "decision" });
  transactionMock.mockResolvedValue([[], [{ outcome: "created", request_id: realizationId }]]);
});

describe("Admin realization repository SQL contracts (no database writes)", () => {
  it("locks before checking creation with a fresh ReadCommitted snapshot", async () => {
    const result = await createAthleteRealizationRepository().record(recordInput);
    expect(result).toEqual({ outcome: "created", requestId: realizationId });
    expect(transactionMock).toHaveBeenCalledWith(
      [{ kind: "lock" }, { kind: "decision" }], { isolationLevel: "ReadCommitted" },
    );
    const [lockParts, ...lockParameters] = sqlMock.mock.calls[0];
    expect(lockParts.join(" ")).toContain("FOR UPDATE");
    expect(lockParameters).toEqual(Object.values(scope));
    const [query, parameters] = queryMock.mock.calls[0];
    expect(parameters).toEqual([
      ...Object.values(scope), realizationId, "production", "usage-1",
      "photo_session_standard", recordInput.occurredAt, null, "admin-1",
    ]);
    expect(query).toContain("statement_timestamp()");
    expect(query).toContain("request.is_admin_membership_realization");
    expect(query).toContain("usage.membership_id = $3");
    expect(query).toContain("request.snapshot_credit_type = $5 AND request.product_code = $7");
    expect(query).toContain("request.completed_at = $8::timestamptz");
    expect(query).toContain("IS NOT DISTINCT FROM $9::text");
    expect(query).toContain("request.requested_details->>'recordedByClerkUserId' = $10");
    expect(query).toContain("reversal.reversal_realization_id = request.id");
    expect(query).toContain("THEN 'conflict'");
    expect(query).toContain("is_admin_membership_realization");
    expect(query).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
  });

  it("shares exactly the same right-state SQL between creation and cancellation", async () => {
    const repository = createAthleteRealizationRepository();
    await repository.record(recordInput);
    transactionMock.mockResolvedValueOnce([[], [{
      outcome: "cancelled", id: "reversal-1", cancellation_reason: "Erreur",
      created_at: new Date("2026-10-08T20:00:00.000Z"), cancelled_by_clerk_user_id: "admin-2",
    }]]);
    const result = await repository.cancel(cancelInput);
    expect(result).toEqual({
      outcome: "cancelled",
      cancellation: {
        movementId: "reversal-1", reason: "Erreur", cancelledAt: "2026-10-08T20:00:00.000Z",
        adminClerkUserId: "admin-2",
      },
    });
    const recordQuery: string = queryMock.mock.calls[0][0];
    const cancelQuery: string = queryMock.mock.calls[1][0];
    const shared = recordQuery.slice(recordQuery.indexOf("operation_time AS"), recordQuery.indexOf(",\n          existing_request AS"));
    expect(shared).toContain("right_state AS");
    expect(cancelQuery).toContain(shared);
    expect(cancelQuery).toContain("NOT IN ('usage', 'usage_reversal', 'purchase')");
    expect(cancelQuery).toContain("OR movement.source = 'usage_reversal'");
    expect(cancelQuery).toContain("state.quota - state.used - state.reserved >= 0");
    expect(cancelQuery).toContain("THEN 'membership_inactive'");
    expect(cancelQuery).toContain("THEN 'unchanged' ELSE 'conflict'");
    expect(cancelQuery).toContain("1, 'usage_reversal'");
    expect(cancelQuery).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
    expect(queryMock.mock.calls[1][1]).toEqual([
      ...Object.values(scope), realizationId, "Erreur", "admin-2", "reversal-1",
    ]);
    expect(transactionMock.mock.calls[1][0][0]).toEqual({ kind: "lock" });
  });

  it("maps idempotent audit without replacing its original actor and time", async () => {
    transactionMock.mockResolvedValueOnce([[], [{
      outcome: "unchanged", id: "existing-reversal", cancellation_reason: "Erreur",
      created_at: "2026-10-07T20:00:00.000Z", cancelled_by_clerk_user_id: "original-admin",
    }]]);
    expect(await createAthleteRealizationRepository().cancel(cancelInput)).toMatchObject({
      outcome: "unchanged",
      cancellation: { movementId: "existing-reversal", adminClerkUserId: "original-admin", cancelledAt: "2026-10-07T20:00:00.000Z" },
    });
  });

  it("loads history with all three scopes and preserves cancellations", async () => {
    sqlMock.mockResolvedValueOnce([{
      id: realizationId, membership_id: scope.membershipId, snapshot_credit_type: "production",
      completed_at: recordInput.occurredAt, note: "Séance",
      recorded_at: "2026-10-01T20:00:00.000Z", recorded_by: "admin-1",
      reversal_id: "reversal-1", cancellation_reason: "Erreur",
      cancelled_at: "2026-10-08T20:00:00.000Z", cancelled_by_clerk_user_id: "admin-2",
    }]);
    const result = await createAthleteRealizationRepository().list(scope);
    const [parts, ...parameters] = sqlMock.mock.calls[0];
    const query = parts.join("?");
    expect(parameters).toEqual(Object.values(scope));
    expect(query).toContain("request.is_admin_membership_realization");
    expect(query).toContain("request.workspace_id = ? AND request.athlete_id = ?");
    expect(query).toContain("usage.membership_id = ?");
    expect(query).toContain("membership.workspace_id = usage.workspace_id");
    expect(query).toContain("reversal.membership_id = usage.membership_id");
    expect(query).toContain("ORDER BY request.created_at DESC, request.id DESC");
    expect(result).toEqual([{
      realizationId, membershipId: scope.membershipId, creditType: "production",
      occurredAt: recordInput.occurredAt, note: "Séance", recordedAt: "2026-10-01T20:00:00.000Z",
      adminClerkUserId: "admin-1",
      cancellation: {
        movementId: "reversal-1", reason: "Erreur", cancelledAt: "2026-10-08T20:00:00.000Z",
        adminClerkUserId: "admin-2",
      },
    }]);
  });

  it("logs an explicit transaction failure without returning success", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      transactionMock.mockRejectedValueOnce({ code: "23505", constraint: "realization_reversal_unique" });
      await expect(createAthleteRealizationRepository().cancel(cancelInput))
        .rejects.toMatchObject({ code: "transaction" });
      expect(log).toHaveBeenCalledWith(expect.any(String), {
        code: "23505", constraint: "realization_reversal_unique",
      });
    } finally {
      log.mockRestore();
    }
  });
});
