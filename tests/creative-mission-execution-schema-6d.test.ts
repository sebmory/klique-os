import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("db/migrations/20261019_creative_mission_execution_v1.sql"),
  "utf8",
);
const normalizedMigration = migration.replace(/\s+/g, " ").trim();

const constraintDefinition = (name: string, nextName: string): string => {
  const start = normalizedMigration.indexOf(`CONSTRAINT ${name}`);
  const end = normalizedMigration.indexOf(`CONSTRAINT ${nextName}`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return normalizedMigration.slice(start, end);
};

const timestampsAreValid = ({
  status,
  startedAt,
  deliveredAt,
  completedAt,
}: {
  status: "accepted" | "in_progress" | "delivered" | "changes_requested" | "completed";
  startedAt: number | null;
  deliveredAt: number | null;
  completedAt: number | null;
}): boolean => (
  (status !== "in_progress" || startedAt !== null)
  && (!["delivered", "changes_requested", "completed"].includes(status)
    || (startedAt !== null && deliveredAt !== null))
  && (status !== "completed"
    || (startedAt !== null && deliveredAt !== null && completedAt !== null))
  && (deliveredAt === null || startedAt === null || deliveredAt >= startedAt)
  && (completedAt === null || deliveredAt === null || completedAt >= deliveredAt)
);

describe("creative mission execution schema 6D", () => {
  it("creates a scoped 1:1 projection and append-only event log", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_mission_executions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_mission_execution_events");
    expect(migration).toContain("creative_mission_executions_request_unique_idx");
    expect(migration).toContain("creative_mission_executions_scope_unique_idx");
    expect(migration).toContain("creative_mission_execution_events_projection_fk");
    expect(normalizedMigration).toContain(
      "FOREIGN KEY (workspace_id, service_request_id, mission_id, creative_profile_id) "
      + "REFERENCES creative_mission_executions "
      + "(workspace_id, service_request_id, mission_id, creative_profile_id) "
      + "ON DELETE RESTRICT",
    );
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("creative_mission_execution_events_idempotency_idx");
  });

  it("enforces business timestamp and status constraints", () => {
    const check = constraintDefinition(
      "creative_mission_executions_timestamps_check",
      "creative_mission_executions_request_workspace_fk",
    );
    expect(check).toContain("status <> 'in_progress' OR started_at IS NOT NULL");
    expect(check).toContain(
      "status NOT IN ('delivered', 'changes_requested', 'completed') "
      + "OR ( started_at IS NOT NULL AND delivered_at IS NOT NULL )",
    );
    expect(check).toContain(
      "status <> 'completed' OR ( started_at IS NOT NULL "
      + "AND delivered_at IS NOT NULL AND completed_at IS NOT NULL )",
    );
    expect(check).toContain(
      "delivered_at IS NULL OR started_at IS NULL OR delivered_at >= started_at",
    );
    expect(check).toContain(
      "completed_at IS NULL OR delivered_at IS NULL OR completed_at >= delivered_at",
    );
    expect(check).not.toContain("status = 'accepted'");
    expect(check).not.toContain("AND delivered_at IS NULL");
    expect(check).not.toContain("AND completed_at IS NULL");
    expect(migration).toContain("creative_mission_executions_change_request_requirement_check");
    expect(migration).toContain("NULLIF(btrim(change_request_note), '') IS NOT NULL");
  });

  it("accepts only timestamp combinations allowed by the lifecycle contract", () => {
    expect(timestampsAreValid({
      status: "accepted",
      startedAt: null,
      deliveredAt: null,
      completedAt: null,
    })).toBe(true);
    expect(timestampsAreValid({
      status: "accepted",
      startedAt: 20,
      deliveredAt: 10,
      completedAt: null,
    })).toBe(false);
    expect(timestampsAreValid({
      status: "in_progress",
      startedAt: 10,
      deliveredAt: 20,
      completedAt: 30,
    })).toBe(true);
    expect(timestampsAreValid({
      status: "in_progress",
      startedAt: null,
      deliveredAt: null,
      completedAt: null,
    })).toBe(false);
    expect(timestampsAreValid({
      status: "delivered",
      startedAt: 10,
      deliveredAt: 20,
      completedAt: 30,
    })).toBe(true);
    expect(timestampsAreValid({
      status: "changes_requested",
      startedAt: 20,
      deliveredAt: 10,
      completedAt: null,
    })).toBe(false);
    expect(timestampsAreValid({
      status: "completed",
      startedAt: 10,
      deliveredAt: 20,
      completedAt: 19,
    })).toBe(false);
    expect(timestampsAreValid({
      status: "completed",
      startedAt: 10,
      deliveredAt: 20,
      completedAt: 30,
    })).toBe(true);
  });

  it("aligns note lengths with TypeScript validation and keeps the migration additive", () => {
    expect(migration).toContain("length(trim(delivery_note)) <= 2000");
    expect(migration).toContain("length(trim(change_request_note)) <= 2000");
    expect(migration).toContain("length(trim(note)) <= 2000");
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(normalizedMigration.startsWith("BEGIN;")).toBe(true);
    expect(normalizedMigration.endsWith("COMMIT;")).toBe(true);
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+.*\s+DROP\s+COLUMN/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+athlete_service_requests/i,
    );
    expect(migration).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+athlete_credit_movements/i,
    );
    expect(migration).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+athlete_purchases/i,
    );
    expect(migration).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+notifications/i,
    );
  });

  it("keeps the audit trail immutable and additive", () => {
    expect(migration).toContain("prevent_creative_mission_execution_event_mutation");
    expect(migration).toContain("RAISE EXCEPTION 'creative_mission_execution_events is immutable'");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON creative_mission_execution_events");
    expect(migration).not.toContain("DELETE FROM creative_mission_execution_events");
    expect(migration).not.toContain("UPDATE creative_mission_execution_events");
  });
});
