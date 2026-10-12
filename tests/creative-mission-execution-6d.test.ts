import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("db/migrations/20261019_creative_mission_execution_v1.sql"),
  "utf8",
);
const normalizedMigration = migration.replace(/\s+/g, " ").trim();

describe("creative mission execution schema 6D", () => {
  it("keeps the operational mission table additive and scoped", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_mission_executions");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_executions_request_unique_idx");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_executions_scope_unique_idx");
    expect(migration).toContain("FOREIGN KEY (workspace_id, service_request_id, mission_id)");
    expect(migration).toContain("FOREIGN KEY (workspace_id, creative_profile_id)");
    expect(normalizedMigration).toContain(
      "FOREIGN KEY (workspace_id, service_request_id, mission_id, creative_profile_id) "
      + "REFERENCES creative_mission_executions "
      + "(workspace_id, service_request_id, mission_id, creative_profile_id) "
      + "ON DELETE RESTRICT",
    );
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+.*\s+DROP\s+COLUMN/i);
  });

  it("enforces strict lifecycle and note constraints", () => {
    expect(migration).toContain("creative_mission_executions_timestamps_check");
    expect(migration).toContain("creative_mission_executions_change_request_requirement_check");
    expect(migration).toContain("creative_mission_executions_note_limits_check");
    expect(migration).toContain("creative_mission_executions_change_request_note_limits_check");
    expect(normalizedMigration).toContain(
      "status <> 'in_progress' OR started_at IS NOT NULL",
    );
    expect(normalizedMigration).toContain(
      "status NOT IN ('delivered', 'changes_requested', 'completed')",
    );
    expect(normalizedMigration).toContain(
      "delivered_at IS NULL OR started_at IS NULL OR delivered_at >= started_at",
    );
    expect(normalizedMigration).toContain(
      "completed_at IS NULL OR delivered_at IS NULL OR completed_at >= delivered_at",
    );
    expect(normalizedMigration).not.toContain(
      "status = 'accepted' OR",
    );
    expect(migration).toContain("NULLIF(btrim(change_request_note), '') IS NOT NULL");
  });

  it("keeps the event log immutable and append-only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_mission_execution_events");
    expect(migration).toContain("creative_mission_execution_events_projection_fk");
    expect(migration).toContain("creative_mission_execution_events_idempotency_idx");
    expect(migration).toContain("prevent_creative_mission_execution_event_mutation");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON creative_mission_execution_events");
    expect(migration).toContain("RAISE EXCEPTION 'creative_mission_execution_events is immutable'");
  });
});
