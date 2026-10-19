import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "db/migrations/20261019_editorial_context_collections_v1.sql",
);

const readMigration = () => fs.readFileSync(migrationPath, "utf8");

describe("editorial context collections schema", () => {
  it("is transactional, additive, and replayable without deleting schema or data", () => {
    const sql = readMigration();

    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS editorial_context_collections");
    expect(sql.match(/CREATE INDEX IF NOT EXISTS/g)).toHaveLength(2);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION prevent_editorial_context_collection_update()");
    expect(sql).toMatch(/IF NOT EXISTS\s*\(\s*SELECT 1\s+FROM pg_trigger/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("restricts ownership to Admin without media and Media with media", () => {
    const sql = readMigration();

    expect(sql).toContain("role TEXT NOT NULL CHECK (role IN ('admin', 'media'))");
    expect(sql).toMatch(/\(role = 'admin' AND media_id IS NULL\)/);
    expect(sql).toMatch(/\(role = 'media' AND media_id IS NOT NULL\)/);
  });

  it("requires arrays for items and reports and an object for summary", () => {
    const sql = readMigration();

    expect(sql).toContain("items_json JSONB NOT NULL");
    expect(sql).toContain("reports_json JSONB NOT NULL");
    expect(sql).toContain("summary_json JSONB NOT NULL");
    expect(sql).toContain("CHECK (jsonb_typeof(items_json) = 'array')");
    expect(sql).toContain("CHECK (jsonb_typeof(reports_json) = 'array')");
    expect(sql).toContain("CHECK (jsonb_typeof(summary_json) = 'object')");
  });

  it("requires a future expiration no later than thirty minutes after creation", () => {
    const sql = readMigration();

    expect(sql).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
    expect(sql).toContain("expires_at TIMESTAMPTZ NOT NULL");
    expect(sql).toMatch(
      /CHECK\s*\(\s*expires_at > created_at\s+AND expires_at <= created_at \+ INTERVAL '30 minutes'\s*\)/,
    );
  });

  it("blocks every update while keeping delete available for expiration purge", () => {
    const sql = readMigration();

    expect(sql).toContain("RAISE EXCEPTION 'editorial_context_collections rows are immutable after creation'");
    expect(sql).toMatch(
      /CREATE TRIGGER editorial_context_collections_prevent_update\s+BEFORE UPDATE ON editorial_context_collections\s+FOR EACH ROW\s+EXECUTE FUNCTION prevent_editorial_context_collection_update\(\)/,
    );
    expect(sql).not.toMatch(/BEFORE\s+(?:UPDATE\s+OR\s+DELETE|DELETE)\s+ON editorial_context_collections/i);
    expect(sql).not.toMatch(/CREATE TRIGGER[\s\S]*?\bDELETE\b[\s\S]*?ON editorial_context_collections/i);
  });
});
