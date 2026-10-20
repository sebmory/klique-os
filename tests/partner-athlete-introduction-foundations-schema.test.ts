import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "db",
  "migrations",
  "20261020_partner_athlete_introduction_foundations_v1.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const postgresBootstrap = fs.readFileSync(path.join(
  process.cwd(),
  "tests",
  "postgres",
  "partner-athlete-introduction-bootstrap.sql",
), "utf8");
const postgresTest = fs.readFileSync(path.join(
  process.cwd(),
  "tests",
  "postgres",
  "partner-athlete-introduction-repository.postgres.test.ts",
), "utf8");
const postgresVitestConfig = fs.readFileSync(path.join(
  process.cwd(),
  "tests",
  "postgres",
  "vitest.config.ts",
), "utf8");

describe("partner athlete introduction foundations schema", () => {
  it("is additive and never converts or removes historical data", () => {
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM\b/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE(?:\s+TABLE)?\b/im);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+contact_requests\b/i);
    expect(migration).toContain("'pending'");
    expect(migration).toContain("'in_progress'");
    expect(migration).toContain("'resolved'");
    expect(migration).toContain("flow_version SMALLINT NOT NULL DEFAULT 1");
  });

  it("keeps pending and awaiting requests unique regardless of moderation", () => {
    const unresolvedIndex = migration.match(
      /CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_unresolved_partner_athlete_unique_idx[\s\S]*?;/,
    )?.[0];
    expect(migration).toContain(
      "contact_requests_unresolved_partner_athlete_unique_idx",
    );
    expect(unresolvedIndex).toMatch(
      /status\s+IN\s+\('pending',\s*'awaiting_athlete'\)/,
    );
    expect(unresolvedIndex).not.toContain("moderation_status");
    expect(migration).toContain("Précontrôle requis avant unicité pending/awaiting_athlete");
  });

  it("guarantees workspace-coherent request relations", () => {
    expect(migration).toContain(
      "contact_requests_workspace_id_unique_idx",
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(workspace_id, request_id\)[\s\S]*REFERENCES contact_requests \(workspace_id, id\)/,
    );
  });

  it("provides append-only events, athlete reports and solicitation controls", () => {
    expect(migration).toContain("partner_solicitation_controls");
    expect(migration).toContain("partner_athlete_introduction_events");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("partner_athlete_introduction_reports");
    expect(migration).toContain("reported_by_clerk_user_id");
    expect(migration).toContain("handling_note");
  });

  it("prepares a workflow-specific protected and deduplicated outbox", () => {
    expect(migration).toContain(
      "partner_athlete_introduction_notification_outbox",
    );
    expect(migration).toContain(
      "UNIQUE (workspace_id, event_id, recipient_clerk_user_id)",
    );
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("source_type=partner_athlete_introduction_event");
    expect(migration).toContain("partner_athlete_introduction_outbox_payload_guard");
  });

  it("provides a guarded minimal PostgreSQL test bootstrap", () => {
    expect(postgresBootstrap).toContain(
      "current_database() <> 'klique_intro_test'",
    );
    expect(postgresBootstrap).toContain("partner_intro_test_guard");
    expect(postgresBootstrap).toContain("CREATE TABLE user_access");
    expect(postgresBootstrap).toContain("CREATE TABLE contact_requests");
    expect(postgresBootstrap).toContain("CREATE TABLE notifications");
    expect(postgresBootstrap).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
  });

  it("uses only explicit dedicated PostgreSQL test variables", () => {
    expect(postgresTest).toContain("KLIQUE_PARTNER_INTRO_PG_TEST_URL");
    expect(postgresTest).toContain("KLIQUE_PARTNER_INTRO_PG_TEST_HOST");
    expect(postgresTest).toContain("KLIQUE_PARTNER_INTRO_PG_TEST_GUARD");
    expect(postgresTest).not.toMatch(
      /process\.env\.(?:DATABASE_URL|POSTGRES_URL|POSTGRES_DATABASE_URL)/,
    );
    expect(postgresVitestConfig).toContain("envDir: false");
  });

  it("prepares deterministic PostgreSQL lock-wait observation", () => {
    expect(postgresTest).toContain("pg_blocking_pids(blocked.pid)");
    expect(postgresTest).toContain("blocked.wait_event_type = 'Lock'");
    expect(postgresTest).toContain('blocker.query("COMMIT")');
    expect(postgresTest).toContain('blocker.query("ROLLBACK")');
    expect(postgresTest).toContain("observer.end()");
    expect(postgresTest).toContain("observes creation waiting");
    expect(postgresTest).toContain("observes both response and moderation waiting");
  });
});
