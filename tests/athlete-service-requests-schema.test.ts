import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = path.resolve(process.cwd(), "db/migrations/20260902_athlete_service_requests_v1.sql");
const paidWithRightMigrationPath = path.resolve(
  process.cwd(),
  "db/migrations/20260902_athlete_service_requests_paid_with_right.sql",
);

describe("athlete service requests schema", () => {
  it("defines the request workflow without creating business records", () => {
    const sql = fs.readFileSync(schemaPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS athlete_service_requests");
    expect(sql).toContain("'included_right', 'paid_extra', 'no_charge'");
    expect(sql).toContain("'received',");
    expect(sql).toContain("'to_confirm',");
    expect(sql).toContain("'scheduled',");
    expect(sql).toContain("'in_progress',");
    expect(sql).toContain("'completed',");
    expect(sql).toContain("'refused'");
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });

  it("links requests to existing athlete service structures", () => {
    const sql = fs.readFileSync(schemaPath, "utf8");

    expect(sql).toContain("REFERENCES athlete_service_products (code) ON DELETE RESTRICT");
    expect(sql).toContain("REFERENCES athlete_credit_purchases (id) ON DELETE RESTRICT");
    expect(sql).toContain("REFERENCES athlete_credit_movements (id) ON DELETE RESTRICT");
    expect(sql).toContain("athlete_service_requests_mode_snapshot_check");
    expect(sql).toContain("athlete_service_requests_final_link_check");
    expect(sql).toContain("athlete_service_requests_status_dates_check");
  });

  it("defines workflow and idempotency indexes", () => {
    const sql = fs.readFileSync(schemaPath, "utf8");

    expect(sql).toContain("athlete_service_requests_workspace_athlete_status_idx");
    expect(sql).toContain("athlete_service_requests_product_status_idx");
    expect(sql).toContain("athlete_service_requests_purchase_unique_idx");
    expect(sql).toContain("athlete_service_requests_usage_movement_unique_idx");
    expect(sql).toContain("athlete_credit_movements_service_request_usage_unique_idx");
    expect(sql).toContain("WHERE source = 'usage' AND reference_id LIKE 'athlete_service_request:%'");
    expect(sql).toContain("athlete_credit_purchase_executions_request_unique_idx");
    expect(sql).toContain("WHERE reference_id LIKE 'athlete_service_request:%'");
  });

  it("documents calculated reservations without storing a balance", () => {
    const sql = fs.readFileSync(schemaPath, "utf8");

    expect(sql).toContain("les droits réservés seront calculés ultérieurement depuis les demandes scheduled et in_progress, sans stocker de solde");
    expect(sql).toContain("La création d une demande ne crée aucun achat, paiement, mouvement de crédit ni exécution");
  });

  it("adds paid_with_right without changing the existing fulfillment modes", () => {
    const sql = fs.readFileSync(paidWithRightMigrationPath, "utf8");

    expect(sql).toContain("'included_right', 'paid_extra', 'no_charge', 'paid_with_right'");
    expect(sql).toContain("fulfillment_mode = 'included_right'");
    expect(sql).toContain("fulfillment_mode = 'paid_extra'");
    expect(sql).toContain("fulfillment_mode = 'no_charge'");
    expect(sql).toContain("fulfillment_mode = 'paid_with_right'");
    expect(sql).toContain("snapshot_credit_type IS NOT NULL");
    expect(sql).toContain("snapshot_credit_quantity IS NOT NULL");
    expect(sql).toContain("snapshot_price_chf > 0");
  });

  it("keeps paid_with_right unlinked before completion and when refused", () => {
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    const sql = fs.readFileSync(paidWithRightMigrationPath, "utf8");

    expect(schemaSql).toContain("'refused'");
    expect(sql).toContain("status <> 'completed'");
    expect(sql).toContain("usage_movement_id IS NULL");
    expect(sql).toContain("fulfillment_mode <> 'paid_with_right' OR purchase_id IS NULL");
  });

  it("requires both final links for a completed paid_with_right request", () => {
    const sql = fs.readFileSync(paidWithRightMigrationPath, "utf8");

    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain(
      "fulfillment_mode = 'paid_with_right' AND purchase_id IS NOT NULL AND usage_movement_id IS NOT NULL",
    );
  });

  it("replaces only the three affected constraints idempotently", () => {
    const sql = fs.readFileSync(paidWithRightMigrationPath, "utf8");
    const constraintNames = [
      "athlete_service_requests_fulfillment_mode_check",
      "athlete_service_requests_mode_snapshot_check",
      "athlete_service_requests_final_link_check",
    ];

    for (const constraintName of constraintNames) {
      expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${constraintName}`);
      expect(sql).toContain(`ADD CONSTRAINT ${constraintName}`);
    }
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });
});
