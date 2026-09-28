import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("db/migrations/20261005_story_studio_photos_v1.sql", "utf8")
  .replace(/\s+/g, " ");

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
});