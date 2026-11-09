import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkCreativeAccessFromInvitation } from "@/lib/clerk-access/service";
import { validateCreativeOnboarding } from "@/lib/creatives/onboarding";

const databaseUrl = process.env.KLIQUE_CREATIVE_ONBOARDING_PG_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const sql = databaseUrl
  ? neon(databaseUrl)
  : null as unknown as NeonQueryFunction<false, false>;
const runId = randomUUID();
const workspaceId = `creative-onboarding-test-${runId}`;
const otherWorkspaceId = `creative-onboarding-other-${runId}`;
const creativeProfileId = randomUUID();
const invitedProfileId = randomUUID();
const invitedApplicationId = randomUUID();
const creativeUserId = `creative-${runId}`;
const invitedCreativeUserId = `creative-invited-${runId}`;
const adminUserId = `admin-${runId}`;
const invitedEmail = `${runId}-invited@example.test`;

const cleanup = async () => {
  await sql.transaction([
    sql.query("ALTER TABLE creative_onboarding_events DISABLE TRIGGER USER"),
    sql.query(
      "DELETE FROM creative_onboarding_events WHERE workspace_id IN ($1, $2)",
      [workspaceId, otherWorkspaceId],
    ),
    sql.query(
      "DELETE FROM creative_access WHERE workspace_id IN ($1, $2)",
      [workspaceId, otherWorkspaceId],
    ),
    sql.query(
      "DELETE FROM creative_invitations WHERE workspace_id IN ($1, $2)",
      [workspaceId, otherWorkspaceId],
    ),
    sql.query(
      "DELETE FROM creative_profiles WHERE workspace_id IN ($1, $2)",
      [workspaceId, otherWorkspaceId],
    ),
    sql.query("ALTER TABLE creative_onboarding_events ENABLE TRIGGER USER"),
  ]);
};

describePostgres("creative onboarding PostgreSQL", () => {
  beforeAll(async () => {
    await cleanup();
    await sql.query(`
      INSERT INTO creative_profiles (
        id, workspace_id, provenance, display_name, creative_type, contact_email,
        portfolio_url, coverage_areas, specialties, bio, general_availability,
        status, approved_by_clerk_user_id, approved_at, onboarding_status,
        onboarding_submitted_at
      ) VALUES (
        $1::uuid, $2, 'admin_manual', 'Fixture Créative', 'both', $3,
        'https://portfolio.example', ARRAY['Vaud'], ARRAY['Football'],
        'Profil de validation.', 'Soirs et week-ends.', 'active', $4, NOW(),
        'pending_validation', NOW()
      )
    `, [creativeProfileId, workspaceId, `${runId}@example.test`, adminUserId]);
    await sql.query(`
      INSERT INTO creative_access (
        workspace_id, creative_profile_id, clerk_user_id, status,
        invitation_email, invited_by_clerk_user_id, activated_at
      ) VALUES ($1, $2::uuid, $3, 'active', $4, $5, NOW())
    `, [
      workspaceId,
      creativeProfileId,
      creativeUserId,
      `${runId}@example.test`,
      adminUserId,
    ]);
    await sql.query(`
      INSERT INTO creative_profiles (
        id, workspace_id, provenance, application_id, display_name, creative_type,
        contact_email, portfolio_url, coverage_areas, specialties, bio,
        general_availability, status, source_row, approved_by_clerk_user_id,
        approved_at, onboarding_status
      ) VALUES (
        $1::uuid, $2, 'form_application', $3::uuid, 'Fixture Forms', 'photographer',
        $4, 'https://forms-portfolio.example', ARRAY['Genève'], ARRAY['Athlétisme'],
        'Présentation Forms.', NULL, 'active', 42, $5, NOW(), 'active'
      )
    `, [
      invitedProfileId,
      workspaceId,
      invitedApplicationId,
      invitedEmail,
      adminUserId,
    ]);
    await sql.query(`
      INSERT INTO creative_invitations (
        workspace_id, creative_profile_id, email, clerk_invitation_id, status,
        invited_by_clerk_user_id
      ) VALUES ($1, $2::uuid, $3, $4, 'invited', $5)
    `, [
      workspaceId,
      invitedProfileId,
      invitedEmail,
      `invitation-${runId}`,
      adminUserId,
    ]);
  });

  afterAll(cleanup);

  it("isolates Admin validation by workspace and records the transition", async () => {
    await expect(validateCreativeOnboarding(
      otherWorkspaceId,
      creativeProfileId,
      adminUserId,
    )).resolves.toBe("not_found");

    await expect(validateCreativeOnboarding(
      workspaceId,
      creativeProfileId,
      adminUserId,
    )).resolves.toBe("validated");

    const profiles = await sql.query(
      `SELECT onboarding_status, onboarding_validated_at
       FROM creative_profiles
       WHERE workspace_id = $1 AND id = $2::uuid`,
      [workspaceId, creativeProfileId],
    );
    const events = await sql.query(
      `SELECT event_type, from_status, to_status, actor_clerk_user_id
       FROM creative_onboarding_events
       WHERE workspace_id = $1 AND creative_profile_id = $2::uuid`,
      [workspaceId, creativeProfileId],
    );

    expect(profiles[0]).toMatchObject({
      onboarding_status: "active",
    });
    expect(profiles[0]?.onboarding_validated_at).toBeTruthy();
    expect(events).toEqual([expect.objectContaining({
      event_type: "admin_validated",
      from_status: "pending_validation",
      to_status: "active",
      actor_clerk_user_id: adminUserId,
    })]);
  });

  it("keeps onboarding events immutable", async () => {
    await expect(sql.query(
      `UPDATE creative_onboarding_events
       SET event_type = 'tampered'
       WHERE workspace_id = $1 AND creative_profile_id = $2::uuid`,
      [workspaceId, creativeProfileId],
    )).rejects.toThrow(/immutable/i);
  });

  it("reconciles an existing sent invitation with its Forms profile", async () => {
    const before = await sql.query(
      `SELECT provenance, application_id, source_row, display_name, portfolio_url,
              coverage_areas, specialties, bio
       FROM creative_profiles
       WHERE workspace_id = $1 AND id = $2::uuid`,
      [workspaceId, invitedProfileId],
    );

    await expect(linkCreativeAccessFromInvitation(invitedCreativeUserId, {
      publicMetadata: {
        role: "creative",
        workspaceId,
        creativeProfileId: invitedProfileId,
      },
      emailAddresses: [{
        emailAddress: invitedEmail,
        verification: { status: "verified" },
      }],
    })).resolves.toMatchObject({
      creativeProfileId: invitedProfileId,
      clerkUserId: invitedCreativeUserId,
    });

    const profileAfter = await sql.query(
      `SELECT provenance, application_id, source_row, display_name, portfolio_url,
              coverage_areas, specialties, bio, onboarding_status
       FROM creative_profiles
       WHERE workspace_id = $1 AND id = $2::uuid`,
      [workspaceId, invitedProfileId],
    );
    const invitationAfter = await sql.query(
      `SELECT status, accepted_clerk_user_id
       FROM creative_invitations
       WHERE workspace_id = $1 AND creative_profile_id = $2::uuid`,
      [workspaceId, invitedProfileId],
    );
    const profileCount = await sql.query(
      `SELECT count(*)::int AS count
       FROM creative_profiles
       WHERE workspace_id = $1 AND lower(btrim(contact_email)) = lower(btrim($2))`,
      [workspaceId, invitedEmail],
    );

    expect(profileAfter[0]).toEqual({
      ...before[0],
      onboarding_status: "account_created",
    });
    expect(invitationAfter[0]).toMatchObject({
      status: "accepted",
      accepted_clerk_user_id: invitedCreativeUserId,
    });
    expect(profileCount[0]?.count).toBe(1);
  });
});
