import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = path.resolve(process.cwd(), "db/migrations/20260808_content_storage_foundation.sql");

describe("content storage schema foundation", () => {
  it("defines required tables", () => {
    const sql = fs.readFileSync(schemaPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS content_documents");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS content_generation_sessions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS content_variants");
  });

  it("defines required indexes", () => {
    const sql = fs.readFileSync(schemaPath, "utf8");

    expect(sql).toContain("UNIQUE (workspace_id, id)");
    expect(sql).toContain("content_documents_workspace_id_updated_at_idx");
    expect(sql).toContain("content_generation_sessions_workspace_id_session_id_idx");
    expect(sql).toContain("content_generation_sessions_expires_at_idx");
    expect(sql).toContain("content_variants_workspace_id_source_document_id_idx");
    expect(sql).toContain("content_variants_workspace_id_id_unique");
  });
});
