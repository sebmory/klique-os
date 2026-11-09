import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../db/migrations/20261110_creative_onboarding_v1.sql",
  import.meta.url,
);

describe("creative onboarding schema", () => {
  it("extends the canonical profile and invitation tables without replacing them", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql).toContain("ALTER TABLE creative_profiles");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS onboarding_status");
    expect(sql).toContain("ALTER TABLE creative_invitations");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS admin_message");
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS creative_(profiles|access|invitations)/);
  });

  it("keeps an immutable append-only transition journal", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS creative_onboarding_events");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS creative_profiles_workspace_id_id_idx");
    expect(sql).toContain("ON creative_profiles (workspace_id, id)");
    expect(sql).toContain("FOREIGN KEY (workspace_id, creative_profile_id)");
    expect(sql).toContain("REFERENCES creative_profiles (workspace_id, id)");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON creative_onboarding_events");
    expect(sql).toContain("creative_onboarding_events is immutable");
  });

  it("backfills existing profiles before making the onboarding state required", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const backfill = sql.indexOf("UPDATE creative_profiles");
    const notNull = sql.indexOf("ALTER COLUMN onboarding_status SET NOT NULL");

    expect(backfill).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(backfill);
  });
});
