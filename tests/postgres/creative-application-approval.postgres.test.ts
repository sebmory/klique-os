import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  approveCreativeApplication,
  type CreativeApplicationAdminServiceDependencies,
} from "@/lib/creatives/admin-application-service";
import {
  creativeApplicationBusinessHeaders,
  versionCreativeApplication,
  type CreativeApplication,
  type CreativeApplicationFields,
} from "@/lib/creatives/applications-sheet";
import { CreativeProfileRepository } from "@/lib/creatives/repository";

const databaseUrl = process.env.KLIQUE_CREATIVE_APPROVAL_PG_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const sql = databaseUrl
  ? neon(databaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;

const runId = randomUUID();
const workspaceId = `creative-approval-test-${runId}`;
const applicationId = randomUUID();
const rollbackApplicationId = randomUUID();
const rollbackProfileId = randomUUID();
const adminId = `admin-${runId}`;
const approvedAt = "2026-11-09T19:30:00.000Z";
const contactEmail = `${runId}@example.test`;

const blankFields = Object.fromEntries(
  Object.keys(creativeApplicationBusinessHeaders).map((field) => [field, ""]),
) as CreativeApplicationFields;

const application = versionCreativeApplication({
  applicationId,
  sourceRow: 6,
  fields: {
    ...blankFields,
    submittedAt: "46335.45586314815",
    fullName: "Fixture Forms",
    email: contactEmail,
    profile: "Photographe et vidéaste",
    portfolioUrl: "Ancienne référence disponible sur demande",
    travelRegions: "Vaud; Genève",
    sportsToCover: "Football, Athlétisme",
  },
  moderationStatus: "pending",
  creativeId: null,
  moderatedAt: null,
  moderatedBy: null,
  moderationNotes: null,
});

const cleanup = async () => {
  await sql.transaction([
    sql.query("ALTER TABLE creative_onboarding_events DISABLE TRIGGER USER"),
    sql.query(
      "DELETE FROM creative_onboarding_events WHERE workspace_id = $1",
      [workspaceId],
    ),
    sql.query(
      "DELETE FROM creative_access WHERE workspace_id = $1",
      [workspaceId],
    ),
    sql.query(
      "DELETE FROM creative_invitations WHERE workspace_id = $1",
      [workspaceId],
    ),
    sql.query(
      "DELETE FROM creative_profiles WHERE workspace_id = $1",
      [workspaceId],
    ),
    sql.query("ALTER TABLE creative_onboarding_events ENABLE TRIGGER USER"),
  ]);
};

const dependencies = (): CreativeApplicationAdminServiceDependencies => ({
  listApplications: vi.fn().mockResolvedValue([application]),
  findApplication: vi.fn().mockResolvedValue(application),
  updateModeration: vi.fn().mockImplementation(async (
    id: string,
    input,
  ): Promise<CreativeApplication> => versionCreativeApplication({
    ...application,
    applicationId: id,
    moderationStatus: input.status,
    creativeId: input.creativeId ?? null,
    moderatedAt: input.moderatedAt ?? null,
    moderatedBy: input.moderatedBy ?? null,
    moderationNotes: input.notes ?? null,
  })),
  createProfile:
    CreativeProfileRepository.createIdempotent.bind(CreativeProfileRepository),
  getProfileById: CreativeProfileRepository.getById.bind(CreativeProfileRepository),
  listProfilesByApplicationIds:
    CreativeProfileRepository.listByApplicationIds.bind(CreativeProfileRepository),
  now: () => new Date(approvedAt),
});

describePostgres("creative application approval PostgreSQL", () => {
  beforeAll(async () => {
    process.env.POSTGRES_DATABASE_URL = databaseUrl;
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = workspaceId;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("creates one canonical profile and one approval event across retries", async () => {
    const mocks = dependencies();

    const first = await approveCreativeApplication(
      workspaceId,
      applicationId,
      adminId,
      application.version,
      mocks,
    );
    const repeated = await approveCreativeApplication(
      workspaceId,
      applicationId,
      adminId,
      application.version,
      mocks,
    );

    expect(first.profile.id).toBe(repeated.profile.id);
    expect(first.profile).toMatchObject({
      workspaceId,
      provenance: "form_application",
      applicationId,
      sourceRow: 6,
      contactEmail,
      portfolioUrl: null,
    });

    const counts = await sql.query(`
      SELECT
        (SELECT count(*)::int FROM creative_profiles
         WHERE workspace_id = $1 AND application_id = $2::uuid) AS profiles,
        (SELECT count(*)::int FROM creative_onboarding_events
         WHERE workspace_id = $1
           AND creative_profile_id = $3::uuid
           AND event_type = 'application_approved') AS approval_events,
        (SELECT count(*)::int FROM creative_access
         WHERE workspace_id = $1 AND creative_profile_id = $3::uuid) AS access_rows,
        (SELECT count(*)::int FROM creative_invitations
         WHERE workspace_id = $1 AND creative_profile_id = $3::uuid) AS invitations
    `, [workspaceId, applicationId, first.profile.id]);

    expect(counts[0]).toEqual({
      profiles: 1,
      approval_events: 1,
      access_rows: 0,
      invitations: 0,
    });
  });

  it("rolls back a failed multi-write transaction without leaving a profile", async () => {
    await expect(sql.transaction([
      sql.query(`
        INSERT INTO creative_profiles (
          id, workspace_id, provenance, application_id, display_name, creative_type,
          contact_email, status, source_row, approved_by_clerk_user_id, approved_at,
          onboarding_status
        ) VALUES (
          $1::uuid, $2, 'form_application', $3::uuid, 'Rollback Fixture',
          'photographer', $4, 'active', 99, $5, NOW(), 'active'
        )
      `, [
        rollbackProfileId,
        workspaceId,
        rollbackApplicationId,
        `rollback-${contactEmail}`,
        adminId,
      ]),
      sql.query(`
        INSERT INTO creative_onboarding_events (
          workspace_id, creative_profile_id, event_type, from_status,
          to_status, actor_clerk_user_id
        ) VALUES ($1, $2::uuid, '', NULL, 'active', $3)
      `, [workspaceId, rollbackProfileId, adminId]),
    ])).rejects.toThrow();

    const rows = await sql.query(
      `SELECT count(*)::int AS count
       FROM creative_profiles
       WHERE workspace_id = $1 AND application_id = $2::uuid`,
      [workspaceId, rollbackApplicationId],
    );
    expect(rows[0]?.count).toBe(0);
  });
});
