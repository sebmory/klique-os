import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "db/migrations/20261007_story_studio_brand_kits_workspace_compatibility.sql",
  "utf8",
);

describe("Story Studio Brand Kit workspace compatibility migration", () => {
  it("removes only the incompatible workspace foreign key", () => {
    expect(migration).toContain("ALTER TABLE story_studio_brand_kits");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS story_studio_brand_kits_workspace_fkey");
    expect(migration).not.toMatch(/\b(?:DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
  });
});