import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "db/migrations/20261014_creative_profiles_v1.sql",
  "utf8",
);
const correctiveMigration = readFileSync(
  "db/migrations/20261015_creative_profiles_provenance.sql",
  "utf8",
);

describe("creative_profiles schema", () => {
  it("defines canonical UUID identities and strict domain statuses", () => {
    expect(migration).toMatch(/id UUID PRIMARY KEY/i);
    expect(migration).toMatch(/provenance TEXT NOT NULL DEFAULT 'form_application'/i);
    expect(migration).toMatch(/application_id UUID NULL/i);
    expect(migration).toContain("creative_type IN ('photographer', 'videographer', 'both')");
    expect(migration).toContain("status IN ('active', 'inactive')");
  });

  it("isolates application idempotence by workspace without legacy workspace foreign keys", () => {
    expect(migration).toContain("ON creative_profiles (workspace_id, application_id)");
    expect(migration).toContain("ON creative_profiles (workspace_id, id)");
    expect(migration).not.toContain("REFERENCES workspaces");
  });

  it("keeps name and email non-unique and source_row diagnostic", () => {
    expect(migration).not.toMatch(/UNIQUE\s*\([^)]*(?:display_name|contact_email)/i);
    expect(migration).not.toMatch(/CREATE UNIQUE INDEX[^;]*(?:display_name|contact_email)/i);
    expect(migration).toMatch(/source_row INTEGER NULL/i);
  });

  it("enforces conditional provenance fields without name or email matching", () => {
    expect(migration).toContain("provenance IN ('form_application', 'admin_manual')");
    expect(migration).toMatch(
      /provenance = 'form_application'[\s\S]*application_id IS NOT NULL[\s\S]*source_row IS NOT NULL[\s\S]*source_row > 1/i,
    );
    expect(migration).toMatch(
      /provenance = 'admin_manual'[\s\S]*application_id IS NULL[\s\S]*source_row IS NULL/i,
    );
    expect(migration).not.toMatch(/UNIQUE\s*\([^)]*(?:display_name|contact_email)/i);
  });

  it("provides an additive corrective migration for already-installed Local data", () => {
    expect(correctiveMigration).toMatch(/ADD COLUMN IF NOT EXISTS provenance TEXT/i);
    expect(correctiveMigration).toMatch(
      /UPDATE creative_profiles[\s\S]*SET provenance = 'form_application'[\s\S]*WHERE provenance IS NULL/i,
    );
    expect(correctiveMigration).toContain("ALTER COLUMN application_id DROP NOT NULL");
    expect(correctiveMigration).toContain("ALTER COLUMN source_row DROP NOT NULL");
    expect(correctiveMigration).toContain("provenance IN ('form_application', 'admin_manual')");
    expect(correctiveMigration).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP TABLE)\b/i);
  });

  it("contains contact, portfolio, coverage, specialties, bio and audit fields", () => {
    for (const field of [
      "contact_email",
      "phone",
      "website_url",
      "portfolio_url",
      "instagram",
      "city",
      "country",
      "coverage_areas",
      "specialties",
      "bio",
      "approved_by_clerk_user_id",
      "approved_at",
      "created_at",
      "updated_at",
    ]) {
      expect(migration).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });
});
