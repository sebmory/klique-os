import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("db/migrations/20261005_story_studio_photos_v1.sql", "utf8")
  .replace(/\s+/g, " ");
const logoConstraintsMigration = readFileSync(
  "db/migrations/20261009_story_studio_brand_kit_logo_constraints.sql",
  "utf8",
).replace(/\s+/g, " ").trim();

describe("Story Studio photo schema", () => {
  it("stores ownership, optional athlete and complete Blob metadata", () => {
    expect(migration).toContain("workspace_id TEXT NOT NULL");
    expect(migration).toContain("user_id TEXT NOT NULL");
    expect(migration).toContain("media_id UUID NULL");
    expect(migration).toContain("athlete_id TEXT NULL");
    expect(migration).toContain("blob_url TEXT NOT NULL");
    expect(migration).toContain("width_px INTEGER NOT NULL");
    expect(migration).toContain("height_px INTEGER NOT NULL");
    expect(migration).toContain("size_bytes BIGINT NOT NULL");
  });

  it("allows only validated Studio Blob photos", () => {
    expect(migration).toContain("blob_url ~ '^https://[^/]+\\.blob\\.vercel-storage\\.com/'");
    expect(migration).toContain("blob_pathname ~ '^story-studio/photos/'");
    expect(migration).toContain("content_type IN ('image/jpeg', 'image/png', 'image/webp')");
    expect(migration).toContain("width_px BETWEEN 320 AND 8192");
    expect(migration).toContain("height_px BETWEEN 320 AND 8192");
    expect(migration).toContain("size_bytes BETWEEN 1 AND 10485760");
  });

  it("aligns final constraints for ordinary photos and Brand Kit logos", () => {
    expect(logoConstraintsMigration).toMatch(/^BEGIN;/);
    expect(logoConstraintsMigration).toMatch(/COMMIT;$/);
    expect(logoConstraintsMigration).toContain("DROP CONSTRAINT IF EXISTS story_studio_photos_blob_pathname_check");
    expect(logoConstraintsMigration).toContain("DROP CONSTRAINT IF EXISTS story_studio_photos_width_check");
    expect(logoConstraintsMigration).toContain("DROP CONSTRAINT IF EXISTS story_studio_photos_height_check");
    expect(logoConstraintsMigration).toContain("DROP CONSTRAINT IF EXISTS story_studio_photos_size_check");
    expect(logoConstraintsMigration).toContain("blob_pathname ~ '^story-studio/photos/.+$'");
    expect(logoConstraintsMigration).toContain("blob_pathname ~ '^story-studio/brand-kit-logos/.+$'");
    expect(logoConstraintsMigration).toContain("width_px BETWEEN 320 AND 8192");
    expect(logoConstraintsMigration).toContain("height_px BETWEEN 320 AND 8192");
    expect(logoConstraintsMigration).toContain("width_px BETWEEN 128 AND 8192");
    expect(logoConstraintsMigration).toContain("height_px BETWEEN 128 AND 8192");
    expect(logoConstraintsMigration.match(/size_bytes BETWEEN 1 AND 26214400/g)).toHaveLength(2);
  });
});