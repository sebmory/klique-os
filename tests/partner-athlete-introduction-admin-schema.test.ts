import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(
  process.cwd(),
  "db",
  "migrations",
  "20261020_partner_athlete_introduction_admin_supervision_v1.sql",
), "utf8");

describe("partner introduction Admin supervision schema", () => {
  it("adds reporting comments and idempotent solicitation audit without data cleanup", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS comment");
    expect(migration).toContain("partner_solicitation_control_events");
    expect(migration).toContain("UNIQUE (workspace_id, partner_id, idempotency_key)");
    expect(migration).toContain("'report_reviewing'");
    expect(migration).toContain("'report_resolved'");
    expect(migration).toContain("'report_dismissed'");
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM\b/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
  });
});
