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
const safvBindingsMigration = readFileSync(
  new URL("../db/migrations/20261026_sports_watch_safv_bindings.sql", import.meta.url),
  "utf8",
);
const manualImportsMigration = readFileSync(
  new URL("../db/migrations/20261026_sports_watch_manual_imports.sql", import.meta.url),
  "utf8",
);
const beBasketBindingsMigration = readFileSync(
  new URL("../db/migrations/20261027_sports_watch_bebasket_bindings.sql", import.meta.url),
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

  it("keeps SAFV bindings private, soft-deletable and additive", () => {
    expect(safvBindingsMigration).toContain("workspace_id TEXT NOT NULL");
    expect(safvBindingsMigration).toContain("UNIQUE (workspace_id, athlete_id)");
    expect(safvBindingsMigration).toContain("official_team_id TEXT NOT NULL");
    expect(safvBindingsMigration).toContain("league_id TEXT NOT NULL");
    expect(safvBindingsMigration).toContain("disabled_at TIMESTAMPTZ NULL");
    expect(safvBindingsMigration).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it("keeps manual imports private, bounded and linked to unverified candidates", () => {
    expect(manualImportsMigration).toContain("workspace_id TEXT NOT NULL");
    expect(manualImportsMigration).toContain("uploaded_by_clerk_user_id TEXT NOT NULL");
    expect(manualImportsMigration).toContain("content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')");
    expect(manualImportsMigration).toContain("size_bytes <= 10485760");
    expect(manualImportsMigration).toContain("candidate_id UUID NULL REFERENCES sports_watch_candidates(id)");
    expect(manualImportsMigration).toContain("UNIQUE (workspace_id, athlete_id, content_hash)");
    expect(manualImportsMigration).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it("prepares private and versioned BeBasket bindings without applying data", () => {
    expect(beBasketBindingsMigration).toContain("workspace_id TEXT NOT NULL");
    expect(beBasketBindingsMigration).toContain("UNIQUE (workspace_id, athlete_id)");
    expect(beBasketBindingsMigration).toContain("team_slug TEXT NOT NULL");
    expect(beBasketBindingsMigration).toContain("player_name_snapshot TEXT NOT NULL");
    expect(beBasketBindingsMigration).toContain("disabled_at TIMESTAMPTZ NULL");
    expect(beBasketBindingsMigration).not.toMatch(/\bINSERT\s+INTO\b/i);
  });
});
