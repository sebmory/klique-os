import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../db/migrations/20261026_sports_watch_v1.sql", import.meta.url),
  "utf8",
);
const swissBindingsMigration = readFileSync(
  new URL("../db/migrations/20261026_sports_watch_swiss_bindings.sql", import.meta.url),
  "utf8",
);
const iwwfBindingsMigration = readFileSync(
  new URL("../db/migrations/20261026_sports_watch_iwwf_bindings.sql", import.meta.url),
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

  it("keeps Swiss bindings private, soft-deletable and unique while active", () => {
    expect(swissBindingsMigration).toContain("workspace_id TEXT NOT NULL");
    expect(swissBindingsMigration).toContain("UNIQUE (workspace_id, athlete_id)");
    expect(swissBindingsMigration).toContain("(workspace_id, official_player_id)");
    expect(swissBindingsMigration).toContain("(workspace_id, profile_uuid)");
    expect(swissBindingsMigration.match(/WHERE active/g)).toHaveLength(2);
    expect(swissBindingsMigration).toContain("disabled_at TIMESTAMPTZ NULL");
    expect(swissBindingsMigration).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it("keeps IWWF bindings private, soft-deletable and unique while active", () => {
    expect(iwwfBindingsMigration).toContain("workspace_id TEXT NOT NULL");
    expect(iwwfBindingsMigration).toContain("UNIQUE (workspace_id, athlete_id)");
    expect(iwwfBindingsMigration).toContain("(workspace_id, official_athlete_id)");
    expect(iwwfBindingsMigration).toContain("(workspace_id, profile_url)");
    expect(iwwfBindingsMigration.match(/WHERE active/g)).toHaveLength(2);
    expect(iwwfBindingsMigration).toContain("disabled_at TIMESTAMPTZ NULL");
    expect(iwwfBindingsMigration).not.toMatch(/\bINSERT\s+INTO\b/i);
  });
});
