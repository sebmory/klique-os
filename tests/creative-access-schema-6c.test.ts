import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "db", "migrations", "20261018_creative_access_v1.sql"),
  "utf8",
);

describe("creative access 6C migration", () => {
  it("is additive, transactional and keeps creative access separate from user_access", () => {
    expect(migration).toMatch(/^\s*BEGIN;/);
    expect(migration).toMatch(/COMMIT;\s*$/);
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_access");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_invitations");
    expect(migration).not.toMatch(/ALTER TABLE\s+user_access/i);
    expect(migration).not.toMatch(/\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
  });

  it("binds access and invitations to the canonical workspace profile", () => {
    expect(migration).toContain("FOREIGN KEY (workspace_id, creative_profile_id)");
    expect(migration).toContain("REFERENCES creative_profiles (workspace_id, id)");
    expect(migration).toContain("creative_access_workspace_profile_unique_idx");
    expect(migration).toContain("creative_access_workspace_clerk_unique_idx");
    expect(migration).toContain("ON DELETE RESTRICT");
  });

  it("stores an idempotent projection and immutable append-only response history", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_mission_responses");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS creative_mission_response_events");
    expect(migration).toContain("request_fingerprint");
    expect(migration).toContain("idempotency_key");
    expect(migration).toContain("creative_mission_response_events_idempotency_unique_idx");
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON creative_mission_response_events/);
    expect(migration).toContain("creative_mission_response_events is immutable");
  });
});
