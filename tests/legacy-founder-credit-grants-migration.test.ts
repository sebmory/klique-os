import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(process.cwd(), "db/migrations/20261012_legacy_founder_credit_grants.sql"),
  "utf8",
);

describe("legacy founder credit grants migration", () => {
  it("targets only twelve-month legacy Founder memberships", () => {
    expect(migration).toContain("membership.membership_kind = 'founder'");
    expect(migration).toContain("membership.source = 'legacy_founder_migration'");
    expect(migration).toContain("membership.ends_at = membership.starts_at + INTERVAL '12 months'");
    expect(migration).toContain("membership.ends_at IS NOT NULL");
  });

  it("adds one production and one custom_content plan grant with membership expiry", () => {
    expect(migration).toContain("('production'::TEXT)");
    expect(migration).toContain("('custom_content'::TEXT)");
    expect(migration).toMatch(/missing_grant\.credit_type,\s+1,\s+'plan_grant'/);
    expect(migration).toMatch(/'legacy_founder_grant:' \|\| missing_grant\.membership_id/);
    expect(migration).toMatch(/missing_grant\.ends_at,\s+NOW\(\)/);
  });

  it("is idempotent across workspace, athlete, membership and credit type", () => {
    expect(migration).toContain("existing.workspace_id = membership.workspace_id");
    expect(migration).toContain("existing.athlete_id = membership.athlete_id");
    expect(migration).toContain("existing.membership_id = membership.id");
    expect(migration).toContain("existing.credit_type = grant_row.credit_type");
    expect(migration).toContain("existing.source = 'plan_grant'");
    expect(migration).toContain("ON CONFLICT (workspace_id, athlete_id, membership_id, credit_type, reference_id)");
    expect(migration).toContain("DO NOTHING");
  });

  it("does not use the reserved PostgreSQL keyword grant as an alias", () => {
    expect(migration).not.toMatch(/\bFROM\s+missing_grants\s+grant\b/i);
    expect(migration).not.toMatch(/\bgrant\.(workspace_id|athlete_id|membership_id|credit_type|ends_at)\b/i);
  });

  it("does not update snapshots, existing movements or infer usage", () => {
    expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
    expect(migration).not.toMatch(/athlete_subscriptions|athlete_subscription_content_requests/i);
    expect(migration).not.toMatch(/google|shooting|production-[0-9]|'usage'/i);
  });
});
