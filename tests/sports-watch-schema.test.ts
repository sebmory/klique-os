import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../db/migrations/20261026_sports_watch_v1.sql", import.meta.url),
  "utf8",
);

describe("sports watch additive schema", () => {
  it("isolates workspaces, prevents concurrent runs and keeps content versions", () => {
    expect(migration).toContain("sports_watch_runs_active_unique");
    expect(migration).toContain("WHERE status = 'running'");
    expect(migration).toContain("UNIQUE (workspace_id, athlete_id, logical_key, content_hash)");
    expect(migration).toContain("supersedes_candidate_id");
    expect(migration).toContain("factual_verification_status");
    expect(migration).toContain("admin_status");
  });
});
