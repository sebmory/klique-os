import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "db/migrations/20261003_content_after_match_packs_v1.sql",
);

const readMigration = () => fs.readFileSync(migrationPath, "utf8");

describe("content after-match packs schema", () => {
  it("is transactional and replayable", () => {
    const sql = readMigration();

    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS content_after_match_packs");
    expect(sql.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/g)).toHaveLength(4);
  });

  it("uses the existing storage identifier and version types", () => {
    const sql = readMigration();

    expect(sql).toContain("id UUID PRIMARY KEY");
    expect(sql).toContain("workspace_id TEXT NOT NULL");
    expect(sql).toContain("user_id TEXT NOT NULL");
    expect(sql).toContain("media_id UUID NULL");
    expect(sql).toContain("source_document_id TEXT NOT NULL");
    expect(sql).toContain("source_document_storage_version INTEGER NOT NULL");
    expect(sql).toContain("source_document_version_id TEXT NOT NULL");
    expect(sql).toContain("source_document_updated_at TIMESTAMPTZ NOT NULL");
    expect(sql).toContain("reel_variant_id TEXT NULL");
    expect(sql).toContain("stories_variant_id TEXT NULL");
  });

  it("restricts pack, deliverable, and credit states", () => {
    const sql = readMigration();

    expect(sql).toContain("CHECK (pack_type = 'after_match')");
    expect(sql).toContain("CHECK (status IN ('pending', 'generating', 'partial', 'completed', 'failed'))");
    expect(sql).toContain("CHECK (reel_status IN ('pending', 'generating', 'completed', 'failed'))");
    expect(sql).toContain("CHECK (stories_status IN ('pending', 'generating', 'completed', 'failed'))");
    expect(sql).toContain("'refund_pending', 'refunded'");
  });

  it("enforces source uniqueness, attempt counts, and completed variant coherence", () => {
    const sql = readMigration();

    expect(sql).toContain("UNIQUE (workspace_id, source_document_id, source_document_storage_version)");
    expect(sql).toContain("CHECK (reel_attempt_count >= 0 AND stories_attempt_count >= 0)");
    expect(sql).toContain("CHECK ((reel_status = 'completed') = (reel_variant_id IS NOT NULL))");
    expect(sql).toContain("CHECK ((stories_status = 'completed') = (stories_variant_id IS NOT NULL))");
    expect(sql).toContain("CHECK ((status = 'completed') = (reel_status = 'completed' AND stories_status = 'completed'))");
  });

  it("stores only bounded safe error codes", () => {
    const sql = readMigration();

    expect(sql).toContain("reel_error_code VARCHAR(64) NULL");
    expect(sql).toContain("stories_error_code VARCHAR(64) NULL");
    expect(sql).toContain("reel_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'");
    expect(sql).toContain("stories_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'");
    expect(sql).not.toMatch(/error_(?:message|stack|prompt|payload)/i);
  });

  it("defines tenant-safe restrictive relationships", () => {
    const sql = readMigration();

    expect(sql).toContain("REFERENCES content_documents (workspace_id, id)");
    expect(sql).toContain("REFERENCES media_organizations (workspace_id, id)");
    expect(sql.match(/REFERENCES content_variants \(workspace_id, id\)/g)).toHaveLength(2);
    expect(sql.match(/ON DELETE RESTRICT/g)).toHaveLength(4);
    expect(sql).not.toContain("ON DELETE CASCADE");
  });

  it("defines document, tenant lookup, and stuck-generation indexes", () => {
    const sql = readMigration();

    expect(sql).toContain("content_after_match_packs_workspace_id_idx");
    expect(sql).toContain("ON content_after_match_packs (workspace_id, id)");
    expect(sql).toContain("content_after_match_packs_workspace_source_idx");
    expect(sql).toContain("ON content_after_match_packs (workspace_id, source_document_id, updated_at DESC)");
    expect(sql).toContain("content_after_match_packs_stuck_generating_idx");
    expect(sql).toContain("WHERE status = 'generating'");
  });
});