import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "db/migrations/20261020_partner_invitation_recovery_v1.sql";
const migration = readFileSync(migrationPath, "utf8");
const normalizedMigration = migration.replace(/\r\n/g, "\n");

describe("partner invitation recovery migration", () => {
  it("runs after the installed October 15-19 migrations in one transaction", () => {
    expect(migrationPath).toContain("20261020_");
    expect(migration.trim().startsWith("BEGIN;")).toBe(true);
    expect(migration.trim().endsWith("COMMIT;")).toBe(true);
    expect(migration.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(migration.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("adds a recoverable local intent without deleting historical data", () => {
    expect(normalizedMigration).toContain("ALTER COLUMN clerk_invitation_id DROP NOT NULL");
    expect(normalizedMigration).toContain("ALTER COLUMN invited_by_clerk_user_id DROP NOT NULL");
    expect(normalizedMigration).toContain("ADD COLUMN IF NOT EXISTS clerk_invitation_attempt_id UUID NULL");
    expect(normalizedMigration).toContain("ADD COLUMN IF NOT EXISTS clerk_creation_started_at TIMESTAMPTZ NULL");
    expect(normalizedMigration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS partner_invitations_attempt_unique_idx");
    expect(normalizedMigration).toContain("WHERE clerk_invitation_attempt_id IS NOT NULL");
    expect(migration).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
  });

  it("requires every invitation-less row to carry an attempt id", () => {
    expect(normalizedMigration).toContain(
      "ADD CONSTRAINT partner_invitations_invitation_or_attempt_check\n"
      + "    CHECK (\n"
      + "      clerk_invitation_id IS NOT NULL\n"
      + "      OR clerk_invitation_attempt_id IS NOT NULL\n"
      + "    )",
    );
  });

  it("requires a creation timestamp to reference an invitation attempt", () => {
    expect(normalizedMigration).toContain(
      "ADD CONSTRAINT partner_invitations_creation_attempt_check\n"
      + "    CHECK (\n"
      + "      clerk_creation_started_at IS NULL\n"
      + "      OR clerk_invitation_attempt_id IS NOT NULL\n"
      + "    )",
    );
  });

  it("allows an unknown inviter only for an accepted Clerk invitation", () => {
    expect(normalizedMigration).toContain(
      "ADD CONSTRAINT partner_invitations_unknown_inviter_check\n"
      + "    CHECK (\n"
      + "      invited_by_clerk_user_id IS NOT NULL\n"
      + "      OR (\n"
      + "        status = 'accepted'\n"
      + "        AND clerk_invitation_id IS NOT NULL\n"
      + "      )\n"
      + "    )",
    );
  });

  it("keeps historical and normal Admin rows valid while rejecting malformed intents", () => {
    const isValid = (row: {
      invitationId: string | null;
      attemptId: string | null;
      creationStartedAt: string | null;
      inviterId: string | null;
      status: "invited" | "accepted" | "revoked";
    }) =>
      (row.invitationId !== null || row.attemptId !== null)
      && (row.creationStartedAt === null || row.attemptId !== null)
      && (
        row.inviterId !== null
        || (row.status === "accepted" && row.invitationId !== null)
      );

    expect(isValid({
      invitationId: "inv_historical",
      attemptId: null,
      creationStartedAt: null,
      inviterId: "user_admin",
      status: "invited",
    })).toBe(true);
    expect(isValid({
      invitationId: null,
      attemptId: "11111111-1111-4111-8111-111111111111",
      creationStartedAt: null,
      inviterId: "user_admin",
      status: "invited",
    })).toBe(true);
    expect(isValid({
      invitationId: "inv_accepted",
      attemptId: null,
      creationStartedAt: null,
      inviterId: null,
      status: "accepted",
    })).toBe(true);
    expect(isValid({
      invitationId: null,
      attemptId: null,
      creationStartedAt: null,
      inviterId: "user_admin",
      status: "invited",
    })).toBe(false);
    expect(isValid({
      invitationId: "inv_pending",
      attemptId: null,
      creationStartedAt: null,
      inviterId: null,
      status: "invited",
    })).toBe(false);
  });
});
