import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAthleteServiceRequestCommercialCompletionTransaction,
  readAthleteServiceRequestCommercialCompletionResult,
} from "@/lib/athlete-service-request-commercial-completion";
import type {
  NeonQueryFunctionInTransaction,
  NeonQueryInTransaction,
} from "@neondatabase/serverless";

type RecordedQuery = NeonQueryInTransaction & {
  text: string;
  values: unknown[];
};

const createRecordingTransactionSql = () => {
  const queries: RecordedQuery[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`,
      "",
    );
    const recorded = { queryData: { query: text, params: values }, text, values } as unknown as RecordedQuery;
    queries.push(recorded);
    return recorded;
  }) as unknown as NeonQueryFunctionInTransaction<false, false>;
  return { sql, queries };
};

const primitiveSource = fs.readFileSync(
  path.resolve(process.cwd(), "lib/athlete-service-request-commercial-completion.ts"),
  "utf8",
);
const publicSource = fs.readFileSync(
  path.resolve(process.cwd(), "lib/athlete-service-requests.ts"),
  "utf8",
);
const publicCompletionSource = publicSource.slice(
  publicSource.indexOf("async complete({ workspaceId, requestId, deliveryKey })"),
  publicSource.indexOf("async confirmPayment({ workspaceId, requestId, paymentReference })"),
);

describe("athlete service request commercial completion primitive", () => {
  it("builds on a caller-owned transaction SQL tag and never opens a transaction", () => {
    const recording = createRecordingTransactionSql();
    const plan = buildAthleteServiceRequestCommercialCompletionTransaction(recording.sql, {
      workspaceId: "workspace-1",
      requestId: "4b48c7f7-2e17-4cd5-9218-cc76015f77ae",
      deliveryKey: "delivery-1",
      movementId: "702ad760-8317-4f0d-bdb4-bba51bb56cd0",
      executionId: "c0b27ff5-a2dc-4ff4-9b85-4f2ae5f81198",
    });

    expect(plan.queries).toEqual(recording.queries);
    expect(plan.queries).toHaveLength(5);
    expect(plan.resultIndex).toBe(3);
    expect(primitiveSource).not.toContain(".transaction(");
    expect(primitiveSource).not.toContain("createContentStorageClient");
  });

  it("locks membership, request, then purchase in a stable workspace-scoped order", () => {
    const recording = createRecordingTransactionSql();
    buildAthleteServiceRequestCommercialCompletionTransaction(recording.sql, {
      workspaceId: "workspace-1",
      requestId: "4b48c7f7-2e17-4cd5-9218-cc76015f77ae",
      deliveryKey: "delivery-1",
      movementId: "702ad760-8317-4f0d-bdb4-bba51bb56cd0",
      executionId: "c0b27ff5-a2dc-4ff4-9b85-4f2ae5f81198",
    });

    expect(recording.queries[0].text).toContain("FOR UPDATE OF membership");
    expect(recording.queries[1].text).toContain("FOR UPDATE OF request");
    expect(recording.queries[2].text).toContain("FOR UPDATE OF purchase");
    for (const query of recording.queries.slice(0, 3)) {
      expect(query.text).toContain("request.workspace_id = $1");
      expect(query.values[0]).toBe("workspace-1");
    }
  });

  it("preserves all four fulfillment modes and existing pack progression", () => {
    expect(primitiveSource).toContain("'included_right'");
    expect(primitiveSource).toContain("'paid_extra'");
    expect(primitiveSource).toContain("'paid_with_right'");
    expect(primitiveSource).toContain("'no_charge'");
    expect(primitiveSource).toContain("candidate.delivered_quantity + 1 < candidate.purchase_quantity");
    expect(primitiveSource).toContain("THEN request.status");
  });

  it("accepts a composable caller guard without owning the surrounding workflow", () => {
    expect(primitiveSource).toContain("completionGuard?: NeonQueryInTransaction");
    expect(primitiveSource).toContain("AND (${input.completionGuard ?? true})");
  });

  it("links one canonical usage movement and reuses a coherent existing movement", () => {
    expect(primitiveSource).toContain("const referenceId = `athlete_service_request:${input.requestId}`");
    expect(primitiveSource).toContain("AND NOT EXISTS (SELECT 1 FROM referenced_movement)");
    expect(primitiveSource).toContain("LEFT JOIN coherent_movement movement ON TRUE");
    expect(primitiveSource).toContain("usage_movement_id = COALESCE(movement.id, request.usage_movement_id)");
  });

  it("detects an incompatible existing movement without inserting a second debit", () => {
    expect(primitiveSource).toContain("incompatible_movement AS");
    expect(primitiveSource).toContain("movement.workspace_id IS DISTINCT FROM candidate.workspace_id");
    expect(primitiveSource).toContain("movement.membership_id IS DISTINCT FROM candidate.membership_id");
    expect(primitiveSource).toContain("WHEN EXISTS (SELECT 1 FROM incompatible_movement) THEN 'conflict'");
    expect(primitiveSource).toContain("AND NOT EXISTS (SELECT 1 FROM referenced_movement)");
  });

  it("returns insufficient_rights before creating a new usage movement", () => {
    expect(primitiveSource).toContain("candidate.credit_balance >= candidate.snapshot_credit_quantity");
    expect(primitiveSource).toContain("candidate.credit_balance < candidate.snapshot_credit_quantity");
    expect(primitiveSource).toContain("THEN 'insufficient_rights'");
  });

  it("requires a paid purchase and rejects an incompatible reuse of a delivery key", () => {
    expect(primitiveSource).toContain("candidate.purchase_status = 'paid'");
    expect(primitiveSource).toContain("candidate.purchase_status IS DISTINCT FROM 'paid'");
    expect(primitiveSource).toContain("candidate.coherent_delivery_count <> candidate.delivery_match_count");
    expect(primitiveSource).toContain("THEN 'conflict'");
  });

  it("keeps paid_with_right movement and execution in one indivisible plan", () => {
    expect(primitiveSource).toContain("candidate.fulfillment_mode <> 'paid_with_right' OR EXISTS (SELECT 1 FROM coherent_movement)");
    expect(primitiveSource).toContain("AND EXISTS (SELECT 1 FROM coherent_movement)");
    expect(primitiveSource).toContain("AND EXISTS (SELECT 1 FROM inserted_execution)");
    expect(primitiveSource).toContain("assertCompletionConsistency");
  });

  it("contains no manual realization or synthetic request workflow", () => {
    expect(primitiveSource).not.toContain("is_admin_membership_realization");
    expect(primitiveSource).not.toContain("athlete-membership-service-realizations");
    expect(primitiveSource).not.toMatch(/INSERT\s+INTO\s+athlete_service_requests/i);
  });

  it("maps an existing result and a missing result without changing the public outcomes", () => {
    const transitioned = readAthleteServiceRequestCommercialCompletionResult(
      [[], [], [], [{ transition_outcome: "transitioned", id: "request-1" }]],
      3,
    );
    const missing = readAthleteServiceRequestCommercialCompletionResult([[], [], [], []], 3);

    expect(transitioned).toEqual({
      outcome: "transitioned",
      row: { transition_outcome: "transitioned", id: "request-1" },
    });
    expect(missing).toEqual({ outcome: "missing", row: null });
  });

  it("keeps the public completion contract and delegates one caller-owned transaction", () => {
    expect(publicCompletionSource).toContain("sql.transaction((transactionSql)");
    expect(publicCompletionSource).toContain("buildAthleteServiceRequestCommercialCompletionTransaction(transactionSql");
    expect(publicCompletionSource).toContain("readAthleteServiceRequestCommercialCompletionResult");
    expect(publicCompletionSource).toContain("deliveryKey");
    expect(publicCompletionSource).not.toContain("athlete-membership-service-realizations");
  });
});
