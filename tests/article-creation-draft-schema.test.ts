import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "db/migrations/20261021_article_creation_drafts_v1.sql",
  "utf8",
).replace(/\s+/g, " ");

describe("Article creation draft schema", () => {
  it("keeps private ownership, optimistic versions and idempotent creation", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS article_creation_drafts");
    expect(migration).toContain("UNIQUE (workspace_id, clerk_user_id, client_creation_id)");
    expect(migration).toContain("role TEXT NOT NULL CHECK (role IN ('admin', 'media'))");
    expect(migration).toContain("version INTEGER NOT NULL DEFAULT 1");
    expect(migration).toContain("subject_name TEXT NOT NULL");
    expect(migration).toContain("step_id TEXT NOT NULL");
    expect(migration).toContain("deleted_at TIMESTAMPTZ NULL");
    expect(migration).toContain("WHERE deleted_at IS NULL");
  });
});
