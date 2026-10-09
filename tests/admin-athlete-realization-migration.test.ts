import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.resolve(
  process.cwd(), "db/migrations/20261013_admin_membership_realization_reversals.sql",
), "utf8");
const ledgerMigration = fs.readFileSync(path.resolve(
  process.cwd(), "db/migrations/20260901_athlete_credit_catalog_v1.sql",
), "utf8");
const normalizedMigration = migration.replace(/\r\n/g, "\n");

describe("Admin realization migration contracts (migration not executed)", () => {
  it("wraps every schema and data change in one explicit transaction", () => {
    const statements = migration.trim();
    expect(statements.startsWith("BEGIN;")).toBe(true);
    expect(statements.endsWith("COMMIT;")).toBe(true);
    expect(statements.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(statements.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(statements.indexOf("BEGIN;")).toBeLessThan(statements.indexOf("ALTER TABLE"));
    expect(statements.lastIndexOf("COMMIT;")).toBeGreaterThan(statements.lastIndexOf("COMMENT ON"));
  });

  it("backfills only exact server metadata plus coherent dates, product, snapshot and usage", () => {
    expect(migration).toContain("is_admin_membership_realization BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration).toContain("WHERE is_identifiable_admin_membership_realization(realization)");
    for (const guard of [
      "realization.fulfillment_mode = 'included_right'", "realization.status = 'completed'",
      "realization.snapshot_credit_quantity = 1", "realization.purchase_id IS NULL",
      "realization.requested_at = realization.scheduled_at",
      "realization.started_at = realization.completed_at",
      "realization.created_at = realization.updated_at",
      "jsonb_typeof(realization.requested_details->'historicalRealizationAt') = 'string'",
      "jsonb_typeof(realization.requested_details->'recordedByClerkUserId') = 'string'",
      "- 'message' - 'historicalRealizationAt' - 'recordedByClerkUserId' = '{}'::jsonb",
      "usage.id = realization.usage_movement_id", "usage.quantity = -1", "usage.source = 'usage'",
      "usage.created_at = realization.created_at", "usage.expires_at IS NULL",
      "usage.workspace_id = realization.workspace_id", "usage.athlete_id = realization.athlete_id",
      "membership.workspace_id = usage.workspace_id", "membership.athlete_id = usage.athlete_id",
      "realization.completed_at >= membership.starts_at",
      "realization.product_code = CASE usage.credit_type",
    ]) expect(migration).toContain(guard);
    const updates = [...migration.matchAll(/\bUPDATE\s+(\w+)\s+\w+\s+SET\s+([\s\S]*?)\s+WHERE/g)];
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toBe("athlete_service_requests");
    expect(updates[0][2]).toBe("is_admin_membership_realization = TRUE");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b|\bUPDATE\s+athlete_credit_movements\b/);
  });

  it("requires exactly one append-only compensation with a unique explicit FK", () => {
    expect(migration).toContain("REFERENCES athlete_service_requests (id) ON DELETE RESTRICT");
    expect(migration).toContain("CREATE UNIQUE INDEX athlete_credit_movements_realization_reversal_unique_idx");
    expect(migration).toContain("ON athlete_credit_movements (reversal_realization_id)");
    expect(migration).toContain("(source = 'usage_reversal' AND quantity = 1)");
    expect(migration).toContain("length(cancellation_reason) BETWEEN 1 AND 2000");
    expect(migration).toContain("cancellation_reason ~ '[^[:space:]]'");
    expect(migration).toContain("cancelled_by_clerk_user_id ~ '[^[:space:]]'");
    expect(migration).toContain("AND expires_at IS NULL");
    expect(migration).toContain("AND reversal_realization_id IS NULL");
    expect(migration).toContain("AND cancellation_reason IS NULL");
    expect(migration).toContain("AND cancelled_by_clerk_user_id IS NULL");
    expect(ledgerMigration).toContain("BEFORE UPDATE OR DELETE ON athlete_credit_movements");
    expect(migration).not.toContain("DROP TRIGGER");
  });

  it("replaces only the three exact source constraints without weakening their existing rules", () => {
    const droppedConstraints = [...migration.matchAll(/\bDROP CONSTRAINT\s+([a-z0-9_]+)/g)]
      .map((match) => match[1]);
    expect(droppedConstraints).toEqual([
      "athlete_credit_movements_source_check",
      "athlete_credit_movements_check",
      "athlete_credit_movements_check1",
    ]);
    expect(new Set(droppedConstraints).size).toBe(3);

    expect(normalizedMigration).toContain(
      "ADD CONSTRAINT athlete_credit_movements_source_check\n"
      + "    CHECK (source IN ('plan_grant', 'admin_adjustment', 'purchase', 'usage', 'usage_reversal'))",
    );
    expect(normalizedMigration).toContain(
      "ADD CONSTRAINT athlete_credit_movements_check CHECK (\n"
      + "    (source IN ('plan_grant', 'purchase') AND quantity > 0)\n"
      + "    OR (source = 'usage' AND quantity < 0)\n"
      + "    OR source = 'admin_adjustment'\n"
      + "    OR (source = 'usage_reversal' AND quantity = 1)\n"
      + "  )",
    );
    expect(normalizedMigration).toContain(
      "ADD CONSTRAINT athlete_credit_movements_check1\n"
      + "    CHECK (source NOT IN ('plan_grant', 'purchase') OR expires_at IS NOT NULL)",
    );

    for (const unchangedRule of [
      "(source IN ('plan_grant', 'purchase') AND quantity > 0)",
      "(source = 'usage' AND quantity < 0)",
      "OR source = 'admin_adjustment'",
      "source NOT IN ('plan_grant', 'purchase') OR expires_at IS NOT NULL",
    ]) {
      expect(ledgerMigration).toContain(unchangedRule);
      expect(migration).toContain(unchangedRule);
    }
    for (const existingSource of ["plan_grant", "admin_adjustment", "purchase", "usage"]) {
      expect(ledgerMigration).toContain(`'${existingSource}'`);
      expect(migration).toContain(`'${existingSource}'`);
    }
  });

  it("cannot discover or delete CHECK constraints broadly", () => {
    expect(migration).not.toMatch(/\bDO\s+\$\$/);
    expect(migration).not.toContain("pg_constraint");
    expect(migration).not.toContain("pg_get_constraintdef");
    expect(migration).not.toContain("EXECUTE format");
    expect(migration).not.toMatch(/DROP CONSTRAINT\s+IF EXISTS/i);
    expect(migration).not.toMatch(/DROP CONSTRAINT[^\n;]*\bLIKE\b/i);
    expect(migration).not.toMatch(/DROP CONSTRAINT[^\n;]*~\s*['"].*source/i);
  });

  it("leaves every unrelated CHECK, index and immutability trigger intact", () => {
    for (const constraint of [
      "athlete_credit_movements_credit_type_check",
      "athlete_credit_movements_quantity_check",
      "athlete_credit_movements_check2",
      "athlete_credit_movements_check3",
      "athlete_credit_movements_check4",
    ]) {
      expect(migration).not.toMatch(new RegExp(`DROP CONSTRAINT ${constraint}(?:[,;\\s]|$)`));
    }
    expect(migration).not.toMatch(/\bDROP INDEX\b/i);
    expect(migration).not.toMatch(/\bDROP TRIGGER\b/i);
    expect(migration).not.toMatch(/\bDROP FUNCTION\b/i);
    expect(migration).not.toMatch(/\bALTER TABLE athlete_credit_movements\s+DISABLE TRIGGER\b/i);
    expect(migration).not.toMatch(/\bALTER TABLE athlete_credit_movements\s+DROP COLUMN\b/i);

    for (const preservedDefinition of [
      "credit_type TEXT NOT NULL CHECK (credit_type IN ('production', 'custom_content'))",
      "quantity INTEGER NOT NULL CHECK (quantity <> 0)",
      "CHECK (btrim(workspace_id) <> '')",
      "CHECK (btrim(athlete_id) <> '')",
      "CHECK (reference_id IS NULL OR btrim(reference_id) <> '')",
      "CREATE INDEX IF NOT EXISTS athlete_credit_movements_workspace_athlete_type_idx",
      "CREATE INDEX IF NOT EXISTS athlete_credit_movements_membership_idx",
      "CREATE INDEX IF NOT EXISTS athlete_credit_movements_expires_at_idx",
      "CREATE TRIGGER athlete_credit_movements_immutable",
      "BEFORE UPDATE OR DELETE ON athlete_credit_movements",
    ]) expect(ledgerMigration).toContain(preservedDefinition);
  });

  it("protects original marked requests and validates all reversal scopes and type", () => {
    expect(migration).toContain("IF OLD.is_admin_membership_realization THEN");
    expect(migration).toContain("Ordinary requests cannot become Admin realizations");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON athlete_service_requests");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    for (const field of ["workspace_id", "athlete_id", "membership_id", "credit_type"]) {
      expect(migration).toContain(`usage.${field} = NEW.${field}`);
    }
    expect(migration).toContain("realization.is_admin_membership_realization");
    expect(migration).toContain("realization.id = NEW.reversal_realization_id");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).not.toContain("ALTER TABLE athlete_subscription_content_requests");
    expect(migration).not.toContain("ALTER TABLE membership_plans");
  });
});
