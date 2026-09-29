import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseMigration = readFileSync(
  "db/migrations/20261010_story_studio_frame_models_v1.sql",
  "utf8",
);
const compatibilityMigration = readFileSync(
  "db/migrations/20261011_story_studio_frame_models_workspace_compatibility.sql",
  "utf8",
);

describe("Story Studio frame model workspace compatibility", () => {
  it("allows creation for an authenticated workspace absent from the legacy workspaces table", () => {
    expect(baseMigration).toContain("workspace_id TEXT NOT NULL");
    expect(baseMigration).not.toContain("REFERENCES workspaces");
    expect(compatibilityMigration).toContain("ALTER TABLE story_studio_frame_models");
    expect(compatibilityMigration).toContain("DROP CONSTRAINT IF EXISTS story_studio_frame_models_workspace_fkey");
    expect(compatibilityMigration).not.toMatch(/\b(?:DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
  });
});