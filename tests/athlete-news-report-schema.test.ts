import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../db/migrations/20261021_athlete_news_reports_v1.sql", import.meta.url),
  "utf8",
);

describe("athlete news report schema", () => {
  it("keeps reports isolated, idempotent and status-limited", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS athlete_news_reports");
    expect(migration).toContain("UNIQUE (workspace_id, submitted_by_clerk_user_id, client_request_id)");
    expect(migration).toContain("status IN ('new', 'preparing', 'processed')");
    expect(migration).toContain("athlete_news_reports_owner_idx");
  });

  it("stores only a complete validated optional photo descriptor", () => {
    expect(migration).toContain("(photo_blob_url IS NULL) = (photo_blob_pathname IS NULL)");
    expect(migration).toContain("photo_content_type IN ('image/jpeg', 'image/png', 'image/webp')");
    expect(migration).toContain("photo_size_bytes BETWEEN 1 AND 10485760");
  });
});
